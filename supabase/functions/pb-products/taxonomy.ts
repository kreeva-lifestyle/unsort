// The owner's tag taxonomy, read once per run: attributes (Colour, Work…),
// their values with "also known as" words, and which attributes each
// category uses (pb_category_attributes, in order). Built by hand on the Tags
// page; Playbook only ever chooses from it. Helpers shape it for the matcher
// (tagMatch.ts), the look-alike detector (tagLook.ts) and the AI (tagPrompt.ts).
import { getSettings, sel } from './db.ts';
import type { MatchAttr } from './tagMatch.ts';
import type { TaxValue } from './tagLook.ts';
import { type TagSpec, tagSpec } from './tagPrompt.ts';
import { tagKey } from './tagText.ts';

export interface AttrRow { id: string; name: string; key: string; multi: boolean; position: number; shopify_prefix: string | null }
export interface ValueRow { id: string; attribute_id: string; name: string; key: string; aliases: string[]; position: number }
export interface LinkRow { category: string; attribute_id: string; position: number }
export interface Taxonomy { attrs: AttrRow[]; values: ValueRow[]; links: LinkRow[]; categories: string[] }
export type AttrWithValues = AttrRow & { values: ValueRow[] };

export const ATTR_COLS = 'id,name,key,multi,position,shopify_prefix';
export const VALUE_COLS = 'id,attribute_id,name,key,aliases,position';
const MAX_VALUES = 20000;

export async function loadTaxonomy(categories?: string[]): Promise<Taxonomy> {
  const [attrs, values, links, cats] = await Promise.all([
    sel<AttrRow>(`pb_attributes?select=${ATTR_COLS}&order=position.asc,name.asc`),
    sel<ValueRow>(`pb_attribute_values?select=${VALUE_COLS}&order=position.asc,name.asc&limit=${MAX_VALUES}`),
    sel<LinkRow>('pb_category_attributes?select=category,attribute_id,position&order=position.asc'),
    categories ? Promise.resolve(categories) : getSettings().then(s => s.categories),
  ]);
  return { attrs, values: values.map(v => ({ ...v, aliases: v.aliases || [] })), links, categories: cats };
}

const sameCat = (a: string | null | undefined, b: string) => tagKey(a) === tagKey(b);

/** The attributes a category uses, in its order, each with its values. */
export function attrsFor(tax: Taxonomy, category: string | null | undefined): AttrWithValues[] {
  if (!String(category ?? '').trim()) return [];
  const ids = tax.links.filter(l => sameCat(category, l.category)).sort((a, b) => a.position - b.position).map(l => l.attribute_id);
  return ids.map(id => tax.attrs.find(a => a.id === id)).filter((a): a is AttrRow => !!a)
    .map(a => ({ ...a, values: tax.values.filter(v => v.attribute_id === a.id) }));
}

/** Every attribute with its values (ingest, before the category is known). */
export const allAttrs = (tax: Taxonomy): AttrWithValues[] => tax.attrs.map(a => ({ ...a, values: tax.values.filter(v => v.attribute_id === a.id) }));

export const matchAttrs = (list: AttrWithValues[]): MatchAttr[] =>
  list.map(a => ({ id: a.id, name: a.name, multi: a.multi, values: a.values.map(v => ({ id: v.id, name: v.name, key: v.key, aliases: v.aliases })) }));

/** Every value of every attribute, for the look-alike detector. */
export const taxValues = (tax: Taxonomy): TaxValue[] => {
  const name = new Map(tax.attrs.map(a => [a.id, a.name]));
  return tax.values.map(v => ({ id: v.id, attribute_id: v.attribute_id, attribute: name.get(v.attribute_id) ?? '', name: v.name, key: v.key, aliases: v.aliases }));
};

/** The reader's tag lists: every attribute linked to at least one category, and which category uses which. */
export function readerSpec(tax: Taxonomy): TagSpec {
  const linked = new Set(tax.links.map(l => l.attribute_id));
  const byCategory: Record<string, string[]> = {};
  for (const c of tax.categories) byCategory[c] = attrsFor(tax, c).map(a => a.id);
  return tagSpec(allAttrs(tax).filter(a => linked.has(a.id)), byCategory);
}
