// Pure helpers for the product list (V2): the status filter values shown as
// chips, the tinted-card rule and the per-website listing summary. The filter
// values are exactly the ones `listProducts` understands (data/products.ts).
import type { ProductRow, WebsiteLite } from '../../../data/products';
import type { PbListingStatus } from '../../../types';
import { PB } from '../../../pbTheme';
import { LISTING_STATUS, PRODUCT_STATUS, type StatusTint } from '../status';
import { missingAll, missingDetails } from '../../../seoTypes';

export const IN_PROGRESS = 'l:queued,generating,publishing';

/** The statuses staff act on, as chips. '' = everything but archived. */
export const STATUS_CHIPS: { v: string; label: string }[] = [
  { v: '', label: 'All' },
  { v: 'needs_info', label: PRODUCT_STATUS.needs_info.label },
  { v: 'l:review', label: LISTING_STATUS.review.label },
  { v: 'l:failed', label: LISTING_STATUS.failed.label },
  { v: IN_PROGRESS, label: 'In progress' },
  { v: 'l:published', label: LISTING_STATUS.published.label },
];

/** Every other status the old select offered, kept in a "More statuses" picker. */
export const MORE_STATUSES: { v: string; label: string }[] = [
  ...(['new', 'reading', 'ready', 'archived'] as const).map(s => ({ v: s, label: PRODUCT_STATUS[s].label })),
  ...(['publishing', 'skipped'] as const).map(s => ({ v: `l:${s}`, label: `Listing: ${LISTING_STATUS[s].label}` })),
  { v: 'stock:out', label: 'Out of stock' },
  { v: 'stock:temp', label: 'Temporarily out (vendor)' },
];

export const siteNamer = (sites: WebsiteLite[]) => (id: string) => sites.find(s => s.id === id)?.name ?? 'Website';

/** A card / row that needs action gets the tinted tile: a failed listing wins over review. */
export function productTone(p: ProductRow): StatusTint | undefined {
  if (p.pb_listings.some(l => l.status === 'failed')) return 'failed';
  if (p.status === 'needs_info' || p.pb_listings.some(l => l.status === 'review')) return 'review';
  return undefined;
}

const GROUPS: { label: string; color: string; of: PbListingStatus[] }[] = [
  { label: 'Failed on', color: PB.failed, of: ['failed'] },
  { label: 'Needs review on', color: PB.review, of: ['review'] },
  { label: 'In progress on', color: PB.busy, of: ['queued', 'generating', 'publishing'] },
  { label: 'Live on', color: PB.live, of: ['published'] },
];

/** "Live on Kreeva, Arya", "Failed on Kreeva +2"… most urgent first (removed listings are left out).
 *  `nameOf` names a website (owner, 2026-11-12: the list shows WHICH websites a product is on); up to
 *  two names, then "+N". Without it: "Live on 2 websites". */
export function listingSummary(p: ProductRow, nameOf?: (id: string) => string): { label: string; color: string; n: number }[] {
  const out: { label: string; color: string; n: number }[] = [];
  for (const g of GROUPS) {
    const hit = p.pb_listings.filter(l => g.of.includes(l.status));
    const n = hit.length;
    if (!n) continue;
    const names = nameOf ? hit.map(l => nameOf(l.website_id)) : [];
    const where = nameOf ? `${names.slice(0, 2).join(', ')}${n > 2 ? ` +${n - 2}` : ''}` : `${n} website${n === 1 ? '' : 's'}`;
    out.push({ label: `${g.label} ${where}`, color: g.color, n });
  }
  return out;
}

/** Name to show; never blank. */
export const productTitle = (p: ProductRow) => p.name || p.sku || 'Untitled product';

/** Everything a Needs-info product lacks: the necessary details (price, category, fabric, colour, a photo), then its required tags. */
export const missingOf = (p: Pick<ProductRow, 'cost_price' | 'sell_price' | 'category' | 'fabric' | 'color' | 'missing_attrs' | 'pb_product_images'>) =>
  missingAll(missingDetails(p, p.pb_product_images.length), p.missing_attrs);

/** The status label of a Needs-info product says why: "Needs info · Already here as KB 264 WINE XS" (it looks like a
 *  copy; `copyOf` from data/duplicates.ts heldLabels) and / or "Missing: Fabric, Colour". */
export const statusLabel = (p: Pick<ProductRow, 'status' | 'cost_price' | 'sell_price' | 'category' | 'fabric' | 'color' | 'missing_attrs' | 'pb_product_images'> & { in_stock?: boolean; temp_out_at?: string | null }, copyOf?: string) => {
  const miss = p.status === 'needs_info' ? missingOf(p) : [];
  const why = [p.status === 'needs_info' && copyOf ? `Already here as ${copyOf}` : '', miss.length ? `Missing: ${miss.join(', ')}` : ''].filter(Boolean);
  return (why.length ? `${PRODUCT_STATUS.needs_info.label} · ${why.join(' · ')}` : PRODUCT_STATUS[p.status].label) + (p.in_stock === false ? ' · Out of stock' : p.temp_out_at ? ' · Temporarily out (vendor)' : '');
};
