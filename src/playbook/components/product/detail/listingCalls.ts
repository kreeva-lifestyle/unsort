// The listing actions shared by the listing editor (ListingActions) and the
// inline buttons on each website tile of the product page, so both run the
// same call and say the same thing. No new actions: these are the editor's.
import { pbCall } from '../../../data/pbFunctions';
import { approveListing, type ListingFull } from '../../../data/listings';

type L = Pick<ListingFull, 'id' | 'product_id' | 'website_id' | 'status' | 'shopify_product_id' | 'generated_at'>;

export const onShopify = (l: L) => !!l.shopify_product_id;
export const isRemoved = (l: L) => l.status === 'skipped';

/** Approve (review only): the server publishes it within a minute, or when automation resumes. */
export const approveCall = (l: L) => () => approveListing(l);
export const approveDone = (r: unknown) => ((r as { paused?: boolean } | undefined)?.paused
  ? 'Approved — automation is paused, so it is sent when it is resumed (or tap Publish now)'
  : 'Approved — it will publish within a minute');

/** Publish / update / put back — the editor shows it for these statuses (and removed + written). */
export const canPublish = (l: L) =>
  ['review', 'failed', 'published', 'publishing'].includes(l.status) || (isRemoved(l) && !!l.generated_at);
export const publishCall = (l: L) => () => pbCall('publish_listing', { listing_id: l.id });
export const publishDone = (l: L) => (isRemoved(l) ? 'Back on the website' : onShopify(l) ? 'Updated on Shopify' : 'Published to Shopify');
export const publishLabel = (l: L) => (isRemoved(l) ? 'Put back on site' : onShopify(l) ? 'Update on Shopify' : 'Publish now');
export const publishBusy = (l: L) => (onShopify(l) ? 'Updating…' : 'Publishing…');
