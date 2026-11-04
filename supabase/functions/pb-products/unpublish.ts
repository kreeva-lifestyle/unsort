// Unpublish: hide a listing on Shopify (status DRAFT) and mark it 'skipped'
// so automation leaves it alone.
import { enc, logActivity, one, patch } from './db.ts';
import { HttpError } from './http.ts';
import { UNPUBLISH } from './productInput.ts';
import { gql } from './shopify.ts';
import { LISTING_COLS, STALE_MS, WEBSITE_COLS, type ListingRow, type WebsiteRow } from './types.ts';

/** Hide on Shopify (status DRAFT) and mark the listing 'skipped' so automation leaves it alone. */
export async function unpublish(listingId: string, userId: string | null): Promise<void> {
  const l = await one<ListingRow>(`pb_listings?id=eq.${enc(listingId)}&select=${LISTING_COLS}`);
  if (!l) throw new HttpError(404, 'That listing no longer exists.');
  if (l.status === 'generating' || (l.status === 'publishing' && l.claimed_at && Date.parse(l.claimed_at) > Date.now() - STALE_MS)) {
    throw new HttpError(409, 'This listing is being worked on right now — try again in a minute.');
  }
  if (l.shopify_product_id) {
    const site = await one<WebsiteRow>(`pb_websites?id=eq.${enc(l.website_id)}&select=${WEBSITE_COLS}`);
    if (!site) throw new HttpError(404, 'The website for this listing no longer exists.');
    const r = await gql<{ productUpdate: { product: { status: string } | null; userErrors: { message: string }[] } }>(site, UNPUBLISH, { product: { id: l.shopify_product_id, status: 'DRAFT' } });
    const ue = r.productUpdate?.userErrors || [];
    if (ue.length && !ue.some(e => /not exist|not found/i.test(e.message))) throw new HttpError(400, `${site.name}: Shopify said "${ue.map(e => e.message).join('; ').slice(0, 200)}".`);
  }
  await patch('pb_listings', `id=eq.${enc(l.id)}`, { status: 'skipped', shopify_status: l.shopify_product_id ? 'DRAFT' : l.shopify_status, error: null, claimed_at: null });
  await logActivity({ product_id: l.product_id, website_id: l.website_id, listing_id: l.id, action: 'unpublished', details: { shopify_product_id: l.shopify_product_id }, user_id: userId });
}
