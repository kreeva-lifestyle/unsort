// Tags data access: the taxonomy (categories → attributes → values), the
// suggestions queue, a product's values, retag and "Let AI decide". Every
// write goes through the pb-products edge function (look-alike checks,
// admin / manager for structure); a product's values and its category's
// attributes are read directly (RLS: staff). Contract:
// docs/playbook/product-directory-spec.md "Tags". Errors are thrown as-is;
// callers show them with friendlyError(). A look-alike refusal comes back as
// LookAlikeError with the matches, so the UI can ask "same thing or new?".
import { supabase } from '../../lib/supabase';
import { pbCall } from './pbFunctions';
import { offeredFor, type PbAttrValue, type PbAttribute, type PbFillRun, type PbLookAlike, type PbNearest, type PbProductValue, type PbRetagResult, type PbSuggestion, type PbSuggestionStatus, type PbTaxonomy } from '../tagTypes';

export class LookAlikeError extends Error {
  matches: PbLookAlike[];
  constructor(message: string, matches: PbLookAlike[]) { super(message); this.matches = matches; }
}
/** A 409 with look-alikes → LookAlikeError; anything else as it came. */
const lookAlike = (e: unknown): never => {
  const m = (e as { data?: { matches?: PbLookAlike[] } })?.data?.matches;
  throw Array.isArray(m) && m.length ? new LookAlikeError((e as Error).message, m) : e;
};

export const getTaxonomy = () => pbCall<PbTaxonomy>('taxonomy_get').then(r => ({
  categories: r.categories ?? [], attributes: r.attributes ?? [], links: r.links ?? [], stats: r.stats ?? [],
  category_products: r.category_products ?? [], suggestions_pending: r.suggestions_pending ?? 0, fill: r.fill ?? null,
}));
export const saveCategories = (categories: string[]) => pbCall<{ categories: string[] }>('categories_save', { categories }).then(r => r.categories ?? categories);
export const saveAttribute = (a: { id?: string; name: string; multi: boolean; shopify_prefix: string; by_category: boolean }) =>
  pbCall<{ attribute: PbAttribute }>('attribute_save', a).then(r => r.attribute);
export const deleteAttribute = (id: string) => pbCall<{ regated: number }>('attribute_delete', { id });
export const orderAttributes = (ids: string[]) => pbCall('attribute_order', { ids });
export const checkValue = (attributeId: string, name: string, excludeId?: string) =>
  pbCall<{ matches: PbLookAlike[]; exists: { id: string; name: string } | null }>('value_check', { attribute_id: attributeId, name, exclude_id: excludeId })
    .then(r => ({ matches: r.matches ?? [], exists: r.exists ?? null }));
/** `categories`: where the value is offered while its attribute's values depend on the category (left out = unchanged). */
export const saveValue = (v: { attribute_id: string; id?: string; name: string; aliases?: string[]; categories?: string[]; force?: boolean }) =>
  pbCall<{ value: PbAttrValue }>('value_save', v).then(r => r.value).catch(lookAlike);
export const deleteValue = (id: string) => pbCall<{ regated: number }>('value_delete', { id });
export const mergeValue = (from: string, into: string) => pbCall<{ moved: number }>('value_merge', { from, into });
export const linkCheck = (category: string, attributeId: string) => pbCall<{ lacking: number }>('category_link_check', { category, attribute_id: attributeId }).then(r => r.lacking ?? 0);
export const saveLinks = (category: string, attributeIds: string[]) =>
  pbCall<{ to_needs_info: number; to_ready: number }>('category_link_save', { category, attribute_ids: attributeIds });

export type SuggestionPage = { rows: PbSuggestion[]; count: number };
export const listSuggestions = (status: PbSuggestionStatus, page: number, attributeId = '') =>
  pbCall<SuggestionPage>('suggestions_list', { status, page, attribute_id: attributeId || undefined }).then(r => ({ rows: r.rows ?? [], count: r.count ?? 0 }));
/** 'nearest': each into its own nearest value (the one its card shows); one without is left and counted in `skipped`. */
export type SuggestionAct = { ids: string[]; act: 'add' | 'alias' | 'ignore' | 'move' | 'nearest'; attribute_id?: string | null; value_id?: string; name?: string; force?: boolean };
/** The nearest value for suggestions not looked at yet (up to 20): the word rules, else one AI call; the answer is kept. */
export const nearestSuggestions = (ids: string[]) =>
  pbCall<{ nearest: Record<string, PbNearest> }>('suggestions_nearest', { ids }).then(r => r.nearest ?? {});
export const actSuggestions = (a: SuggestionAct) =>
  pbCall<{ done: number; conflicts: Record<string, PbLookAlike[]>; retagged: number; skipped?: number }>('suggestion_act', a)
    .then(r => ({ done: r.done ?? 0, conflicts: r.conflicts ?? {}, retagged: r.retagged ?? 0, skipped: r.skipped ?? 0 }));

