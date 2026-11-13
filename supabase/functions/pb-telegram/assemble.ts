// 'assemble' (pg_cron every minute via trigger_pb_telegram_assemble, when
// messages wait): waiting messages → adopt.ts (posts forwarded twice, late
// album parts) → plan() (group.ts) → products (create.ts), late "Less"
// (less.ts) and late descriptions (latedesc.ts); separators marked ignored.
// A failed group is retried on later runs up to 3 times (the count rides in
// pb_tg_messages.note: "… (attempt N of 3)"); then it stays 'failed', the
// product (if made) is released with a note, and the failure is written to
// pb_activity. Running out of time is not a failed try.
// Channels are checked once a day, so a whole day's posts of one channel
// arrive in a burst (~1.5 s apart): grouping goes by origin_message_id, and
// its waits (group.ts) count from when the closing message ARRIVED, so a burst
// groups the same as posts spread over the day. What tells two products apart
// in a burst is the vendor's own clock (origin_date → GMsg.ot, group.ts).
// Every message set aside is marked 'ignored' with why (skip_why), so Settings
// can list what was not used (pre-launch fix D14).
import { ago, enc, logActivity, one, patch, sel } from '../pb-products/db.ts';
import { plain } from '../pb-products/http.ts';
import { adopt } from './adopt.ts';
import { makeProduct, MSG_COLS, type MsgRow, TRIES } from './create.ts';
import { type GMsg, type GProduct, hasKeywords, type Kind, plan, type SkipWhy } from './group.ts';
import { applyLateDesc } from './latedesc.ts';
import { applyLateLess } from './less.ts';
import { scrub, secrets } from './tg.ts';

const TRY_RE = / \(attempt (\d+) of \d+\)$/;
const tries = (r: MsgRow) => Number(TRY_RE.exec(r.note || '')?.[1] || 0);
const PAGE = 1000; // the most rows one request returns on this project; a full page means "there may be more" (see `held`)
const BUDGET_MS = 135_000;    // the edge runtime ends a call at 150 s
const NO_ORIGIN_MS = 10 * 60_000;

async function mark(ids: number[], set: Record<string, unknown>) {
  for (let i = 0; i < ids.length; i += 200) {
    await patch('pb_tg_messages', `id=in.(${ids.slice(i, i + 200).join(',')})&state=in.(pending,failed)`, set);
  }
}

/** Marks messages ignored, each with why (`fallback` for the ones the plan gave no reason). */
async function skip(ids: number[], why: Record<number, SkipWhy>, fallback: SkipWhy, more: Record<string, unknown> = {}) {
  const by = new Map<SkipWhy, number[]>();
  for (const id of ids) { const w = why[id] ?? fallback; by.set(w, [...(by.get(w) || []), id]); }
  for (const [w, list] of by) await mark(list, { state: 'ignored', skip_why: w, ...more });
}

