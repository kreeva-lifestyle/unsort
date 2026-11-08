// The crawler (tools/pb-telegram-crawler) — header x-crawler-key, whose sha-256
// must equal pb_tg_secrets.crawler_key_hash (key made in Settings → Telegram).
//   crawler_config   → { ok, now, group_chat_id, group_title, window: { start, end },
//                        channels: [{ vendor_id, vendor_name, username, channel_id, last_id,
//                                     slot_minute, due, next_check_at, checked_at, cursor_ready,
//                                     vendor_ready }] }
//                      sorted by daily time. `due` comes from schedule.ts (the one
//                      place the rule lives); the crawler checks one due channel at a time.
//   crawler_progress { version, error?, channels: [{ username, channel_id, title, last_id, error?,
//                      cursor_ready?, checked?, sent? }],
//                      forwarded?: [{ group_message_id, channel_id, message_id }] } → { ok, mapped }
//     cursor_ready: true + last_id → pb_vendors.tg_cursor_ready (the newest post id is noted);
//     checked: true → pb_vendors.tg_checked_at = now (a daily check finished);
//     sent         → how many messages that check forwarded (shown in Settings).
// `forwarded` says which vendor channel post each new group message is: stored
// by pb_tg_map_forwards, it overrides forward_origin (a repost names the
// supplier's channel there, not the vendor's).
// Channel ids are in Bot API form (-100…); a positive GramJS id is converted.
// A channel reported without last_id / title / id keeps the ones stored before;
// a channel left out of the list keeps its stored entry; no `channels` at all
// (a report before the first cycle) only marks the crawler alive.
// vendor_ready = pb_vendors.tg_cursor_ready: false tells the crawler to drop
// a cursor it still holds (the vendor was reset) and note a fresh one.
import { enc, nowIso, patch, sel } from '../pb-products/db.ts';
import { HttpError, plain } from '../pb-products/http.ts';
import { dueInfo, offsetOf, WINDOW_DEFAULT } from './schedule.ts';
import { type CrawlerChannel, config, rpc, saveConfig, secrets, sha256 } from './tg.ts';
import { HEX64, same } from './webhook.ts';

let hashAt = 0, hash: string | null = null, missAt = 0;
/** The key's sha-256 against the stored hash (cached a minute; a miss re-reads at most every 5 s). */
export async function crawlerOk(req: Request): Promise<boolean> {
  const key = req.headers.get('x-crawler-key') || '';
  if (!HEX64.test(key)) return false;
  const h = await sha256(key);
  const fresh = Date.now() - hashAt < 60_000;
  if (fresh && hash && same(h, hash)) return true;
  if (fresh && Date.now() - missAt < 5_000) return false;
  missAt = Date.now();
  hash = (await secrets()).crawler_key_hash; hashAt = Date.now();
  return !!hash && same(h, hash);
}
/** A new key was just made: the old one must stop working at once. */
export const resetKeyCache = () => { hash = null; hashAt = 0; missAt = 0; };

/** "@Name", "t.me/name", "https://t.me/name" → "name" (null when not a valid username). */
export function cleanUsername(v: unknown): string | null {
  const s = String(v ?? '').trim().replace(/^https?:\/\//i, '').replace(/^(www\.)?t(elegram)?\.me\//i, '').replace(/^@/, '').split(/[/?#]/)[0].toLowerCase();
  return /^[a-z0-9_]{4,32}$/.test(s) ? s : null;
}

/** Bot API channel id (-100xxxxxxxxxx). */
export function botApiId(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n === 0) return null;
  return n > 0 ? -1_000_000_000_000 - n : n;
}

const txt = (v: unknown, n: number) => (v === null || v === undefined || v === '' ? null : String(v).slice(0, n));

