// Pure helpers for the product list (V2): the status filter values shown as
// chips, the tinted-card rule and the per-website listing summary. The filter
// values are exactly the ones `listProducts` understands (data/products.ts).
import type { ProductRow, WebsiteLite } from '../../../data/products';
import type { PbListingStatus } from '../../../types';
import { PB } from '../../../pbTheme';
import { LISTING_STATUS, PRODUCT_STATUS, type StatusTint } from '../status';

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

/** "Live on 2 websites", "Failed on 1 website"… (removed listings are left out). */
export function listingSummary(p: ProductRow): { label: string; color: string; n: number }[] {
  const out: { label: string; color: string; n: number }[] = [];
  for (const g of GROUPS) {
    const n = p.pb_listings.filter(l => g.of.includes(l.status)).length;
    if (n) out.push({ label: `${g.label} ${n} website${n === 1 ? '' : 's'}`, color: g.color, n });
  }
  return out;
}

/** Name to show; never blank. */
export const productTitle = (p: ProductRow) => p.name || p.sku || 'Untitled product';

/** The status label, with the missing required attributes on a Needs-info product: "Needs info · Missing: Colour". */
export const statusLabel = (p: Pick<ProductRow, 'status' | 'missing_attrs'>) =>
  p.status === 'needs_info' && p.missing_attrs?.length ? `${PRODUCT_STATUS.needs_info.label} · Missing: ${p.missing_attrs.join(', ')}` : PRODUCT_STATUS[p.status].label;
