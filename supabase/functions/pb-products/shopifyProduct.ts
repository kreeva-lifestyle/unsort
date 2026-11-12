// What a store already has for one listing, read before productSet so a
// publish never makes a second copy and an update keeps its variant ids:
//   existingProduct → handle, options and variants of a known product id;
//   adoptable       → a product this listing made earlier whose id was lost
//                     (timeout, crash), found by handle + the playbook.listing_id
//                     metafield written when Playbook creates a product.
import { gql } from './shopify.ts';
import type { WebsiteRow } from './types.ts';

export const MF_NAMESPACE = 'playbook';
export const MF_KEY = 'listing_id';

export interface Existing {
  id: string; handle: string;
  options: { id: string; name: string; values: { id: string; name: string }[] }[];
  variants: { id: string; key: string }[]; // key = "option=value|option=value", lower-case
  /** The product's photos as the store has them, in order (videos and 3D models left out). */
  media: { id: string; alt: string }[];
}

const FIELDS = `id handle
  options { id name optionValues { id name } }
  variants(first: 100) { nodes { id selectedOptions { name value } } }
  media(first: 50) { nodes { id alt mediaContentType } }
  metafield(namespace: "${MF_NAMESPACE}", key: "${MF_KEY}") { value }`;

interface Node {
  id: string; handle: string;
  options: { id: string; name: string; optionValues: { id: string; name: string }[] }[];
  variants: { nodes: { id: string; selectedOptions: { name: string; value: string }[] }[] };
  media?: { nodes: { id: string; alt: string | null; mediaContentType: string }[] };
  metafield: { value: string } | null;
}

export const variantKey = (opts: { name: string; value: string }[]) =>
  opts.map(o => `${o.name.trim().toLowerCase()}=${o.value.trim().toLowerCase()}`).join('|');

const shape = (n: Node): Existing => ({
  id: n.id, handle: n.handle,
  options: (n.options || []).map(o => ({ id: o.id, name: o.name, values: (o.optionValues || []).map(v => ({ id: v.id, name: v.name })) })),
  variants: (n.variants?.nodes || []).map(v => ({ id: v.id, key: variantKey(v.selectedOptions || []) })),
  media: (n.media?.nodes || []).filter(m => m.mediaContentType === 'IMAGE').map(m => ({ id: m.id, alt: m.alt || '' })),
});

/** The product as the store has it now; null when it was deleted in Shopify. */
export async function existingProduct(site: WebsiteRow, id: string, ms: number): Promise<Existing | null> {
  const d = await gql<{ product: Node | null }>(site, `query PbExisting($id: ID!) { product(id: $id) { ${FIELDS} } }`, { id }, ms);
  return d.product ? shape(d.product) : null;
}

/** A product on this store that THIS listing created before (same metafield), looked up by each
 *  handle it may have been given, in one request. */
export async function adoptable(site: WebsiteRow, listingId: string, handles: string[], ms: number): Promise<Existing | null> {
  const hs = [...new Set(handles.filter(Boolean))].slice(0, 6);
  if (!hs.length) return null;
  const q = `query PbByHandle(${hs.map((_, i) => `$h${i}: String!`).join(', ')}) {
    ${hs.map((_, i) => `p${i}: productByIdentifier(identifier: { handle: $h${i} }) { ${FIELDS} }`).join('\n    ')}
  }`;
  const d = await gql<Record<string, Node | null>>(site, q, Object.fromEntries(hs.map((h, i) => [`h${i}`, h])), ms);
  const hit = hs.map((_, i) => d[`p${i}`]).find(n => n && n.metafield?.value === listingId);
  return hit ? shape(hit) : null;
}
