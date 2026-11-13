// The owner's tag taxonomy, read once per run: attributes (Colour, Work…),
// their values with "also known as" words, and which attributes each
// category uses (pb_category_attributes, in order). Built by hand on the Tags
// page; Playbook only ever chooses from it. Helpers shape it for the matcher
// (tagMatch.ts), the look-alike detector (tagLook.ts) and the AI (tagPrompt.ts).
// Values that depend on the category (owner, 13 Nov 2026: Product Type — "the values are to be mapped against the
// category, so no mistake can happen"): an attribute with by_category on offers a value only for products of the
// categories ticked on it, and a value with none ticked nowhere (offered()). attrsFor / allAttrs hand out only the
// offered values, so the word rules, the AI's lists and staff's picks all follow it. SQL twin: pb_tag_offered()
// (20261113210000_pb_tag_value_categories.sql), used by the Ready check.
import { getSettings, sel } from './db.ts';
import { type MatchAttr, type MatchValue, isColour } from './tagMatch.ts';
import type { TaxValue } from './tagLook.ts';
import { type TagSpec, tagSpec } from './tagPrompt.ts';
import { tagKey } from './tagText.ts';

export interface AttrRow { id: string; name: string; key: string; multi: boolean; position: number; shopify_prefix: string | null; by_category: boolean }
export interface ValueRow { id: string; attribute_id: string; name: string; key: string; aliases: string[]; position: number; categories: string[] }
export interface LinkRow { category: string; attribute_id: string; position: number }
export interface Taxonomy { attrs: AttrRow[]; values: ValueRow[]; links: LinkRow[]; categories: string[] }
export type AttrWithValues = AttrRow & { values: ValueRow[] };

export const ATTR_COLS = 'id,name,key,multi,position,shopify_prefix,by_category';
export const VALUE_COLS = 'id,attribute_id,name,key,aliases,position,categories';
const MAX_VALUES = 20000;

export async function loadTaxonomy(categories?: string[]): Promise<Taxonomy> {
  const [attrs, values, links, cats] = await Promise.all([
    sel<AttrRow>(`pb_attributes?select=${ATTR_COLS}&order=position.asc,name.asc`),
    sel<ValueRow>(`pb_attribute_values?select=${VALUE_COLS}&order=position.asc,name.asc&limit=${MAX_VALUES}`),
    sel<LinkRow>('pb_category_attributes?select=category,attribute_id,position&order=position.asc'),
    categories ? Promise.resolve(categories) : getSettings().then(s => s.categories),
  ]);
  return { attrs: attrs.map(a => ({ ...a, by_category: a.by_category === true })), values: values.map(v => ({ ...v, aliases: v.aliases || [], categories: v.categories || [] })), links, categories: cats };
}

const sameCat = (a: string | null | undefined, b: string) => !!tagKey(a) && tagKey(a) === tagKey(b);

/** Is this value offered for a product of this category? Always, unless its attribute's values depend on the category;
 *  then only when the category is ticked on the value (none ticked = nowhere; no category = none of them). */
export const offered = (a: Pick<AttrRow, 'by_category'>, v: Pick<ValueRow, 'categories'>, category: string | null | undefined): boolean =>
  !a.by_category || (v.categories || []).some(c => sameCat(category, c));

const valuesOf = (tax: Taxonomy, a: AttrRow, category: string | null | undefined) =>
  tax.values.filter(v => v.attribute_id === a.id && offered(a, v, category));

/** The attributes a category uses, in its order, each with the values offered for it. */
export function attrsFor(tax: Taxonomy, category: string | null | undefined): AttrWithValues[] {
  if (!String(category ?? '').trim()) return [];
  const ids = tax.links.filter(l => sameCat(category, l.category)).sort((a, b) => a.position - b.position).map(l => l.attribute_id);
  return ids.map(id => tax.attrs.find(a => a.id === id)).filter((a): a is AttrRow => !!a)
    .map(a => ({ ...a, values: valuesOf(tax, a, category) }));
}

/** Every attribute with the values offered for `category` (ingest, where the category is often not known yet: an
 *  attribute whose values depend on it then offers none, and the read fills it once the category is settled). */
export const allAttrs = (tax: Taxonomy, category?: string | null): AttrWithValues[] => tax.attrs.map(a => ({ ...a, values: valuesOf(tax, a, category) }));

export const matchAttrs = (list: AttrWithValues[]): MatchAttr[] =>
  list.map(a => ({ id: a.id, name: a.name, multi: a.multi, values: a.values.map(v => ({ id: v.id, name: v.name, key: v.key, aliases: v.aliases })) }));

/** The Colour attribute's values, whatever is being looked for: the matcher keeps a word that is part of a colour's
 *  name ("Mehendi Green") from counting for another attribute (tagMatch.ts). */
export function shadesOf(tax: Taxonomy): MatchValue[] {
  const a = tax.attrs.find(isColour);
  return a ? tax.values.filter(v => v.attribute_id === a.id).map(v => ({ id: v.id, name: v.name, key: v.key, aliases: v.aliases })) : [];
}

/** Every value of every attribute, for the look-alike detector. */
export const taxValues = (tax: Taxonomy): TaxValue[] => {
  const name = new Map(tax.attrs.map(a => [a.id, a.name]));
  return tax.values.map(v => ({ id: v.id, attribute_id: v.attribute_id, attribute: name.get(v.attribute_id) ?? '', name: v.name, key: v.key, aliases: v.aliases }));
};

/** The reader's tag lists: every attribute linked to at least one category, and which category uses which. The reader
 *  settles the category in the same call, so an attribute whose values depend on it lists each value with its ticked
 *  categories (one ticked for none is left out); the read keeps only the ones offered for the category it chose. */
export function readerSpec(tax: Taxonomy): TagSpec {
  const linked = new Set(tax.links.map(l => l.attribute_id));
  const byCategory: Record<string, string[]> = {};
  for (const c of tax.categories) byCategory[c] = attrsFor(tax, c).map(a => a.id);
  const attrs = tax.attrs.filter(a => linked.has(a.id)).map(a => ({
    id: a.id, name: a.name, multi: a.multi, byCategory: a.by_category,
    values: tax.values.filter(v => v.attribute_id === a.id && (!a.by_category || v.categories.length))
      .map(v => ({ id: v.id, name: v.name, ...(a.by_category ? { categories: v.categories } : {}) })),
  }));
  return tagSpec(attrs, byCategory);
}
