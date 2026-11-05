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
// update keeps the status people set in Shopify.
import { cleanHtml } from './content.ts';
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
export const UNPUBLISH = `mutation PbUnpublish($product: ProductUpdateInput!) {
  productUpdate(product: $product) { product { id status } userErrors { field message } }
}`;

/** Stock tracking is on, but Playbook sends no quantities: new variants start at 0 and stop selling at 0. */
export const STOCK_WARNING = 'Stock tracking is on for this website: the product starts with 0 in stock and cannot be bought until you set the quantities in Shopify.';

const money = (n: number | null) => (n === null || n === undefined || !(Number(n) > 0) ? null : Number(n).toFixed(2));

export function buildProductInput(a: { l: ListingRow; p: ProductRow; site: WebsiteRow; vendor: string; paths: string[]; withFiles: boolean; live: boolean; sendStatus: boolean; existing: Existing | null }): Record<string, unknown> {
  const { l, p, site, existing } = a;
  const tracked = !!site.track_inventory;
  const price = money(l.price);
  const compareAtPrice = l.compare_at_price !== null && Number(l.compare_at_price) > Number(l.price) ? money(l.compare_at_price) : null;
  const sizes = [...new Set((p.sizes || []).map(s => String(s).trim()).filter(Boolean))];
  const sku = String(p.sku || '').trim();
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
      inventoryItem: { ...(id ? {} : { tracked }), ...(sku ? { sku: sizes.length ? `${sku}-${name.replace(/\s+/g, '')}` : sku } : {}) },
    };
  };
  const handleMoves = !!existing && !!l.handle && l.handle !== existing.handle;
  const input: Record<string, unknown> = {
    title: l.title,
    descriptionHtml: cleanHtml(l.description_html || ''),   // staff edits come straight from the table: clean again here
    ...(l.handle ? { handle: l.handle } : {}),
    ...(handleMoves ? { redirectNewHandle: true } : {}), // the old URL keeps working
    ...(a.vendor ? { vendor: a.vendor } : {}),
    productType: l.product_type || p.category || '',
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
