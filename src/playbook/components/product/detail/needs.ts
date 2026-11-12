// What the product page says under the status. For Needs info it names exactly
// what is missing (owner, 2026-11-12: nothing is written for a product until
// every necessary detail is there), so the next step is on the page.
import type { ProductDetail } from '../../../data/products';
import { missingAll, missingDetails } from '../../../seoTypes';
import { PRODUCT_STATUS } from '../status';

export const photoCount = (p: Pick<ProductDetail, 'pb_product_images'>) => p.pb_product_images.filter(i => i.kind === 'image').length;

/** `copyOf`: what the product looks like a copy of ("KB 264 WINE XS"), when the gate holds it for that. */
export function statusHint(p: Pick<ProductDetail, 'status' | 'cost_price' | 'sell_price' | 'category' | 'fabric' | 'color' | 'missing_attrs' | 'pb_product_images'>, copyOf?: string): string {
  if (p.status !== 'needs_info') return PRODUCT_STATUS[p.status].hint;
  const miss = missingAll(missingDetails(p, photoCount(p)), p.missing_attrs);
  const why = [copyOf ? `It looks already added (${copyOf}): answer below.` : '', miss.length ? `Missing: ${miss.join(', ')}.` : ''].filter(Boolean).join(' ');
  return why ? `${why} Nothing is written for the websites until then.` : PRODUCT_STATUS.needs_info.hint;
}