interface VendorTg { id: string; name: string; tg_username: string | null; tg_channel_id: number | null; tg_title: string | null }
interface VendorSlot extends VendorTg { tg_slot_minute: number | null; tg_slot_set_at: string | null; tg_checked_at: string | null; tg_cursor_ready: boolean }
const SLOT_COLS = 'id,name,tg_username,tg_channel_id,tg_title,tg_slot_minute,tg_slot_set_at,tg_checked_at,tg_cursor_ready';

export async function crawlerConfig() {
  const [cfg, vendors] = await Promise.all([
    config(),
    sel<VendorSlot>(`pb_vendors?active=eq.true&or=(tg_username.not.is.null,tg_channel_id.not.is.null)&select=${SLOT_COLS}&order=name.asc&limit=500`),
  ]);
  const now = Date.now();
  const window = { start: cfg.crawl_window_start ?? WINDOW_DEFAULT.start, end: cfg.crawl_window_end ?? WINDOW_DEFAULT.end };
  const known = cfg.crawler_channels;
  const lastOf = (v: VendorTg) => known.find(c => (v.tg_channel_id !== null && c.channel_id === v.tg_channel_id) || (!!v.tg_username && c.username === v.tg_username))?.last_id ?? null;
  const channels = vendors.map(v => {
    // A cursor counts only while the vendor says it is ready: a new channel / a vendor switched back on starts from its newest post.
    const last_id = v.tg_cursor_ready ? lastOf(v) : null;
    const cursor_ready = v.tg_cursor_ready && last_id !== null;
    const d = dueInfo({ slot: v.tg_slot_minute, checkedAt: v.tg_checked_at, slotSetAt: v.tg_slot_set_at, cursorReady: cursor_ready }, now);
    return {
      vendor_id: v.id, vendor_name: v.name, username: v.tg_username, channel_id: v.tg_channel_id, last_id,
      slot_minute: v.tg_slot_minute, due: d.due, next_check_at: d.next_check_at, checked_at: v.tg_checked_at, cursor_ready,
      vendor_ready: v.tg_cursor_ready,
    };
  });
  const at = (m: number | null) => (m === null ? Infinity : offsetOf(m, window.start));
  channels.sort((a, b) => at(a.slot_minute) - at(b.slot_minute));
  return { ok: true, now: new Date(now).toISOString(), group_chat_id: cfg.group_chat_id, group_title: cfg.group_title, window, channels };
}

export async function crawlerProgress(b: Record<string, unknown>) {
  // No list yet (a report before the crawler's first cycle): only "it is alive" — the stored cursors stay.
  if (b.channels === undefined) {
    await saveConfig({ crawler_seen_at: nowIso(), crawler_version: txt(b.version, 40), crawler_error: txt(b.error, 300) });
    return { ok: true, mapped: 0 };
  }
  if (!Array.isArray(b.channels)) throw new HttpError(400, 'channels must be a list.');
  const prev = (await config()).crawler_channels;
  const flags: { username: string | null; channel_id: number | null; ready: boolean; checked: boolean }[] = [];
  const channels: CrawlerChannel[] = b.channels.slice(0, 500).map((raw) => {
    const c = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const username = cleanUsername(c.username), channel_id = botApiId(c.channel_id);
    // null / '' must not read as 0 (Number(null) === 0 would restart the channel from its first post).
    const last = c.last_id == null || c.last_id === '' ? NaN : Number(c.last_id), sent = c.sent == null ? NaN : Number(c.sent);
    const before = prev.find(p => (channel_id !== null && p.channel_id === channel_id) || (!!username && p.username === username));
    const last_id = Number.isSafeInteger(last) && last >= 0 ? last : before?.last_id ?? null;
    flags.push({ username, channel_id: channel_id ?? before?.channel_id ?? null, ready: c.cursor_ready === true && last_id !== null, checked: c.checked === true });
    return {
      username, channel_id: channel_id ?? before?.channel_id ?? null, title: txt(c.title, 200) ?? before?.title ?? null, last_id,
      error: txt(c.error, 300), sent: Number.isSafeInteger(sent) && sent >= 0 ? sent : before?.sent ?? null,
    };
  });
  // Channels this report does not name keep their stored entry: a partial list never drops a cursor.
  const named = (p: CrawlerChannel) => channels.some(c => (p.channel_id !== null && c.channel_id === p.channel_id) || (!!p.username && c.username === p.username));
  const kept = [...channels, ...prev.filter(p => !named(p))].slice(0, 500);
  await saveConfig({ crawler_seen_at: nowIso(), crawler_version: txt(b.version, 40), crawler_error: txt(b.error, 300), crawler_channels: kept });
  await backfill(channels).catch((e) => console.error(`pb-telegram vendor backfill: ${plain(e)}`));
  // A failure here answers 500: the crawler keeps its flags and sends them again.
  await markVendors(flags.filter(f => f.ready), 'tg_cursor_ready=eq.false&', { tg_cursor_ready: true });
  await markVendors(flags.filter(f => f.checked), '', { tg_checked_at: nowIso() });
  const mapped = await mapForwards(b.forwarded, channels);
  return { ok: true, mapped };
}

