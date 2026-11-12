// Pure: what ingest() gets for one product found on another store. No I/O
// (tested with node --test). The "Selling price" line goes in raw_text ONLY
// when the price is copied (sell_price), so the AI never reads another store's
// price as our vendor cost; with the switch off the product arrives without a
// price (needs_info) and the note still says what the store charges.
// Prices in a currency other than rupees are never copied, and neither is a
// Shopify price whose currency is not known (its product list does not say: the
// run reads the store's /meta.json, else the product page must show the same
// price in rupees) — $29 must never become ₹29. The store's extra
// facts (meta.ts) go to attributes, its SKU to the sku column; the product type
// and material also go in raw_text so the reader can pick category and fabric.
import { HttpError } from '../http.ts';
import type { Found } from './normalize.ts';

export const istDate = (d = new Date()) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

/** The product's source_ref: '<host>:<id on that site>' (dedupe key with source 'import'). */
export const sourceRef = (host: string, ref: string) => `${host}:${ref}`.slice(0, 200);

/** The same site under its other address: "www.shop.com" and "shop.com" are one store. */
export const hostTwin = (host: string) => (host.startsWith('www.') ? host.slice(4) : `www.${host}`);
/** A source_ref as the site's other address would have written it ('' when it has no host part). */
export function refTwin(ref: string): string {
  const at = ref.indexOf(':');
  return at > 0 ? `${hostTwin(ref.slice(0, at))}${ref.slice(at)}`.slice(0, 200) : '';
}
/** The PostgREST `in.(…)` list for a source_ref: itself and, for an imported product, its other address. */
export function refList(source: string, ref: string): string {
  const twin = source === 'import' ? refTwin(ref) : '';
  return [ref, ...(twin ? [twin] : [])].map(r => `"${r.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',');
}

/** A store's size choices as it writes them ("XS (34)"), cleaned: short texts, no repeats, at most 30. */
export const storeSizes = (v: unknown): string[] =>
  [...new Set((Array.isArray(v) ? v : []).map(s => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)).filter(Boolean))].slice(0, 30);

/** The facts only a website import may hand to ingest(): the store's SKU, its size choices as written, and its
 *  extra facts as short plain texts (keys a-z0-9_). Anything else that sends them is refused. */
export function importFacts(b: { source?: unknown; sku?: unknown; sizes?: unknown; attributes?: unknown; in_stock?: unknown }): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const sizes = storeSizes(b.sizes), sku = String(b.sku ?? '').replace(/\s+/g, ' ').trim();
  const given = b.attributes !== undefined && b.attributes !== null, soldOut = b.in_stock === false;
  if (!given && !sku && !sizes.length && !soldOut) return out;
  if (b.source !== 'import') throw new HttpError(400, "attributes, sku, sizes and stock are taken only from a website import (source 'import').");
  if (soldOut) out.in_stock = false; // sold out at its store when it was copied (in stock is the column's default)
  if (sku) out.sku = sku.slice(0, 80);
  if (sizes.length) out.sizes = sizes; // kept as written ("XS (34)"): the reader never retypes them
  if (given) {
    if (typeof b.attributes !== 'object' || Array.isArray(b.attributes)) throw new HttpError(400, 'attributes must be an object of short texts.');
    const attrs: Record<string, string> = {};
    for (const [k, v] of Object.entries(b.attributes as Record<string, unknown>).slice(0, 30)) {
      const t = String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 500);
      if (/^[a-z][a-z0-9_]{0,39}$/.test(k) && t && typeof v !== 'object') attrs[k] = t;
    }
    if (Object.keys(attrs).length) out.attributes = attrs;
  }
  return out;
}

/** What ingest() gets for one found product. Exported for the tests. */
export function ingestBody(f: Found, run: { host: string; use_their_price: boolean; platform?: string | null }, vendor: string, date = istDate()): Record<string, unknown> {
  const unknownCur = !f.currency && run.platform === 'shopify';
  const rupees = f.price !== null && f.price > 0 && !unknownCur && (!f.currency || f.currency === 'INR');
  const copy = run.use_their_price && rupees;
  const m = f.meta || {};
  const lines = [f.name, f.description, f.sku ? `SKU: ${f.sku}` : '', f.sizes.length ? `Sizes: ${f.sizes.join(', ')}` : '', f.color ? `Colour: ${f.color}` : '',
    m.product_type ? `Product type: ${m.product_type}` : '', m.material ? `Material: ${m.material}` : ''];
  if (copy) lines.push(`Selling price on ${run.host}: ₹${f.price}${f.compare_at && f.compare_at > (f.price ?? 0) ? ` (shown as reduced from ₹${f.compare_at})` : ''}`);
  const note = f.price === null || f.price <= 0 ? null
    : copy ? `Price copied from ${run.host} on ${date}${f.compare_at && f.compare_at > f.price! ? ` (shown there as reduced from ₹${f.compare_at})` : ''}`
      : unknownCur ? `${run.host} sells it for ${f.price} (the store does not say in which currency; seen ${date}); the price was not copied.`
        : `${run.host} sells it for ${rupees ? '₹' : `${f.currency} `}${f.price} (seen ${date}); the price was not copied.`;
  return {
    source: 'import', source_ref: sourceRef(run.host, f.ref), raw_text: lines.filter(Boolean).join('\n').slice(0, 20_000),
    vendor_name: vendor, image_urls: f.images, source_url: f.url,
    ...(copy ? { sell_price: f.price } : {}), ...(note ? { price_note: note } : {}),
    // The store's facts (brand, type, tags, barcode, weight, SEO…) → attributes; the SKU → the sku column.
    // The size choices go in as they are, so the reader does not retype them (it shortened "XS (34)" to "XS" on 109 of 136).
    ...(Object.keys(m).length ? { attributes: m } : {}), ...(f.sku ? { sku: f.sku } : {}), ...(f.sizes.length ? { sizes: storeSizes(f.sizes) } : {}),
    ...(f.in_stock ? {} : { in_stock: false }),
  };
}
