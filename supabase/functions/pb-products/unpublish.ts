// Unpublish: mark the listing 'skipped' so automation leaves it alone, then
// hide it on Shopify (status DRAFT). The listing is claimed FIRST with one
// conditional update (only from the state it was read in, and never while a
// run holds it), so the worker cannot publish it in between; if Shopify
// refuses, the listing goes back to the state it was in.
import { ago, enc, logActivity, one, patch } from './db.ts';
import { HttpError, plain } from './http.ts';
import { UNPUBLISH } from './productInput.ts';
import { gql } from './shopify.ts';
import { LISTING_COLS, STALE_MS, WEBSITE_COLS, type ListingRow, type WebsiteRow } from './types.ts';

export async function unpublish(listingId: string, userId: string | null): Promise<void> {
  const l = await one<ListingRow>(`pb_listings?id=eq.${enc(listingId)}&select=${LISTING_COLS}`);
  if (!l) throw new HttpError(404, 'That listing no longer exists.');
  const busy = new HttpError(409, 'This listing is being worked on right now — try again in a minute.');
  if (l.status === 'generating') throw busy;
  const free = `or=(status.in.(queued,review,failed,published,skipped),and(status.eq.publishing,or(claimed_at.is.null,claimed_at.lt.${ago(STALE_MS)})))`;
  const claimed = await patch<ListingRow>('pb_listings', `id=eq.${enc(l.id)}&status=eq.${enc(l.status)}&${free}`, { status: 'skipped', error: null, claimed_at: null }, LISTING_COLS);
  const c = claimed[0];
  if (!c) throw busy;
  if (c.shopify_product_id) {
    try {
      const site = await one<WebsiteRow>(`pb_websites?id=eq.${enc(c.website_id)}&select=${WEBSITE_COLS}`);
      if (!site) throw new HttpError(404, 'The website for this listing no longer exists.');
      const r = await gql<{ productUpdate: { product: { status: string } | null; userErrors: { message: string }[] } }>(site, UNPUBLISH, { product: { id: c.shopify_product_id, status: 'DRAFT' } });
      const ue = r.productUpdate?.userErrors || [];
      if (ue.length && !ue.some(e => /not exist|not found/i.test(e.message))) throw new HttpError(400, `${site.name}: Shopify said "${ue.map(e => e.message).join('; ').slice(0, 200)}".`);
    } catch (e) {
      // Still live on Shopify: put the listing back the way it was.
      await patch('pb_listings', `id=eq.${enc(l.id)}&status=eq.skipped`, { status: l.status, error: l.error, claimed_at: l.claimed_at })
        .catch(w => console.error(`pb-products unpublish revert ${l.id}: ${plain(w)}`));
      throw e;
    }
    await patch('pb_listings', `id=eq.${enc(l.id)}&status=eq.skipped`, { shopify_status: 'DRAFT' });
  }
  await logActivity({ product_id: l.product_id, website_id: l.website_id, listing_id: l.id, action: 'unpublished', details: { shopify_product_id: c.shopify_product_id }, user_id: userId });
}
