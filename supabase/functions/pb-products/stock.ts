// A product's stock, saved in one place for the ways it changes: a vendor's
// stock-out notice (stockNotice.ts) and the Stock switch on the product page
// (set_stock). Owner, 2026-11-12: "If stock out/in-stock on playbook that same
// happens in shopify stores". The source website's stock is never looked at.
// saveStock: the product is saved, and every listing of it that is ON Shopify
// is marked as owing its store the new stock (stockSend.ts markStockDue),
// whatever state the listing, its website or the automation is in. Only the
// stock is sent (no title, text, price or photo, no AI call, no approval on a
// "Review first" website). `now` (the Stock switch): sent at once; otherwise
// (a vendor's notice, read by the worker) the worker's next run sends it.
// Listings not on Shopify yet are left alone — they read the product when
// they go out.
// takeOffSale (a PERMANENT stock-out; owner: "Archive it"): the product is out
// of stock AND marked perm_out_at; the same send then archives the Shopify
// product and sets the listing aside, the listings not on Shopify yet are set
// aside here, and the product is archived in Playbook as soon as none is left
// on Shopify (retire). A send that fails stays owed and is tried again every 5
// minutes. Switching Stock back on clears perm_out_at.
import { type Body, uuid } from './actions.ts';
import { enc, logActivity, nowIso, one, patch } from './db.ts';
import { HttpError } from './http.ts';
import { PERM_NOTE, markStockDue, retire, sendNow } from './stockSend.ts';

export { PERM_NOTE, retire };
export interface StockChange { in_stock?: boolean; temp_out_at?: string | null; perm_out_at?: string | null }

/** Save the change and mark the listings on Shopify. Returns how many stores are owed it, or -1 when the product is gone. */
export async function saveStock(p: { id: string; status: string }, ch: StockChange, note: Record<string, unknown>, userId: string | null, now = false): Promise<number> {
  if (!(await patch('pb_products', `id=eq.${enc(p.id)}`, { ...ch })).length) return -1;
  const owed = p.status === 'archived' ? 0 : await markStockDue(p.id);
  await logActivity({ product_id: p.id, action: 'stock', details: { ...ch, ...note, resent: owed }, user_id: userId });
  if (now && owed) await sendNow(p.id, userId);
  return owed;
}

/** A permanent stock-out. Returns how many listings are to be archived on Shopify, or -1 when the product is gone. */
export async function takeOffSale(p: { id: string; status: string }, note: Record<string, unknown>, userId: string | null): Promise<number> {
  if (!(await patch('pb_products', `id=eq.${enc(p.id)}`, { in_stock: false, temp_out_at: null, perm_out_at: nowIso() })).length) return -1;
  const mine = `product_id=eq.${enc(p.id)}`;
  const owed = p.status === 'archived' ? 0 : await markStockDue(p.id);
  await patch('pb_listings', `${mine}&shopify_product_id=is.null&or=(status.in.(queued,review,failed),and(status.eq.publishing,claimed_at.is.null))`, { status: 'skipped', error: PERM_NOTE, attempts: 0, claimed_at: null });
  await logActivity({ product_id: p.id, action: 'stock', details: { in_stock: false, permanent: true, ...note, resent: owed }, user_id: userId });
  await retire(p.id);
  return owed;
}

/** set_stock { product_id, in_stock } — the Stock switch on the product page. `resent` = the stores it is sent to. */
export async function setStock(b: Body, userId: string | null) {
  const id = uuid(b.product_id, 'product_id');
  if (typeof b.in_stock !== 'boolean') throw new HttpError(400, 'in_stock must be true or false.');
  const p = await one<{ id: string; status: string; in_stock: boolean }>(`pb_products?id=eq.${enc(id)}&select=id,status,in_stock`);
  if (!p) throw new HttpError(404, 'That product no longer exists.');
  if (p.in_stock === b.in_stock) return { ok: true, resent: 0 };
  // Back in stock by hand also ends a vendor's "permanent stock out".
  const resent = await saveStock(p, { in_stock: b.in_stock, ...(b.in_stock ? { perm_out_at: null } : {}) }, { by: 'staff' }, userId, true);
  if (resent < 0) throw new HttpError(404, 'That product no longer exists.');
  return { ok: true, resent };
}