export async function assemble() {
  const t0 = Date.now(), deadline = t0 + BUDGET_MS;
  const out = { ok: true, products: 0, less: 0, late: 0, adopted: 0, ignored: 0, failed: 0, waiting: 0 };
  const token = (await secrets()).bot_token;
  if (!token) return { ...out, note: 'No bot token saved yet.' };
  const [pending, failed] = await Promise.all([
    sel<MsgRow>(`pb_tg_messages?state=eq.pending&select=${MSG_COLS}&order=origin_chat_id.asc,origin_message_id.asc,id.asc&limit=${PAGE}`),
    sel<MsgRow>(`pb_tg_messages?state=eq.failed&received_at=gt.${enc(ago(7 * 86_400_000))}&select=${MSG_COLS}&order=id.asc&limit=1000`),
  ]);
  // Forwarded from a person, with no crawler mapping after 10 minutes: no vendor can be known.
  const orphans = pending.filter(r => r.origin_chat_id === null && Date.now() - Date.parse(r.received_at) > NO_ORIGIN_MS).map(r => r.id);
  if (orphans.length) { await mark(orphans, { state: 'ignored', skip_why: 'no_vendor', note: 'Forwarded from a person, not a channel — the vendor is not known.' }); out.ignored += orphans.length; }
  let rows = [...pending, ...failed.filter(r => tries(r) > 0 && tries(r) < TRIES)].filter(r => r.origin_chat_id !== null);

  const a = await adopt(rows, token, deadline, tries);
  out.adopted = a.adopted; out.ignored += a.dupes;
  rows = rows.filter(r => !a.done.has(r.id));

  const byId = new Map(rows.map(r => [r.id, r]));
  const gm: GMsg[] = rows.map(r => ({
    id: r.id, chat: r.origin_chat_id as number, mid: r.origin_message_id ?? r.message_id, kind: r.kind as Kind,
    text: r.text || '', album: r.media_group_id, at: Date.parse(r.received_at), ot: r.origin_date ? Date.parse(r.origin_date) : null,
  }));
  // A full page may cut its last channel short: that channel's last group waits.
  const last = pending[pending.length - 1];
  const held = new Set<number>(pending.length >= PAGE && last?.origin_chat_id != null ? [last.origin_chat_id] : []);
  const p = plan(gm, Date.now(), held);

  if (p.ignore.length) { await skip(p.ignore, p.why, 'separator'); out.ignored += p.ignore.length; }

  for (const l of p.lateLess) {
    try {
      const r = await applyLateLess({ ...l, mid: byId.get(l.id)?.origin_message_id ?? null });
      if (r === 'applied') out.less++;
      if (r === 'orphan') { await mark([l.id], { state: 'ignored', skip_why: 'less_alone', note: 'A "Less" with no product right before it.' }); out.ignored++; }
    } catch (e) {
      console.error(`pb-telegram less ${l.id}: ${plain(e)}`);
    }
  }

  const todo: GProduct[] = [...p.products];
  for (const g of p.lateDesc) {
    try {
      const r = await applyLateDesc(g, byId);
      if (r === 'applied') { out.late++; continue; }
      if (r === 'wait') continue;
    } catch (e) {
      console.error(`pb-telegram late description ${g.chat}:${g.first}: ${plain(e)}`);
      continue;
    }
    if (hasKeywords(g.description)) todo.push(g); // a priced text on its own: its own product
    else { await mark(g.desc, { state: 'ignored', skip_why: 'no_photos' }); await skip([...g.lessIds, ...g.extra], p.why, 'separator'); out.ignored++; }
  }

  const done = new Set<number>();
  for (const g of todo) {
    const left = deadline - Date.now();
    if (Date.now() - t0 > 90_000 || left < 40_000) break;
    const ids = [...g.media, ...g.desc, ...g.lessIds];
    const attempt = Math.max(0, ...ids.map(id => tries(byId.get(id) as MsgRow))) + 1;
    const ref = `${g.chat}:${g.first}`;
    const fail = async (msg: string, productId: string | null) => {
      out.failed++;
      await mark(ids, { state: 'failed', note: `${msg.slice(0, 240)} (attempt ${attempt} of ${TRIES})` });
      if (attempt < TRIES) return;
      await logActivity({ product_id: productId, action: 'failed', details: { step: 'telegram', source_ref: ref, error: msg } });
      // Last try: let the reader have whatever was copied, and say why it is short.
      const p = productId ? { id: productId, intake_notes: null } : await one<{ id: string; intake_notes: string[] | null }>(`pb_products?source=eq.telegram&source_ref=eq.${enc(ref)}&select=id,intake_notes`);
      if (p) {
        const cur = p.intake_notes ?? (await one<{ intake_notes: string[] }>(`pb_products?id=eq.${enc(p.id)}&select=intake_notes`))?.intake_notes ?? [];
        await patch('pb_products', `id=eq.${enc(p.id)}&status=eq.new`, { claimed_at: null, intake_notes: [...new Set([...cur, `Telegram copy failed: ${msg.slice(0, 160)}`])] });
      }
    };
    try {
      const r = await makeProduct(g, byId, token, deadline, attempt);
      if (r.outcome === 'busy') continue;
      ids.forEach(id => done.add(id)); g.extra.forEach(id => done.add(id));
      if (r.outcome === 'retry') { await fail(r.error, r.product_id); continue; }
      await mark(ids, { state: 'used', product_id: r.product_id, note: null });
      if (g.extra.length) await skip(g.extra, p.why, 'separator', { product_id: r.product_id });
      if (r.outcome === 'created') out.products++;
    } catch (e) {
      const msg = scrub(plain(e), token);
      console.error(`pb-telegram product ${ref}: ${msg}`);
      ids.forEach(id => done.add(id));
      await fail(msg, null).catch((w) => console.error(`pb-telegram mark failed: ${plain(w)}`));
    }
  }
  const dropped = new Set([...p.ignore, ...p.lateLess.map(l => l.id)]);
  out.waiting = rows.filter(r => !done.has(r.id) && !dropped.has(r.id)).length;
  return out;
}
