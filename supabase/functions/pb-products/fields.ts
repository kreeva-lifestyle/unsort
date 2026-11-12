// Pure: the custom fields (Shopify metafields) a listing sends with its
// product, and the FAQ as HTML for stores that show it in the description.
//   custom.fabric / work / colour / occasion / set_contents   single line text,
//     filled by a program from the product's facts (never by the AI)
//   custom.faq   rich text: each question in bold, its answer below
// They go out with metafieldsSet AFTER productSet (publish.ts): metafieldsSet
// writes only the keys it is given, so other apps' and the merchant's fields
// are never touched (productSet would delete every field not in its input).
// metafieldsSet saves all or nothing: a field the store refuses (its own
// definition has another type) is left out and the rest sent again
// (publishParts.ts sendFields, by `elementIndex`).
// An empty fact is not sent; a fact that went empty is left as it is on the
// store. No I/O — tested in test/fields.test.mjs.
import type { Faq } from './seoCheck.ts';
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

export function fieldInputs(productId: string, p: Pick<ProductRow, 'fabric' | 'color' | 'attributes'>, faq: Faq[]): FieldInput[] {
  const out: FieldInput[] = Object.entries(detailFields(p)).map(([key, value]) => ({ ownerId: productId, namespace: FIELD_NS, key, type: 'single_line_text_field', value }));
  if (faq.length) out.push({ ownerId: productId, namespace: FIELD_NS, key: 'faq', type: 'rich_text_field', value: faqRichText(faq) });
  return out;
}
