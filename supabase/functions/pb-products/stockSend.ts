// Stock has its own small send to Shopify (pre-launch check, 2026-11-13, D6).
// Before, a stock change travelled as a full re-send of the listing, so it did
// not reach the store when the product was in Needs info, the listing waited
// in Needs review or Failed, the website was switched off or automation was
// paused — and every missed "sold out" is an order for goods the vendor no
// longer has. Now:
//   * stock.ts marks every listing of the product that is on Shopify
//     (markStockDue: pb_listings.stock_due), whatever state it is in;
//   * sendStock sends only the stock: each size's "Continue selling when out
//     of stock" box (ticked = in stock, unticked = sold out; nothing on a
//     Track-stock website, where the count in Shopify decides), or, for a
//     vendor's PERMANENT stock-out, the Shopify product is archived and the
//     listing set aside. No title, text, price or photo is touched, so a
//     rewrite waiting for approval stays waiting;
//   * the Stock switch sends at once (sendNow); a vendor's notice is sent by
//     the worker's first step (sendStockDue), which runs for every website,
//     on or off, and also while automation is paused (actions.ts doWork);
//   * a send that fails stays owed and is tried again 5 minutes later, for as
//     long as it takes; only its first failure is written to the timeline.
// A full publish sends the stock too, but never clears the mark: only a send
// that read the product's stock as it is now does (publish.ts stockMoved marks
// a listing whose product changed while it was being published).
import { ago, enc, logActivity, nowIso, one, patch, sel } from './db.ts';
import { HttpError, plain } from './http.ts';
import { UNPUBLISH } from './productInput.ts';
import { gql } from './shopify.ts';
import { STALE_MS, WEBSITE_COLS, permOut, type WebsiteRow } from './types.ts';

/** The note on a listing that was taken off its website by a permanent stock-out. */
export const PERM_NOTE = 'The vendor said permanent stock out, so it was taken off this website. To sell it again: switch Stock on, then Put back on site.';
const RETRY_MS = 5 * 60_000;
const VARIANTS = 'query PbStockVariants($id: ID!) { product(id: $id) { id variants(first: 250) { nodes { id } } } }';
const BULK = `mutation PbStock($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId: $productId, variants: $variants) { userErrors { field message } }
}`;

export interface Due { id: string; product_id: string; website_id: string; status: string; claimed_at: string | null; shopify_product_id: string | null; stock_tried_at: string | null }
const DUE_COLS = 'id,product_id,website_id,status,claimed_at,shopify_product_id,stock_tried_at';
type Stock = { id: string; in_stock: boolean; perm_out_at: string | null };

/** What each size of the Shopify product is set to: counted, and sellable at a count of zero only while in stock. */
export const stockVariants = (ids: string[], inStock: boolean) =>
  ids.map(id => ({ id, inventoryPolicy: inStock ? 'CONTINUE' : 'DENY', inventoryItem: { tracked: true } }));

/** Every listing of the product that is on Shopify now owes its store the product's stock. Returns how many. */
export async function markStockDue(productId: string): Promise<number> {
  return (await patch('pb_listings', `product_id=eq.${enc(productId)}&shopify_product_id=not.is.null&status=neq.skipped`, { stock_due: true, stock_tried_at: null })).length;
}

/** Archive a permanently sold-out product once none of its listings is still on Shopify. */
export async function retire(productId: string): Promise<void> {
  const mine = `product_id=eq.${enc(productId)}`;
  const left = await sel<{ id: string }>(`pb_listings?${mine}&shopify_product_id=not.is.null&status=in.(published,publishing,review,failed)&select=id&limit=1`);
  if (!left.length) await patch('pb_products', `id=eq.${enc(productId)}&status=in.(ready,needs_info,new)&in_stock=eq.false&perm_out_at=not.is.null`, { status: 'archived' });
}

const said = (site: WebsiteRow, ue: { message: string }[]) => new HttpError(400, `${site.name}: Shopify said "${ue.map(e => e.message).join('; ').slice(0, 200)}".`);

/** Send one listing's stock. 'done' = nothing is owed any more; 'wait' = still owed, nothing went wrong (a run holds the
 *  listing, or the product changed meanwhile); 'failed' = the store could not be updated (tried again in 5 minutes). */
