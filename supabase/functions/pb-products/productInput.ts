// Pure: the productSet input for one listing, and the GraphQL documents.
// Sizes → option "Size" with one variant each; no sizes → Shopify's single
// "Title / Default Title" variant. Photos are sent only on create or when
// they changed (productSet replaces the media list when `files` is given).
// On update the store's own option / variant ids are passed back, so the
// variants are updated in place (ids, stock and carts survive); stock policy
// and tracking are set only on variants Playbook creates (tracked → DENY: no
// sale below 0; not tracked → CONTINUE). The playbook.listing_id metafield,
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
// Shopify. Alt text for photos that did not change goes out with fileUpdate
// (ALT_UPDATE, publish.ts), because `files` here would upload them again.
import { cleanHtml } from './content.ts';
import { shopCategory } from './garment.ts';
import { publicUrl } from './db.ts';
import { type Existing, MF_KEY, MF_NAMESPACE, variantKey } from './shopifyProduct.ts';
import type { ListingRow, ProductRow, WebsiteRow } from './types.ts';

export const PRODUCT_SET = `mutation PbProductSet($input: ProductSetInput!, $identifier: ProductSetIdentifiers) {
  productSet(synchronous: true, input: $input, identifier: $identifier) {
    product { id status handle }
    userErrors { field message code }
  }
}`;
export const PUBLISH = `mutation PbPublish($id: ID!, $input: [PublicationInput!]!) {
  publishablePublish(id: $id, input: $input) { userErrors { field message } }
}`;
export const ALT_UPDATE = `mutation PbAlts($files: [FileUpdateInput!]!) {
  fileUpdate(files: $files) { userErrors { field message } }
}`;
export const UNPUBLISH = `mutation PbUnpublish($product: ProductUpdateInput!) {
  productUpdate(product: $product) { product { id status } userErrors { field message } }
}`;

/** Stock tracking is on, but Playbook sends no quantities: new variants start at 0 and stop selling at 0. */
export const STOCK_WARNING = 'Stock tracking is on for this website: the product starts with 0 in stock and cannot be bought until you set the quantities in Shopify.';

/** A size label without its measurement: "XS (34)" → "XS". */
const sizeCore = (s: string) => s.replace(/\(.*?\)/g, ' ').replace(/\s+/g, ' ').trim();

/** The product's SKU without a size at its end, and what joined the two ("NKB 47 PURPLE XS" → "NKB 47 PURPLE" and
 *  " "). A product copied from another store carries its first size's own SKU; each size on Shopify gets the base,
 *  the same joiner and its own size, which gives back the store's own code for every size ("NKB 47 PURPLE S").
 *  A SKU with no size at its end is the base, joined with "-" ("RG-1042" → "RG-1042-M"). */
export function skuParts(sku: string, sizes: string[]): { base: string; join: string } {
  const s = String(sku || '').trim(), cores = sizes.map(x => sizeCore(x).toLowerCase()).filter(Boolean);
  const m = /^(.*[^\s\-_/])([\s\-_/]+)([^\s\-_/]+)$/.exec(s);
  return m && cores.includes(m[3].toLowerCase()) ? { base: m[1], join: m[2] } : { base: s, join: '-' };
}
export const skuBase = (sku: string, sizes: string[]) => skuParts(sku, sizes).base;

const money = (n: number | null) => (n === null || n === undefined || !(Number(n) > 0) ? null : Number(n).toFixed(2));

/** The photos whose alt text on the store differs from the listing's: only when the store still has exactly
 *  the photos Playbook sent, in the same number (someone who added or removed one in Shopify keeps their own). */
export function altUpdates(media: { id: string; alt: string }[], alts: string[], photos: number): { id: string; alt: string }[] {
  if (!photos || media.length !== photos) return [];
  return media.flatMap((m, i) => { const alt = String(alts[i] || '').slice(0, 512); return alt && alt !== m.alt ? [{ id: m.id, alt }] : []; });
}

/** `vendor` = the store's brand name (profile.brand). */
export function buildProductInput(a: { l: ListingRow; p: ProductRow; site: WebsiteRow; vendor: string; paths: string[]; withFiles: boolean; live: boolean; sendStatus: boolean; existing: Existing | null; tail?: string; noCategory?: boolean }): Record<string, unknown> {
  const { l, p, site, existing } = a;
  const tracked = !!site.track_inventory;
  const price = money(l.price);
  const compareAtPrice = l.compare_at_price !== null && Number(l.compare_at_price) > Number(l.price) ? money(l.compare_at_price) : null;
  const sizes = [...new Set((p.sizes || []).map(s => String(s).trim()).filter(Boolean))];
  const { base: sku, join } = skuParts(String(p.sku || ''), sizes);
  const optName = sizes.length ? 'Size' : 'Title';
  const values = sizes.length ? sizes : ['Default Title'];
  const oldOpt = existing?.options.find(o => o.name.trim().toLowerCase() === optName.toLowerCase());
  const oldVariant = new Map((existing?.variants || []).map(v => [v.key, v.id]));
  const variant = (name: string, i: number) => {
    const id = oldVariant.get(variantKey([{ name: optName, value: name }]));
    return {
      ...(id ? { id } : { inventoryPolicy: tracked ? 'DENY' : 'CONTINUE' }), // an existing variant keeps the stock policy set in Shopify
      optionValues: [{ optionName: optName, name }],
      position: i + 1,
      price, compareAtPrice,
      inventoryItem: { ...(id ? {} : { tracked }), ...(sku ? { sku: sizes.length ? `${sku}${join}${(sizeCore(name) || name).replace(/\s+/g, '')}` : sku } : {}) },
    };
  };
  const handleMoves = !!existing && !!l.handle && l.handle !== existing.handle;
  const category = a.sendStatus && !a.noCategory ? shopCategory(p.category, p.attributes?.set_contents) : null; // with the status: on a create, a recovered create or Put back
  const input: Record<string, unknown> = {
    title: l.title,
    descriptionHtml: cleanHtml(l.description_html || '') + (a.tail || ''),   // staff edits come straight from the table: clean again here
    ...(l.handle ? { handle: l.handle } : {}),
    ...(handleMoves ? { redirectNewHandle: true } : {}), // the old URL keeps working
    ...(a.vendor ? { vendor: a.vendor } : {}),
    productType: l.product_type || p.category || '',
    ...(category ? { category } : {}),
    tags: l.tags || [],
    ...(a.sendStatus ? { status: a.live ? 'ACTIVE' : 'DRAFT' } : {}),
    seo: { title: l.seo_title || l.title, description: l.seo_description || '' },
    ...(existing ? {} : { metafields: [{ namespace: MF_NAMESPACE, key: MF_KEY, type: 'single_line_text_field', value: l.id }] }),
    productOptions: [{
      ...(oldOpt ? { id: oldOpt.id } : {}), name: optName, position: 1,
      values: values.map(name => {
        const vid = oldOpt?.values.find(v => v.name.trim().toLowerCase() === name.toLowerCase())?.id;
        return vid ? { id: vid, name } : { name };
      }),
    }],
    variants: values.map((s, i) => variant(s, i)),
  };
  if (a.withFiles && a.paths.length) {
    input.files = a.paths.map((path, i) => ({ originalSource: publicUrl(path), alt: String(l.image_alts?.[i] || '').slice(0, 512), contentType: 'IMAGE' }));
  }
  return input;
}
