// The reader's "what we already know" text (step 1): the facts already on the product and the vendor's post,
// moved out of reader.ts so that file stays small. Pure: no I/O.
import { stripLess } from '../pb-telegram/group.ts';
import type { ProductRow } from './types.ts';

/** `fresh` (a re-read): the AI's earlier name and colour are left out, so it judges them again from the post and
 *  the photos instead of repeating itself; the ones a person typed (locked) stay as known. The fabric always
 *  stays: it is never reworded, only its spelling corrected (readerPrompt.ts). */
export function factsText(p: ProductRow, vendor: string, fresh = false): string {
  const less = Number(p.less_amount) > 0; // the reader must return the RATE: the stored cost is already rate − less
  const keep = (f: string) => !fresh || (p.locked || []).includes(f);
  const known = [
    p.name && keep('name') && `Name: ${p.name}`, p.sku && `SKU: ${p.sku}`, vendor && `Vendor: ${vendor}`,
    p.category && `Category: ${p.category}`, p.fabric && `Fabric: ${p.fabric}`, p.color && keep('color') && `Color: ${p.color}`,
    p.sizes?.length && `Sizes: ${p.sizes.join(', ')}`, !less && p.cost_price !== null && p.cost_price !== undefined && `Cost price: ${p.cost_price}`,
  ].filter(Boolean).join('\n');
  // Every less phrase ("Less: 200", "200 Less", "RATE 1600 LESS 200" → "RATE 1600") is hidden, so it is never taken off twice.
  const post = less ? stripLess(String(p.raw_text || '')) : p.raw_text;
  const note = less ? '\n\nThe vendor also gives a separate discount ("less"); Playbook subtracts it itself, so cost_price must be the RATE written in the post, before any less.'
    : p.sell_price !== null && p.sell_price !== undefined ? '\n\nThis product was imported from another online store: the price in the text is that store\'s SELLING price, not a vendor cost. Return cost_price null.' : '';
  return `${known ? `Already known:\n${known}\n\n` : ''}Vendor's post:\n${String(post || '(no text — use the photos)').slice(0, 6000)}${note}`;
}