export async function sendStock(l: Due, userId: string | null, ms = 20_000): Promise<'done' | 'wait' | 'failed'> {
  const mine = `id=eq.${enc(l.id)}&stock_due=eq.true`;
  const clear = { stock_due: false, stock_tried_at: null };
  if (!l.shopify_product_id || l.status === 'skipped') { await patch('pb_listings', mine, clear); return 'done'; }
  // A run is publishing this listing right now, perhaps with the stock as it was: once it is done, the stock goes.
  if (l.status === 'publishing' && l.claimed_at && Date.parse(l.claimed_at) > Date.now() - STALE_MS) return 'wait';
  const [p, site] = await Promise.all([
    one<Stock>(`pb_products?id=eq.${enc(l.product_id)}&select=id,in_stock,perm_out_at`),
    one<WebsiteRow>(`pb_websites?id=eq.${enc(l.website_id)}&select=${WEBSITE_COLS}`),
  ]);
  if (!p || !site) { await patch('pb_listings', mine, clear); return 'done'; }
  const who = { product_id: l.product_id, website_id: l.website_id, listing_id: l.id, user_id: userId };
  try {
    if (permOut(p)) {
      const r = await gql<{ productUpdate: { userErrors: { message: string }[] } | null }>(site, UNPUBLISH, { product: { id: l.shopify_product_id, status: 'ARCHIVED' } }, ms);
      const ue = r.productUpdate?.userErrors || [];
      if (ue.length && !ue.some(e => /not exist|not found/i.test(e.message))) throw said(site, ue);
      // Off the website, as a full publish leaves it; not while a run took the listing meanwhile.
      const off = await patch('pb_listings', `${mine}&or=(status.neq.publishing,claimed_at.is.null,claimed_at.lt.${ago(STALE_MS)})`,
        { status: 'skipped', shopify_status: 'ARCHIVED', error: PERM_NOTE, attempts: 0, claimed_at: null, ...clear });
      if (!off.length) return 'wait';
      await logActivity({ ...who, action: 'unpublished', details: { permanent: true, shopify_product_id: l.shopify_product_id } });
      await retire(p.id);
      return 'done';
    }
    const inStock = p.in_stock !== false;
    if (!site.track_inventory) {
      const d = await gql<{ product: { variants: { nodes: { id: string }[] } } | null }>(site, VARIANTS, { id: l.shopify_product_id }, ms);
      const ids = (d.product?.variants?.nodes || []).map(v => v.id); // none: deleted in Shopify, nothing to set
      if (ids.length) {
        const r = await gql<{ productVariantsBulkUpdate: { userErrors: { message: string }[] } | null }>(site, BULK, { productId: l.shopify_product_id, variants: stockVariants(ids, inStock) }, ms);
        const ue = r.productVariantsBulkUpdate?.userErrors || [];
        if (ue.length) throw said(site, ue);
      }
    }
    // The stock may have changed while this was on its way: then it is still owed, and the next try sends the new one.
    const now = await one<Stock>(`pb_products?id=eq.${enc(p.id)}&select=id,in_stock,perm_out_at`);
    if (now && (now.in_stock !== p.in_stock || !!now.perm_out_at !== !!p.perm_out_at)) return 'wait';
    if ((await patch('pb_listings', mine, clear)).length) await logActivity({ ...who, action: 'stock_sent', details: { in_stock: inStock, ...(site.track_inventory ? { counted_in_shopify: true } : {}) } });
    return 'done';
  } catch (e) {
    await patch('pb_listings', mine, { stock_tried_at: nowIso() }).catch(w => console.error(`pb-products stock mark ${l.id}: ${plain(w)}`));
    // Tried again every 5 minutes: only the first failure in a row goes on the timeline.
    if (!l.stock_tried_at) await logActivity({ ...who, action: 'failed', details: { step: 'stock', error: plain(e) } });
    else console.error(`pb-products stock ${l.id}: ${plain(e)}`);
    return 'failed';
  }
}

/** The listings whose stock is owed and due for a try (never tried, or the last try is 5 minutes old), oldest try first. */
export const stockCandidates = (limit: number, productId = '') =>
  sel<Due>(`pb_listings?stock_due=eq.true${productId ? `&product_id=eq.${enc(productId)}` : `&or=(stock_tried_at.is.null,stock_tried_at.lt.${ago(RETRY_MS)})`}&select=${DUE_COLS}&order=stock_tried_at.asc.nullsfirst&limit=${limit}`);

/** The worker's first step, for every website (on or off) and also while automation is paused. Returns how many were sent. */
export async function sendStockDue(limit: number, inTime: () => boolean, userId: string | null): Promise<number> {
  let n = 0;
  const down = new Set<string>(); // a store that just failed: its other listings wait for the next run (one failing call a minute, not ten)
  for (const l of await stockCandidates(limit)) {
    if (!inTime()) break;
    if (down.has(l.website_id)) continue;
    const r = await sendStock(l, userId);
    if (r === 'done') n++; else if (r === 'failed') down.add(l.website_id);
  }
  return n;
}

/** A person changed the stock: send it to the product's stores at once (what fails stays owed for the worker). Returns how many went. */
export async function sendNow(productId: string, userId: string | null): Promise<number> {
  const done = await Promise.all((await stockCandidates(20, productId)).map(l => sendStock(l, userId, 15_000)));
  return done.filter(r => r === 'done').length;
}

/** After a full publish: the product's stock changed while the listing was being sent, so the store may show the old one. */
export async function stockMoved(listingId: string, was: Stock): Promise<void> {
  const now = await one<Stock>(`pb_products?id=eq.${enc(was.id)}&select=id,in_stock,perm_out_at`);
  if (now && (now.in_stock !== was.in_stock || !!now.perm_out_at !== !!was.perm_out_at)) await patch('pb_listings', `id=eq.${enc(listingId)}&shopify_product_id=not.is.null`, { stock_due: true, stock_tried_at: null });
}