/** One PATCH for the active vendors whose channel is in `list` (by username or channel id). */
async function markVendors(list: { username: string | null; channel_id: number | null }[], extra: string, set: Record<string, unknown>) {
  const names = [...new Set(list.map(f => f.username).filter((u): u is string => !!u))];
  const ids = [...new Set(list.map(f => f.channel_id).filter((n): n is number => n !== null))];
  if (!names.length && !ids.length) return;
  const or = [names.length ? `tg_username.in.(${names.join(',')})` : '', ids.length ? `tg_channel_id.in.(${ids.join(',')})` : ''].filter(Boolean).join(',');
  await patch('pb_vendors', `${extra}active=eq.true&or=(${enc(or)})`, set);
}

/** The crawler's {group message → channel post} list → pb_tg_forwards (and the stored messages). */
async function mapForwards(raw: unknown, channels: CrawlerChannel[]): Promise<number> {
  if (!Array.isArray(raw) || !raw.length) return 0;
  const group = (await config()).group_chat_id;
  if (group === null) return 0;
  const rows = raw.slice(0, 2000).map((x) => {
    const f = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    const gm = Number(f.group_message_id), mid = Number(f.message_id), ch = botApiId(f.channel_id);
    if (!Number.isSafeInteger(gm) || gm <= 0 || !Number.isSafeInteger(mid) || mid <= 0 || ch === null) return null;
    const c = channels.find(k => k.channel_id === ch);
    return { chat_id: group, message_id: gm, origin_chat_id: ch, origin_message_id: mid, origin_title: c?.title ?? null, origin_username: c?.username ?? null };
  }).filter(Boolean);
  if (!rows.length) return 0;
  // A failure is reported to the crawler, which keeps the list and sends it again.
  return Number(await rpc<number>('pb_tg_map_forwards', { p_rows: rows })) || 0;
}

/** A username the crawler resolved gives its vendor the channel id and title. */
async function backfill(channels: CrawlerChannel[]) {
  const resolved = channels.filter(c => c.username && c.channel_id !== null);
  if (!resolved.length) return;
  const names = resolved.map(c => c.username as string);
  const vendors = await sel<VendorTg>(`pb_vendors?tg_username=in.(${names.map(enc).join(',')})&select=id,name,tg_username,tg_channel_id,tg_title`);
  for (const v of vendors) {
    const c = resolved.find(x => x.username === v.tg_username);
    if (!c || (v.tg_channel_id === c.channel_id && (!c.title || v.tg_title === c.title))) continue;
    if (v.tg_channel_id !== null && v.tg_channel_id !== c.channel_id) continue; // set by a forwarded post: keep it
    try {
      await patch('pb_vendors', `id=eq.${enc(v.id)}`, { tg_channel_id: c.channel_id, tg_title: c.title ?? v.tg_title });
    } catch (e) {
      console.error(`pb-telegram: channel ${c.username} is already linked to another vendor (${plain(e)})`);
    }
  }
}
