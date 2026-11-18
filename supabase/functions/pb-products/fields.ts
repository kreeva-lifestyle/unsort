// Pure: the custom fields (Shopify metafields) a listing sends with its
// product, and the FAQ as HTML for stores that show it in the description.
//   custom.fabric / work / colour / occasion / set_contents   single line text,
//     filled by a program from the product's facts (never by the AI)
//   custom.faq   rich text: each question in bold, its answer below
// They go out with metafieldsSet AFTER productSet (publish.ts): metafieldsSet
// writes only the keys it is given, so other apps' and the merchant's fields
// are never touched (productSet would delete every field not in its input).
// A field the store already had goes in that field's kind (fieldsSend.ts).
// An empty fact is not sent; a fact that went empty is left as it is on the
// store. No I/O — tested in test/fields.test.mjs.
// As Playbook (owner, 2026-11-17: "Product Specifications & Custom Attributes
// (Metafields) as per playbook"): given the product's Playbook tags, one field
// per attribute (storeFields.ts fieldDefs: colour, fabric, work, occasion,
// product_type…) holds its chosen values — a list where the attribute takes
// several — and only an attribute with none falls back to the read fact.
import type { Faq } from './seoCheck.ts';
import { LIST, TEXT, fieldKey } from './storeFields.ts';
import type { ProductRow } from './types.ts';

export const FIELD_NS = 'custom';
export const METAFIELDS_SET = `mutation PbFields($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) { userErrors { field message code elementIndex } }
}`;

export interface FieldInput { ownerId: string; namespace: string; key: string; type: string; value: string }

const one = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 255);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** fabric, work, colour, occasion, set_contents from the product's facts (empty ones left out). */
export function detailFields(p: Pick<ProductRow, 'fabric' | 'color' | 'attributes'>): Record<string, string> {
  const a = p.attributes || {};
  const all: Record<string, string> = { fabric: one(p.fabric), work: one(a.work), colour: one(p.color), occasion: one(a.occasion), set_contents: one(a.set_contents) };
  return Object.fromEntries(Object.entries(all).filter(([, v]) => v));
}

/** Shopify rich text: each question as a bold paragraph, its answer as the next paragraph (the two node
 *  kinds every version of the rich text format takes). */
export const faqRichText = (faq: Faq[]) => JSON.stringify({
  type: 'root',
  children: faq.flatMap(f => [
    { type: 'paragraph', children: [{ type: 'text', value: f.q, bold: true }] },
    { type: 'paragraph', children: [{ type: 'text', value: f.a }] },
  ]),
});

/** The two questions at the end of the description (stores that do not show the custom field). */
export const faqHtml = (faq: Faq[]) => (faq.length ? `<h3>Questions</h3>${faq.map(f => `<p><strong>${esc(f.q)}</strong><br>${esc(f.a)}</p>`).join('')}` : '');

/** One Playbook attribute and the product's chosen values for it (tagStore.ts attributeValues). */
export interface AttrValues { key: string; multi: boolean; values: string[] }

/** The attribute fields: the chosen values, else the read fact (colour ← color, fabric, else attributes[key]). */
function attributeFields(p: Pick<ProductRow, 'fabric' | 'color' | 'attributes'>, attrs: AttrValues[]): { key: string; type: string; value: string }[] {
  const out: { key: string; type: string; value: string }[] = [], seen = new Set<string>();
  for (const a of attrs) {
    const key = fieldKey(a.key);
    if (key.length < 2 || seen.has(key) || key === 'set_contents' || key === 'faq') continue;
    seen.add(key);
    const fact = one(key === 'colour' || key === 'color' ? p.color : key === 'fabric' ? p.fabric : (p.attributes || {})[key]);
    const list = [...new Set(a.values.map(one).filter(Boolean))];
    const vals = list.length ? list : fact ? [fact] : [];
    if (!vals.length) continue;
    out.push(a.multi ? { key, type: LIST, value: JSON.stringify(vals) } : { key, type: TEXT, value: vals[0] });
  }
  return out;
}

/** `attrs`: the store's attributes with the product's values (as Playbook); none given → the five read facts as before. */
export function fieldInputs(productId: string, p: Pick<ProductRow, 'fabric' | 'color' | 'attributes'>, faq: Faq[], attrs: AttrValues[] = []): FieldInput[] {
  const set = one((p.attributes || {}).set_contents);
  const base = attrs.length ? [...attributeFields(p, attrs), ...(set ? [{ key: 'set_contents', type: TEXT, value: set }] : [])]
    : Object.entries(detailFields(p)).map(([key, value]) => ({ key, type: TEXT, value }));
  const out: FieldInput[] = base.map(f => ({ ownerId: productId, namespace: FIELD_NS, ...f }));
  if (faq.length) out.push({ ownerId: productId, namespace: FIELD_NS, key: 'faq', type: 'rich_text_field', value: faqRichText(faq) });
  return out;
}
