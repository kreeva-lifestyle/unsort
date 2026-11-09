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
import type { Found } from './normalize.ts';

export const istDate = (d = new Date()) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

/** The product's source_ref: '<host>:<id on that site>' (dedupe key with source 'import'). */
export const sourceRef = (host: string, ref: string) => `${host}:${ref}`.slice(0, 200);

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
    ...(Object.keys(m).length ? { attributes: m } : {}), ...(f.sku ? { sku: f.sku } : {}),
  };
}
