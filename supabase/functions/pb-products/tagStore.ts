// Product values in the database (pb_product_values) around the pure steps:
// the rules + AI choice (tagAuto.ts) written in ONE SQL call
// (pb_product_values_set: 'auto' replaces the rules / AI rows of the
// attributes it was given and never touches a 'manual' one, 'manual'
// replaces what staff edited, 'add' only
// fills attributes that have nothing), then pb_products_refresh re-applies
// the ready gate (tagGate.ts) and the tags cache. Suggestions go to
// pb_tag_suggest (ignored phrases are never suggested again). Where it runs:
// ingest (rules over every attribute — the category is not known yet), the
// reader (rules for the category + the AI's choices), the values-only AI pass
// (tagFill.ts), retag and product_values_set (tagsActions.ts).
import { enc, rpc, sel } from './db.ts';
import { plain } from './http.ts';
import { type Suggest, type ValueSet, autoValues, suggestable } from './tagAuto.ts';
import type { ReadTags } from './tagPrompt.ts';
import { type ChosenTag, valueTags } from './tags.ts';
import { type Taxonomy, allAttrs, attrsFor, matchAttrs, offered, shadesOf, taxValues } from './taxonomy.ts';
import type { ProductRow } from './types.ts';

export interface Refreshed { id: string; status: string; was: string; missing: string[] }
export interface PvRow { value_id: string; source: string; attribute_id: string }

export const tagsLocked = (p: { locked: string[] | null }) => (p.locked || []).includes('tags');

/** A product's values with their attribute (one read). */
export async function productValues(productId: string): Promise<PvRow[]> {
  const rows = await sel<{ value_id: string; source: string; pb_attribute_values: { attribute_id: string } | null }>(
    `pb_product_values?product_id=eq.${enc(productId)}&select=value_id,source,pb_attribute_values(attribute_id)`);
  return rows.map(r => ({ value_id: r.value_id, source: r.source, attribute_id: r.pb_attribute_values?.attribute_id ?? '' }));
}

/** Write values in one transaction and re-apply the gate; returns the product's new status. `run`: the bulk change this
 *  write belongs to (bulkLog.ts), so it can be taken back. */
export async function writeValues(productId: string, rows: { value_id: string; source: string }[], mode: 'auto' | 'manual' | 'add', attributeIds?: string[], run?: string | null): Promise<Refreshed | null> {
  const r = await rpc<Refreshed[]>('pb_product_values_set', { p_product: productId, p_rows: rows, p_mode: mode, p_attributes: attributeIds ?? null }, run);
  return r?.[0] ?? null;
}

/** Re-apply the gate and the tags cache to these products (in pages of 500). */
export async function refresh(ids: string[]): Promise<Refreshed[]> {
  const out: Refreshed[] = [];
  for (let i = 0; i < ids.length; i += 500) out.push(...await rpc<Refreshed[]>('pb_products_refresh', { p_ids: ids.slice(i, i + 500) }));
  return out;
}

/** Best effort: a failed suggestion write is logged, never fails the read / ingest it rides on. `run`: as writeValues. */
export async function suggestFor(productId: string | null, list: Suggest[], tax: Taxonomy, run?: string | null): Promise<void> {
  const rows = suggestable(list, taxValues(tax)).map(s => ({ ...s, product_id: productId }));
  if (!rows.length) return;
  try { await rpc('pb_tag_suggest', { p_rows: rows }, run); } catch (e) { console.error(`pb-products pb_tag_suggest ${productId}: ${plain(e)}`); }
}

type Facts = Pick<ProductRow, 'id' | 'name' | 'raw_text' | 'fabric' | 'color' | 'attributes' | 'category' | 'locked'>;

/** The rules (+ the AI's choices) for a product, written; null when its tags are locked. */
export async function autoTag(p: Facts, tax: Taxonomy, o: { ai?: ReadTags | null; byCategory: boolean }): Promise<{ refreshed: Refreshed | null; rows: ValueSet[] } | null> {
  if (tagsLocked(p)) return null;
  const attrs = o.byCategory ? attrsFor(tax, p.category) : allAttrs(tax, p.category);
  const have = await productValues(p.id);
  const manual = new Set(have.filter(v => v.source === 'manual').map(v => v.attribute_id));
  const r = autoValues(p, matchAttrs(attrs), { manualAttrIds: manual, ai: o.ai, categories: tax.categories, shades: shadesOf(tax) });
  // Only the attributes checked here are replaced. Without the list the database cleared every attribute, so the
  // read (its category's attributes only) deleted what the import had found for the others — with nothing linked,
  // everything (owner, 13 Nov 2026).
  const refreshed = await writeValues(p.id, r.rows, 'auto', attrs.map(a => a.id));
  await suggestFor(p.id, r.suggest, tax);
  return { refreshed, rows: r.rows };
}

/** {tags} for one website: the product's values in the taxonomy's order, in the site's style — only the ones offered for
 *  its category (a Product Type value ticked for another category is not sent; the Ready check does not count it). */
export async function siteValueTags(productId: string, style: unknown, category: string | null): Promise<string[]> {
  const rows = await sel<{ pb_attribute_values: { name: string; position: number; categories: string[] | null; pb_attributes: { name: string; shopify_prefix: string | null; position: number; by_category: boolean | null } | null } | null }>(
    `pb_product_values?product_id=eq.${enc(productId)}&select=pb_attribute_values(name,position,categories,pb_attributes(name,shopify_prefix,position,by_category))`);
  const vals = rows.map(r => r.pb_attribute_values).filter((v): v is NonNullable<typeof v> => !!v && !!v.pb_attributes)
    .filter(v => offered({ by_category: v.pb_attributes!.by_category === true }, { categories: v.categories || [] }, category))
    .sort((a, b) => (a.pb_attributes!.position - b.pb_attributes!.position) || (a.position - b.position) || a.name.localeCompare(b.name));
  const chosen: ChosenTag[] = vals.map(v => ({ name: v.name, attribute: v.pb_attributes!.name, prefix: v.pb_attributes!.shopify_prefix }));
  return valueTags(chosen, style);
}