export const retag = (dryRun: boolean) => pbCall<PbRetagResult>('retag', { dry_run: dryRun });
export type FillScope = { product_ids?: string[]; category?: string; attribute_id?: string; needs_info?: boolean };
export const aiFill = (scope: FillScope) => pbCall<{ run_id: string; queued: number }>('tags_ai_fill', { ...scope, missing_only: true }).then(r => r.queued ?? 0);
export const aiFillNow = (productId: string) =>
  pbCall<{ filled: string[]; left: string[]; status: string; missing: string[]; routed: number }>('tags_ai_fill', { product_ids: [productId], now: true });
export const fillStatus = () => pbCall<{ fill: PbFillRun | null }>('tags_fill_status').then(r => r.fill ?? null);

/** What the product page needs: its category's attributes (in order, with the values offered for the category) and its
 *  chosen values. A value ticked only for other categories (Product Type) is not offered, and does not count. */
export async function productTaxonomy(productId: string, category: string | null): Promise<{ attributes: PbAttribute[]; values: PbProductValue[] }> {
  const [vals, links] = await Promise.all([
    supabase.from('pb_product_values').select('value_id,source').eq('product_id', productId).limit(500),
    category ? supabase.from('pb_category_attributes').select('attribute_id,position').ilike('category', category.replace(/[%_\\]/g, '\\$&')).order('position') : Promise.resolve({ data: [], error: null }),
  ]);
  if (vals.error) throw vals.error;
  if (links.error) throw links.error;
  const ids = (links.data ?? []).map(l => l.attribute_id as string);
  if (!ids.length) return { attributes: [], values: (vals.data ?? []) as PbProductValue[] };
  const [attrs, values] = await Promise.all([
    supabase.from('pb_attributes').select('id,name,key,multi,position,shopify_prefix,by_category').in('id', ids),
    supabase.from('pb_attribute_values').select('id,attribute_id,name,key,aliases,position,categories').in('attribute_id', ids).order('position').order('name').limit(5000),
  ]);
  if (attrs.error) throw attrs.error;
  if (values.error) throw values.error;
  const byId = new Map((attrs.data ?? []).map(a => [a.id as string, a]));
  return {
    attributes: ids.map(id => byId.get(id)).filter(Boolean).map(a => ({ ...(a as Omit<PbAttribute, 'values'>),
      values: ((values.data ?? []) as PbAttrValue[]).filter(v => v.attribute_id === a!.id && offeredFor(a as PbAttribute, v, category)) })),
    values: (vals.data ?? []) as PbProductValue[],
  };
}

/** Staff's choice for one attribute (or all): saved as 'manual', 'tags' locked; the gate runs (Ready → routed). */
export const setProductValues = (productId: string, valueIds: string[], attributeId?: string) =>
  pbCall<{ status: string; missing: string[]; routed: number }>('product_values_set', { product_id: productId, value_ids: valueIds, attribute_id: attributeId });

/** Re-apply the ready gate after a facts save (pb_products_refresh): the product's new status and missing attributes. */
export async function refreshGate(productId: string): Promise<{ status: string; was: string; missing: string[] } | null> {
  const { data, error } = await supabase.rpc('pb_products_refresh', { p_ids: [productId] });
  if (error) throw error;
  return (data as { status: string; was: string; missing: string[] }[] | null)?.[0] ?? null;
}

/** Needs-info products waiting for a required tag that the AI may fill (Products → Needs info: "Let AI decide
 *  for N products"). A product whose tags a person chose is left to that person (tags_ai_fill skips it too). */
export async function countMissingTags(): Promise<number> {
  const { count, error } = await supabase.from('pb_products').select('id', { count: 'exact', head: true })
    .eq('status', 'needs_info').neq('missing_attrs', '{}').neq('missing_attrs', '{Category}').not('locked', 'cs', '{tags}');
  if (error) throw error;
  return count ?? 0;
}

/** How many suggestions wait (the Settings tile). */
export async function countSuggestions(): Promise<number> {
  const { count, error } = await supabase.from('pb_tag_suggestions').select('id', { count: 'exact', head: true }).eq('status', 'pending');
  if (error) throw error;
  return count ?? 0;
}

/** Everything the Tags page calls, as one object so the screenshot harness can pass fakes. */
export const TAGS_API = {
  taxonomy: getTaxonomy, saveCategories, saveAttribute, deleteAttribute, orderAttributes, checkValue, saveValue, deleteValue, mergeValue,
  linkCheck, saveLinks, listSuggestions, nearestSuggestions, actSuggestions, retag, aiFill, fillStatus,
};
export type TagsApi = typeof TAGS_API;
