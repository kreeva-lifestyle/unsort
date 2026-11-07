// One finished group → one Playbook product (source 'telegram', deduped on
// source_ref '<origin_chat_id>:<first origin_message_id>'). Like ingest, the
// product is made 'new' with claimed_at = now, so the reader waits until its
// photos are in; the hold is released at the end. A run that dies leaves the
// hold: after HOLD_MS (longer than any run) the next run takes it over and
// copies only what is missing. Released, a product with no Less yet stays
// away from the reader until 10 minutes after its description, so a "Less"
// sent a little later is in the cost before it is read and priced.
import { ago, enc, insert, logActivity, nowIso, one, patch } from '../pb-products/db.ts';
import { HttpError } from '../pb-products/http.ts';
import { STALE_MS } from '../pb-products/types.ts';
import type { GProduct } from './group.ts';
import { copyMedia, planMedia } from './media.ts';
import { vendorFor } from './vendor.ts';

export const HOLD_MS = 160_000; // the edge runtime ends a call at 150 s
export const TRIES = 3;
export const LESS_WAIT_MS = 10 * 60_000;

export interface MsgRow {
  id: number; chat_id: number; message_id: number; origin_chat_id: number | null; origin_title: string | null; origin_username: string | null;
  origin_message_id: number | null; media_group_id: string | null; kind: string; text: string | null;
  file_id: string | null; file_size: number | null; state: string; note: string | null; received_at: string;
}
export const MSG_COLS = 'id,chat_id,message_id,origin_chat_id,origin_title,origin_username,origin_message_id,media_group_id,kind,text,file_id,file_size,state,note,received_at';

export type Made = { product_id: string; outcome: 'created' | 'done' } | { outcome: 'busy' } | { product_id: string; outcome: 'retry'; error: string };

interface Existing { id: string; status: string; ai_read_at: string | null; claimed_at: string | null; intake_notes: string[] }
const EX_COLS = 'id,status,ai_read_at,claimed_at,intake_notes';
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
const union = (a: string[], b: string[]) => [...new Set([...(a || []), ...b])];

/** The product for this group, held by this run — or 'done' / 'busy'. */
async function hold(ref: string, make: () => Promise<Record<string, unknown>>): Promise<{ p: Existing; created: boolean } | 'done' | 'busy'> {
  const find = () => one<Existing>(`pb_products?source=eq.telegram&source_ref=eq.${enc(ref)}&select=${EX_COLS}`);
  let p = await find();
  if (!p) {
    try {
      return { p: (await insert<Existing>('pb_products', [await make()], { select: EX_COLS }))[0], created: true };
    } catch (e) {
      if (!(e instanceof HttpError && e.status === 409)) throw e;
      p = await find();
      if (!p) throw e;
    }
  }
  // Finished earlier (released, or already read / edited): nothing to copy.
  if (!p.claimed_at || p.status !== 'new' || p.ai_read_at) return 'done';
  const took = await patch<Existing>('pb_products', `id=eq.${enc(p.id)}&status=eq.new&ai_read_at=is.null&claimed_at=lt.${ago(HOLD_MS)}`, { claimed_at: nowIso() }, EX_COLS);
  return took[0] ? { p: took[0], created: false } : 'busy';
}

export async function makeProduct(g: GProduct, rows: Map<number, MsgRow>, token: string, deadline: number, attempt: number): Promise<Made> {
  const msgs = [...g.media, ...g.desc].map(id => rows.get(id)).filter((r): r is MsgRow => !!r);
  const meta = msgs.find(m => m.origin_username) ?? msgs[0];
  const media = g.media.map(id => rows.get(id)).filter((r): r is MsgRow => !!r);
  const { files, notes: upFront } = planMedia(media);
  const ref = `${g.chat}:${g.first}`;
  const raw = [g.description.trim(), g.less !== null ? `Less: ${fmt(g.less)}` : ''].filter(Boolean).join('\n');
  const notes0 = [...(g.noDescription ? ['No description arrived from Telegram'] : []), ...upFront];

  const h = await hold(ref, async () => ({
    source: 'telegram', source_ref: ref, raw_text: raw.slice(0, 20_000) || null, status: 'new', claimed_at: nowIso(),
    vendor_id: await vendorFor({ chat: g.chat, username: meta?.origin_username ?? null, title: meta?.origin_title ?? null }),
    less_amount: g.less, intake_notes: notes0,
    source_url: meta?.origin_username ? `https://t.me/${meta.origin_username}/${g.first}` : null,
  }));
  if (h === 'busy') return { outcome: 'busy' };
  if (h === 'done') {
    const p = await one<{ id: string }>(`pb_products?source=eq.telegram&source_ref=eq.${enc(ref)}&select=id`);
    if (!p) throw new HttpError(409, 'The product for these messages disappeared — they will be grouped again.');
    return { product_id: p.id, outcome: 'done' };
  }
  const id = h.p.id;
  const copy = await copyMedia(token, id, files, deadline);
  // Out of time is not a failed try: the hold stays, the messages stay pending, a later run carries on.
  if (copy.timeout) return { outcome: 'busy' };
  if (copy.retry.length && attempt < TRIES) {
    // Hold kept: the next run after HOLD_MS copies what is missing.
    return { product_id: id, outcome: 'retry', error: `Some files did not copy yet — ${copy.retry.slice(0, 3).join('; ')}` };
  }
  const lost = copy.retry.map(r => `${r.split(':')[0]} could not be copied from Telegram — add it by hand.`);
  const notes = union(union(h.p.intake_notes, notes0), [...copy.notes, ...lost]);
  const readAt = g.less === null && g.descAt !== null ? g.descAt + LESS_WAIT_MS : 0;
  const claimed_at = readAt > Date.now() ? new Date(readAt - STALE_MS).toISOString() : null; // the reader takes it at readAt
  await patch('pb_products', `id=eq.${enc(id)}&status=eq.new`, { intake_notes: notes, claimed_at, ...(g.less !== null ? { less_amount: g.less } : {}) });
  const kept = files.filter(f => f.kind === 'image').length;
  await logActivity({ product_id: id, action: 'created', details: { source: 'telegram', source_ref: ref, photos: kept, videos: files.length - kept, messages: msgs.length, ...(notes.length ? { notes } : {}) } });
  return { product_id: id, outcome: 'created' };
}
