// Pure: the productSet input for one listing, and the GraphQL documents.
// Sizes → option "Size" with one variant each; no sizes → Shopify's single
// "Title / Default Title" variant. Photos are sent only on create or when
// they changed (productSet replaces the media list when `files` is given).
// On update the store's own option / variant ids are passed back, so the
// variants are updated in place (ids, stock and carts survive); how stock
// policy and tracking are set is under "Stock" below. The playbook.listing_id metafield,
// which lets a lost create be found again, is written on create only: on an
// update productSet would delete every metafield not in the input (apps',
// the merchant's). `status` is sent only when asked (create / Put back), so an
// update keeps the status people set in Shopify. `tail` is the FAQ a store
// shows at the end of its description (fields.ts faqHtml); the listing's own
// custom fields go out separately, with metafieldsSet (publish.ts).
// Owner, 2026-11-12 (research report): `vendor` is the STORE'S BRAND, never the
// supplier (themes publish the vendor as the brand; the supplier stays inside
// Playbook), and Shopify's standard category (garment.ts) is set when the
// product is created — a later update leaves the category people chose in
// Shopify.
// Shopify sync check (2026-11-12): `files` is built by publishParts.ts filesFor
// (a photo already on the store is sent by its id, so nothing is uploaded
// twice and the store's own media stays); an existing size is matched by its
// label and, failing that, by the size without its measurement, so a relabel
// ("S" → "S (36)") renames the variant instead of deleting it and its stock;
// a choice someone added in Shopify stops the update with a plain sentence
// instead of being deleted; weight and cost go out with a new variant.
// Owner, 2026-11-12: "Country of origin by default India. Barcode value same
// as product code." Every size's barcode is its own code (sent each time, as
// the SKU is); India is set on a new variant only, so another country chosen
// in Shopify stays.
// Stock (owner, 2026-11-12: "If stock out/in-stock on playbook that same
// happens in shopify stores", then: "'Continue selling when out of stock' must
// be on if the product is in-stock and vice versa if out of stock"): on a
// store where Playbook decides (Track stock off) every size has Track quantity
// ON, on every send, and Shopify's "Continue selling when out of stock" box
// follows Playbook: ticked (CONTINUE) while the product is in stock, so it
// sells at a count of 0; unticked (DENY) when it is out of stock, so at 0 the
// store shows "Sold out". No count is sent. On a store that counts stock
// itself (Track stock on) its own numbers decide, as before (a new size
// starts tracked at 0 with the box unticked).
import { cleanHtml } from './content.ts';
import { uniqueCi } from './db.ts';
import { shopCategory } from './garment.ts';
import { HttpError } from './http.ts';
import { apiVersion } from './shopify.ts';
import { type Existing, MF_KEY, MF_NAMESPACE, variantKey } from './shopifyProduct.ts';
import { codeBase, sizeCore, skuParts } from './skuCode.ts';
import { permOut, type ListingRow, type ProductRow, type WebsiteRow } from './types.ts';

export const PRODUCT_SET = `mutation PbProductSet($input: ProductSetInput!, $identifier: ProductSetIdentifiers) {
  productSet(synchronous: true, input: $input, identifier: $identifier) {
    product { id status handle media(first: 250) { nodes { id } } }
    userErrors { field message code }
  }
}`;
export const PUBLISH = `mutation PbPublish($id: ID!, $input: [PublicationInput!]!) {
  publishablePublish(id: $id, input: $input) { userErrors { field message } }
}`;
export const UNPUBLISH = `mutation PbUnpublish($product: ProductUpdateInput!) {
  productUpdate(product: $product) { product { id status } userErrors { field message } }
}`;

/** Stock tracking is on, but Playbook sends no quantities: new variants start at 0 and stop selling at 0. */
export const STOCK_WARNING = 'Stock tracking is on for this website: the product starts with 0 in stock and cannot be bought until you set the quantities in Shopify.';

export { codeBase, keptColour, skuBase, skuParts } from './skuCode.ts';

const money = (n: number | null) => (n === null || n === undefined || !(Number(n) > 0) ? null : Number(n).toFixed(2));

/** "700 g" / "1.25 kg" (import/meta.ts gramsText) as Shopify's weight; null when it is not one of those. */
export function weightOf(text: unknown): { value: number; unit: 'GRAMS' | 'KILOGRAMS' } | null {
  const m = /^\s*(\d+(?:\.\d+)?)\s*(g|kg)\s*$/i.exec(String(text ?? ''));
  const value = m ? Number(m[1]) : 0;
  return m && value > 0 && value < 100_000 ? { value, unit: m[2].toLowerCase() === 'kg' ? 'KILOGRAMS' : 'GRAMS' } : null;
}

/** `vendor` (the store's brand) and `l.tags` are sent as given (publish.ts merges the store's own tags in);
 *  `files` = publishParts.ts filesFor, null when the photos need no change. */
