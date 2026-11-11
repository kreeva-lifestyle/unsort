// Pure: the JSON-LD Product on a product page (stores that are not Shopify or
// WooCommerce, and the extra facts on a Shopify / Woo product page). No I/O.
// Real-world shapes handled: @graph and arrays, @type as "Product",
// "http://schema.org/Product" or "schema:Product", ProductGroup (Google's
// variant markup: offers come from hasVariant), and a raw newline inside a
// JSON string (a common theme bug). Blocks are found with indexOf (linear on
// any page), at most MAX_BLOCKS blocks of MAX_BLOCK characters each.
import type { Found } from './normalize.ts';
import { baseMeta, jsonLdMeta, pageMeta } from './meta.ts';
import { asList, htmlToText, imgs, min, num, pathRef, txt, uniq } from './text.ts';

export type Ld = Record<string, unknown>;
const MAX_BLOCKS = 50;
const MAX_BLOCK = 500_000;

function parseLd(s: string): unknown {
  try { return JSON.parse(s); } catch { /* try once more without raw control characters */ }
  try { return JSON.parse(s.replace(/[\u0000-\u001f]+/g, ' ')); } catch { return null; }
}

/** Every JSON-LD block on the page, flattened (@graph and arrays), or []. Bad JSON is skipped. */
export function jsonLdBlocks(html: string): Ld[] {
  const s = String(html || ''), low = s.toLowerCase();
  const out: Ld[] = [];
  let at = 0;
  for (let n = 0; n < MAX_BLOCKS;) {
    const i = low.indexOf('<script', at);
    const gt = i < 0 ? -1 : low.indexOf('>', i);
    const end = gt < 0 ? -1 : low.indexOf('</script', gt);
    if (end < 0) break;
    at = end + 8;
    if (!/type\s*=\s*["']?application\/ld\+json/.test(low.slice(i, Math.min(gt, i + 500)))) continue;
    n++;
    if (end - gt > MAX_BLOCK) continue;
    const v = parseLd(s.slice(gt + 1, end).trim());
    for (const node of asList(v)) {
      if (!node || typeof node !== 'object') continue;
      const x = node as Ld;
      if (Array.isArray(x['@graph'])) out.push(...(x['@graph'] as Ld[]).filter(g => g && typeof g === 'object'));
      else out.push(x);
    }
  }
  return out;
}

/** Product or ProductGroup, whichever way the type is written. */
export const isProduct = (n: Ld) => asList(n['@type']).some(t => /(^|[/:#])product(group)?$/i.test(String(t).slice(0, 100)));

/** The product's offers: its own (and an AggregateOffer's nested ones), else its variants' (ProductGroup). */
export function offersOf(prod: Ld): Ld[] {
  const own = (list: unknown[]) => list.flatMap(o => [o as Ld, ...(o && typeof o === 'object' && Array.isArray((o as Ld).offers) ? ((o as Ld).offers as Ld[]) : [])]).filter(o => o && typeof o === 'object');
  const direct = own(asList(prod.offers));
  return direct.length ? direct : own(asList(prod.hasVariant).flatMap(v => (v && typeof v === 'object' ? asList((v as Ld).offers) : [])));
}
/** priceSpecification is one object or a list of them (WooCommerce writes a list). */
const specs = (o: Ld): Ld[] => asList(o.priceSpecification).filter((s): s is Ld => !!s && typeof s === 'object');
export const offerPrices = (offers: Ld[]) => offers.flatMap(o => [num(o.price), num(o.lowPrice), ...specs(o).map(s => num(s.price))]);

const ldText = (v: unknown): string => (v && typeof v === 'object' ? ldText((v as Ld).name ?? (v as Ld)['@value'] ?? (v as Ld).url) : txt(v, 500));

/** The product on a page, or null when it has no JSON-LD Product. `url` is the page address. */
export function fromJsonLd(html: string, url: string): Found | null {
  const prod = jsonLdBlocks(html).find(isProduct);
  if (!prod) return null;
  const offers = offersOf(prod);
  const prices = offerPrices(offers);
  const avail = (o: Ld) => String(o.availability ?? '').toLowerCase();
  // An offer that names no availability at all is on sale as far as the page says (stores often leave it out):
  // counting it "out of stock" would end an in-stock-only import with nothing, for no stated reason.
  const inStock = offers.some(o => (avail(o) ? /instock|limitedavailability|preorder|onlineonly/.test(avail(o)) : offerPrices([o]).some(p => p != null)));
  const currency = txt(offers.flatMap(o => [o.priceCurrency, ...specs(o).map(s => s.priceCurrency)]).find(Boolean), 3).toUpperCase() || null;
  const colors = uniq(asList(prod.color).map(ldText));
  const sizes = uniq(asList(prod.size).map(ldText));
  const images = imgs(asList(prod.image).map(i => (i && typeof i === 'object' ? (i as Ld).url ?? (i as Ld).contentUrl : i)), url);
  const f: Found = {
    ref: pathRef(url), name: txt(prod.name, 200), url, sku: txt(prod.sku ?? prod.mpn, 80) || null,
    description: htmlToText(prod.description),
    price: min(prices), compare_at: null, currency, in_stock: inStock, sizes, color: colors.length === 1 ? colors[0] : null, images,
  };
  return { ...f, meta: { ...pageMeta(html), ...jsonLdMeta(prod), ...baseMeta(f) } };
}
