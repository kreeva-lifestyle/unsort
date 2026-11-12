// A product's stock, saved in one place for both ways it changes: an import
// run that found the store's stock changed (import/stock.ts) and the Stock
// switch on the product page (set_stock). Owner, 2026-11-12: "If stock
// out/in-stock on playbook that same happens in shopify stores".
// Saving the change sends the listings that are ALREADY on Shopify again, as
// they are (no AI call, no new approval on a "Review first" website: the text
// did not change). Listings still waiting are left alone — they read the
// product when they go out. A listing a run is publishing right now may have
// read the old stock, so the product is flagged (route_due) and the worker
// checks it again (route.ts `behind`).
import { type Body, uuid } from './actions.ts';
import { enc, logActivity, one, patch, sel } from './db.ts';
import { HttpError } from './http.ts';

export interface StockChange { in_stock?: boolean; sizes?: string[] }

/** Save the change and send the published listings again. Returns how many were sent, or -1 when the product is gone. */
export async function saveStock(p: { id: string; status: string }, ch: StockChange, note: Record<string, unknown>, userId: string | null): Promise<number> {
  if (!(await patch('pb_products', `id=eq.${enc(p.id)}`, { ...ch })).length) return -1;
  const mine = `product_id=eq.${enc(p.id)}`;
  const sent = p.status === 'archived' ? [] : await patch('pb_listings', `${mine}&status=eq.published`, { status: 'publishing', attempts: 0, error: null, claimed_at: null });
  const busy = await sel<{ id: string }>(`pb_listings?${mine}&status=eq.publishing&claimed_at=not.is.null&select=id&limit=1`);
  if (busy.length && p.status === 'ready') await patch('pb_products', `id=eq.${enc(p.id)}`, { route_due: true });
  await logActivity({ product_id: p.id, action: 'stock', details: { ...ch, ...note, resent: sent.length }, user_id: userId });
  return sent.length;
}

/** set_stock { product_id, in_stock } — the Stock switch on the product page. */
export async function setStock(b: Body, userId: string | null) {
  const id = uuid(b.product_id, 'product_id');
  if (typeof b.in_stock !== 'boolean') throw new HttpError(400, 'in_stock must be true or false.');
  const p = await one<{ id: string; status: string; in_stock: boolean }>(`pb_products?id=eq.${enc(id)}&select=id,status,in_stock`);
  if (!p) throw new HttpError(404, 'That product no longer exists.');
  if (p.in_stock === b.in_stock) return { ok: true, resent: 0 };
  const resent = await saveStock(p, { in_stock: b.in_stock }, { by: 'staff' }, userId);
  if (resent < 0) throw new HttpError(404, 'That product no longer exists.');
  return { ok: true, resent };
}