export function buildProductInput(a: { l: ListingRow; p: ProductRow; site: WebsiteRow; vendor: string; files: Record<string, unknown>[] | null; live: boolean; sendStatus: boolean; existing: Existing | null; tail?: string; noCategory?: boolean }): Record<string, unknown> {
  const { l, p, site, existing } = a;
  const tracked = !!site.track_inventory, inStock = p.in_stock !== false;
  const price = money(l.price);
  const compareAtPrice = l.compare_at_price !== null && Number(l.compare_at_price) > Number(l.price) ? money(l.compare_at_price) : null;
  const sizes = uniqueCi((p.sizes || []).map(s => String(s).replace(/\s+/g, ' ').trim()).filter(Boolean)); // "S" and "s" are one size
  const parts = skuParts(String(p.sku || ''), sizes), join = parts.join;
  const sku = codeBase(l, p, parts.base, join);
  const optName = sizes.length ? 'Size' : 'Title';
  const values = sizes.length ? sizes : ['Default Title'];
  // A choice the store has that Playbook did not make (someone added "Colour" in Shopify): productSet would delete it.
  const foreign = (existing?.options || []).filter(o => !['size', 'title'].includes(o.name.trim().toLowerCase())).map(o => o.name);
  if (foreign.length) throw new HttpError(400, `${site.name}: this product has a choice on Shopify that Playbook did not make (${foreign.join(', ')}). Playbook left the product as it is. Remove that choice in Shopify, or look after this product there.`);
  const oldOpt = existing?.options.find(o => o.name.trim().toLowerCase() === optName.toLowerCase());
  const oldVariant = new Map((existing?.variants || []).map(v => [v.key, v.id]));
  // The same size under another label ("S" on the store, "S (36)" here): matched by the size without its
  // measurement, but only what the labels left unmatched, and only when one size here and one there share it —
  // so no store variant is ever given to two sizes.
  const core = (v: string) => sizeCore(v).toLowerCase();
  const lead = `${optName.toLowerCase()}=`;
  const pair = (exact: (name: string) => string | undefined, store: [string, string][]): (string | undefined)[] => {
    const ids = values.map(exact), used = new Set(ids.filter(Boolean));
    const free = store.filter(([k, id]) => k && !used.has(id));
    const want = values.map((n, i) => (ids[i] || !sizes.length ? '' : core(n)));
    const one = <T,>(list: T[], is: (x: T) => boolean) => list.filter(is).length === 1;
    return values.map((_, i) => ids[i] ?? (want[i] && one(want, w => w === want[i]) && one(free, ([k]) => k === want[i]) ? free.find(([k]) => k === want[i])![1] : undefined));
  };
  const variantIds = pair(name => oldVariant.get(variantKey([{ name: optName, value: name }])),
    (existing?.variants || []).map((v): [string, string] => [v.key.startsWith(lead) && !v.key.includes('|') ? core(v.key.slice(lead.length)) : '', v.id]));
  const valueIds = pair(name => oldOpt?.values.find(v => v.name.trim().toLowerCase() === name.toLowerCase())?.id,
    (oldOpt?.values || []).map((v): [string, string] => [core(v.name), v.id]));
  const weight = weightOf(p.attributes?.weight), cost = Number(p.cost_price) > 0 ? Number(p.cost_price).toFixed(2) : null;
  const newBarcodes = apiVersion(site) >= '2026-10'; // `barcodes` replaced the single `barcode` field
  const variant = (name: string, i: number) => {
    const id = variantIds[i];
    const code = sku ? (sizes.length ? `${sku}${join}${(sizeCore(name) || name).replace(/\s+/g, '')}` : sku) : '';
    const stock = tracked ? (id ? null : { policy: 'DENY', tracked: true }) : { policy: inStock ? 'CONTINUE' : 'DENY', tracked: true };
    return {
      ...(id ? { id } : {}), ...(stock ? { inventoryPolicy: stock.policy } : {}),
      optionValues: [{ optionName: optName, name }],
      position: i + 1,
      price, compareAtPrice,
      ...(code ? (newBarcodes ? { barcodes: [{ value: code }] } : { barcode: code }) : {}),
      // A new variant also gets its weight (for shipping rates), its cost and India as its country of origin; an existing one keeps what Shopify has.
      inventoryItem: { ...(stock ? { tracked: stock.tracked } : {}), ...(id ? {} : { countryCodeOfOrigin: 'IN', ...(weight ? { measurement: { weight } } : {}), ...(cost ? { cost } : {}) }),
        ...(code ? { sku: code } : {}) },
    };
  };
  const handleMoves = !!existing && !!l.handle && l.handle !== existing.handle;
  const category = !existing && !a.noCategory ? shopCategory(p.category, p.attributes?.set_contents) : null; // on a create only: later the store's own choice stays
  const input: Record<string, unknown> = {
    title: l.title,
    descriptionHtml: cleanHtml(l.description_html || '') + (a.tail || ''),   // staff edits come straight from the table: clean again here
    ...(l.handle ? { handle: l.handle } : {}),
    ...(handleMoves ? { redirectNewHandle: true } : {}), // the old URL keeps working
    ...(a.vendor ? { vendor: a.vendor } : {}),
    productType: l.product_type || p.category || '',
    ...(category ? { category } : {}),
    tags: l.tags || [],
    // A permanent stock-out (stock.ts takeOffSale): the Shopify product is archived, whatever else this send says.
    ...(permOut(p) ? { status: 'ARCHIVED' } : a.sendStatus ? { status: a.live ? 'ACTIVE' : 'DRAFT' } : {}),
    seo: { title: l.seo_title || l.title, description: l.seo_description || '' },
    ...(existing ? {} : { metafields: [{ namespace: MF_NAMESPACE, key: MF_KEY, type: 'single_line_text_field', value: l.id }] }),
    productOptions: [{
      ...(oldOpt ? { id: oldOpt.id } : {}), name: optName, position: 1,
      values: values.map((name, i) => (valueIds[i] ? { id: valueIds[i], name } : { name })),
    }],
    variants: values.map((s, i) => variant(s, i)),
  };
  if (a.files) input.files = a.files;
  return input;
}
