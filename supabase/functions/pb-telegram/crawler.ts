// The crawler (tools/pb-telegram-crawler) — header x-crawler-key, whose sha-256
// must equal pb_tg_secrets.crawler_key_hash (key made in Settings → Telegram).
//   crawler_config   → { ok, group_chat_id, group_title, channels: [{ vendor_id, vendor_name, username, channel_id, last_id }] }
//   crawler_progress { version, error?, channels: [{ username, channel_id, title, last_id, error? }],
//                      forwarded?: [{ group_message_id, channel_id, message_id }] } → { ok, mapped }
// `forwarded` says which vendor channel post each new group message is: stored
// by pb_tg_map_forwards, it overrides forward_origin (a repost names the
// supplier's channel there, not the vendor's).
// Channel ids are in Bot API form (-100…); a positive GramJS id is converted.
// A channel reported without last_id keeps the one stored before.
import { enc, nowIso, patch, sel } from '../pb-products/db.ts';
import { HttpError, plain } from '../pb-products/http.ts';
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

export async function crawlerConfig() {
  const [cfg, vendors] = await Promise.all([
    config(),
    sel<VendorTg>('pb_vendors?active=eq.true&or=(tg_username.not.is.null,tg_channel_id.not.is.null)&select=id,name,tg_username,tg_channel_id,tg_title&order=name.asc&limit=500'),
  ]);
  const known = cfg.crawler_channels;
  const lastOf = (v: VendorTg) => known.find(c => (v.tg_channel_id !== null && c.channel_id === v.tg_channel_id) || (!!v.tg_username && c.username === v.tg_username))?.last_id ?? null;
  return {
    ok: true, group_chat_id: cfg.group_chat_id, group_title: cfg.group_title,
    channels: vendors.map(v => ({ vendor_id: v.id, vendor_name: v.name, username: v.tg_username, channel_id: v.tg_channel_id, last_id: lastOf(v) })),
  };
}

export async function crawlerProgress(b: Record<string, unknown>) {
  if (!Array.isArray(b.channels)) throw new HttpError(400, 'channels must be a list.');
  const prev = (await config()).crawler_channels;
  const channels: CrawlerChannel[] = b.channels.slice(0, 500).map((raw) => {
    const c = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const username = cleanUsername(c.username), channel_id = botApiId(c.channel_id);
    const last = Number(c.last_id);
    const before = prev.find(p => (channel_id !== null && p.channel_id === channel_id) || (!!username && p.username === username));
    return {
      username, channel_id, title: txt(c.title, 200),
      last_id: Number.isSafeInteger(last) && last >= 0 ? last : before?.last_id ?? null,
      error: txt(c.error, 300),
    };
  });
  await saveConfig({ crawler_seen_at: nowIso(), crawler_version: txt(b.version, 40), crawler_error: txt(b.error, 300), crawler_channels: channels });
  await backfill(channels).catch((e) => console.error(`pb-telegram vendor backfill: ${plain(e)}`));
  const mapped = await mapForwards(b.forwarded, channels);
  return { ok: true, mapped };
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
