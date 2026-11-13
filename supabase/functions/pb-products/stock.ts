// A product's stock, saved in one place for the ways it changes: a vendor's
// stock-out notice (stockNotice.ts) and the Stock switch on the product page
// (set_stock). Owner, 2026-11-12: "If stock out/in-stock on playbook that same
// happens in shopify stores". The source website's stock is never looked at.
// saveStock: the product is saved and every listing of it that is on sale on
// Shopify is marked as owing its store the new stock, in ONE database call
// (pb_stock_save), whatever state the listing, its website, the product (an
// archived product's listings stay on the store) or the automation is in.
// Saved and marked together, because a change that was saved but not marked
// would never be sent: asking again finds the product already changed. Only
// the stock is sent (no title, text, price or photo, no AI call, no approval
// on a "Review first" website). `now` (the Stock switch): sent at once;
// otherwise (a vendor's notice, read by the worker) the worker's next run
// sends it. Listings not on Shopify yet are left alone — they read the
// product when they go out.
// takeOffSale (a PERMANENT stock-out; owner: "Archive it"): the product is out
// of stock AND marked perm_out_at; the same send then archives the Shopify
// product and sets the listing aside, the listings not on Shopify yet are set
// aside here, and the product is archived in Playbook as soon as none is left
// on sale (retire; the worker checks again, stockSend.ts retireDue). A send
// that fails stays owed and is tried again every 5 minutes. Switching Stock
// back on clears perm_out_at.
import { type Body, uuid } from './actions.ts';
import { enc, logActivity, nowIso, one, patch, rpc, sel } from './db.ts';
import { HttpError } from './http.ts';
import { PERM_NOTE, retire, sendNow } from './stockSend.ts';

export { PERM_NOTE, retire };
/** `said_at`: when this word about the product's stock was said (saidAt). The database applies the change only when no
 *  newer word is on record, and answers NEWER otherwise (pb_stock_save, 20261113130000_pb_stock_word.sql).
 *  `said_at: null` (the Stock switch on) always applies and forgets the time on record. `as_of`: a note only (a
 *  temporary stock-out) — judged by its time, not put on record. `force` (the Stock switch off) always applies. */
export interface StockChange { in_stock?: boolean; temp_out_at?: string | null; perm_out_at?: string | null; said_at?: string | null; as_of?: string; force?: boolean }
/** A newer word about this product's stock stands: nothing was changed. */
export const NEWER = -2;
/** When a post said what it says: the time the vendor made it, else when it reached Playbook. */
export const saidAt = (p: { source_posted_at?: string | null; created_at: string }) => new Date(p.source_posted_at || p.created_at).toISOString();

/** Save the change and mark the listings on sale on Shopify (one transaction). Returns how many stores are owed it
 *  (with `now`: how many of them it reached at once), -1 when the product is gone, or NEWER when a newer word stands.
 *  `run`: the vendor's notice this is part of, as a bulk change that can be taken back (bulkLog.ts). */
export async function saveStock(p: { id: string }, ch: StockChange, note: Record<string, unknown>, userId: string | null, now = false, run?: string | null): Promise<number> {
  const owed = Number(await rpc<number>('pb_stock_save', { p_product: p.id, p_change: ch }, run));
  if (!(owed >= 0)) return owed === NEWER ? NEWER : -1;
  const { force: _force, ...shown } = ch;
  await logActivity({ product_id: p.id, action: 'stock', details: { ...shown, ...note, resent: owed }, user_id: userId });
  return now && owed ? await sendNow(p.id, userId) : owed;
}

/** A permanent stock-out, said at `said`. Returns how many listings are to be archived on Shopify, -1 when the product
 *  is gone, or NEWER when a newer word about its stock stands (nothing is done then). `run`: as saveStock. */
export async function takeOffSale(p: { id: string }, note: Record<string, unknown>, userId: string | null, said?: string, run?: string | null): Promise<number> {
  const owed = Number(await rpc<number>('pb_stock_save', { p_product: p.id, p_change: { in_stock: false, temp_out_at: null, perm_out_at: nowIso(), ...(said ? { said_at: said } : {}) } }, run));
  if (!(owed >= 0)) return owed === NEWER ? NEWER : -1;
  await patch('pb_listings', `product_id=eq.${enc(p.id)}&shopify_product_id=is.null&or=(status.in.(queued,review,failed),and(status.eq.publishing,claimed_at.is.null))`, { status: 'skipped', error: PERM_NOTE, attempts: 0, claimed_at: null }, 'id', run);
  await logActivity({ product_id: p.id, action: 'stock', details: { in_stock: false, permanent: true, ...note, resent: owed }, user_id: userId });
  await retire(p.id, run);
  return owed;
}

/** set_stock { product_id, in_stock } — the Stock switch on the product page. `resent` = the stores it reached at once,
 *  `waiting` = the stores that could not be reached yet (the worker keeps trying). */
export async function setStock(b: Body, userId: string | null) {
  const id = uuid(b.product_id, 'product_id');
  if (typeof b.in_stock !== 'boolean') throw new HttpError(400, 'in_stock must be true or false.');
  const p = await one<{ id: string; in_stock: boolean }>(`pb_products?id=eq.${enc(id)}&select=id,in_stock`);
  if (!p) throw new HttpError(404, 'That product no longer exists.');
  if (p.in_stock === b.in_stock) return { ok: true, resent: 0, waiting: 0 };
  // OFF is the latest word as of now: an older post that is read afterwards does not bring the product back.
  // ON also ends a vendor's "permanent stock out", and FORGETS the time on record instead of claiming it: a vendor's
  // notice posted before the tap that has not reached Playbook yet must still apply (a mis-tap would silence it).
  const change: StockChange = b.in_stock ? { in_stock: true, perm_out_at: null, said_at: null } : { in_stock: false, said_at: nowIso(), force: true };
  const resent = await saveStock(p, change, { by: 'staff' }, userId, true);
  if (resent < 0) throw new HttpError(404, 'That product no longer exists.');
  const waiting = (await sel<{ id: string }>(`pb_listings?product_id=eq.${enc(id)}&stock_due=eq.true&select=id&limit=50`)).length;
  return { ok: true, resent, waiting };
}
