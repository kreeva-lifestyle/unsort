// A product's stock, saved in one place for the ways it changes: a vendor's
// stock-out notice (stockNotice.ts) and the Stock switch on the product page
// (set_stock). Owner, 2026-11-12: "If stock out/in-stock on playbook that same
// happens in shopify stores". The source website's stock is never looked at.
// saveStock: the listings that are ALREADY on Shopify are sent again as they
// are (no AI call, no new approval on a "Review first" website: the text did
// not change). Listings still waiting are left alone — they read the product
// when they go out. A listing a run is publishing right now may have read the
// old stock, so the product is flagged (route_due) and the worker checks it
// again (route.ts `behind`).
// takeOffSale (a PERMANENT stock-out; owner: "Archive it"): the product is out
// of stock AND marked perm_out_at, every listing on Shopify is sent once more
// — publish.ts then archives the Shopify product instead of updating it — the
// listings not there yet are set aside, and the product is archived in
// Playbook as soon as none is left to send (retire). A send that fails stays
// a Failed listing of a Ready product, where "Retry all" finds it. Switching
// Stock back on clears perm_out_at.
import { type Body, uuid } from './actions.ts';
import { enc, logActivity, nowIso, one, patch, sel } from './db.ts';
import { HttpError } from './http.ts';

export interface StockChange { in_stock?: boolean; temp_out_at?: string | null; perm_out_at?: string | null }
/** The note on a listing that was taken off its website by a permanent stock-out. */
export const PERM_NOTE = 'The vendor said permanent stock out, so it was taken off this website. To sell it again: switch Stock on, then Put back on site.';

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

/** Archive a permanently sold-out product once none of its listings is still on its way off Shopify. */
export async function retire(productId: string): Promise<void> {
  const mine = `product_id=eq.${enc(productId)}`;
  const left = await sel<{ id: string }>(`pb_listings?${mine}&shopify_product_id=not.is.null&status=in.(published,publishing,review,failed)&select=id&limit=1`);
  if (!left.length) await patch('pb_products', `id=eq.${enc(productId)}&status=in.(ready,needs_info,new)&in_stock=eq.false&perm_out_at=not.is.null`, { status: 'archived' });
}

/** A permanent stock-out. Returns how many listings were sent to be archived on Shopify, or -1 when the product is gone. */
export async function takeOffSale(p: { id: string; status: string }, note: Record<string, unknown>, userId: string | null): Promise<number> {
  if (!(await patch('pb_products', `id=eq.${enc(p.id)}`, { in_stock: false, temp_out_at: null, perm_out_at: nowIso() })).length) return -1;
  const mine = `product_id=eq.${enc(p.id)}`, again = { attempts: 0, claimed_at: null };
  const sent = p.status === 'archived' ? [] : await patch('pb_listings', `${mine}&shopify_product_id=not.is.null&status=in.(published,review,failed)`, { status: 'publishing', error: null, ...again });
  await patch('pb_listings', `${mine}&shopify_product_id=is.null&or=(status.in.(queued,review,failed),and(status.eq.publishing,claimed_at.is.null))`, { status: 'skipped', error: PERM_NOTE, ...again });
  const busy = await sel<{ id: string }>(`pb_listings?${mine}&status=eq.publishing&claimed_at=not.is.null&select=id&limit=1`);
  if (busy.length && p.status === 'ready') await patch('pb_products', `id=eq.${enc(p.id)}`, { route_due: true });
  await logActivity({ product_id: p.id, action: 'stock', details: { in_stock: false, permanent: true, ...note, resent: sent.length }, user_id: userId });
  await retire(p.id);
  return sent.length;
}

/** set_stock { product_id, in_stock } — the Stock switch on the product page. */
export async function setStock(b: Body, userId: string | null) {
  const id = uuid(b.product_id, 'product_id');
  if (typeof b.in_stock !== 'boolean') throw new HttpError(400, 'in_stock must be true or false.');
  const p = await one<{ id: string; status: string; in_stock: boolean }>(`pb_products?id=eq.${enc(id)}&select=id,status,in_stock`);
  if (!p) throw new HttpError(404, 'That product no longer exists.');
  if (p.in_stock === b.in_stock) return { ok: true, resent: 0 };
  // Back in stock by hand also ends a vendor's "permanent stock out".
  const resent = await saveStock(p, { in_stock: b.in_stock, ...(b.in_stock ? { perm_out_at: null } : {}) }, { by: 'staff' }, userId);
  if (resent < 0) throw new HttpError(404, 'That product no longer exists.');
  return { ok: true, resent };
}
