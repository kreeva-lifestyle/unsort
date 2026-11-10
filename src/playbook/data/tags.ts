// Tags data access: the library and review queue, staff actions on tags, the
// cleaning rules, re-clean, and a product's own tags. Every write goes through
// the pb-products edge function (the SQL functions rewrite product tags in one
// transaction); reads of the library and the rules are direct (RLS: staff).
// Contract (actions): tags_library, tags_review, tags_act, tags_settings_save,
// tags_reclean, set_product_tags — docs/playbook/product-directory-spec.md "Tags".
// Errors are thrown as-is; callers show them with friendlyError().
import { supabase } from '../../lib/supabase';
import { pbCall } from './pbFunctions';
import { DEFAULT_TAG_SETTINGS, TAG_PAGE, type PbHidden, type PbTag, type PbTagAction, type PbTagKind, type PbTagReview, type PbTagSettings } from '../tagTypes';
import { patternProblem } from '../components/tags/tagCleanPreview';

export type LibraryFilter = { q: string; kind: PbTagKind | ''; hidden: '' | 'visible' | 'hidden' };
export const EMPTY_LIBRARY_FILTER: LibraryFilter = { q: '', kind: '', hidden: '' };
export type LibraryPage = { rows: PbTag[]; count: number; counts: { all: number; hidden: number; review: number } };
export type RecleanResult = { dry_run: boolean; products: number; changed: number; sample: { name: string; added: string[]; removed: string[] }[] };
export type ActResult = { done: number };
export type SetTagsResult = { tags: string[]; hidden: PbHidden[]; flagged: string[] };

/** The library, 25 a page, most used first. */
export const tagsLibrary = (f: LibraryFilter, page: number) =>
  pbCall<LibraryPage>('tags_library', { q: f.q, kind: f.kind || undefined, hidden: f.hidden === '' ? undefined : f.hidden === 'hidden', page, per: TAG_PAGE })
    .then(r => ({ rows: r.rows ?? [], count: r.count ?? 0, counts: { all: r.counts?.all ?? 0, hidden: r.counts?.hidden ?? 0, review: r.counts?.review ?? 0 } }));

/** Tags never reviewed, or first seen in the last 30 days, with example products. */
export const tagsReview = () => pbCall<{ rows: PbTagReview[] }>('tags_review').then(r => r.rows ?? []);

/** keep / hide / unhide / merge (`into`) / rename (`name`, one id) / kind (`kind`). Sets reviewed_at. */
export const tagsAct = (ids: string[], action: PbTagAction, extra: { into?: string; name?: string; kind?: PbTagKind } = {}) =>
  pbCall<ActResult>('tags_act', { ids, action, ...extra }).then(r => ({ done: r.done ?? ids.length }));

/** The cleaning rules (pb_settings 'tags'); defaults fill a missing or old row. A pattern the server would refuse
 *  (the row is staff-writable) is left out, as the server does on every read, so it never runs in the tester. */
export async function getTagSettings(): Promise<PbTagSettings> {
  const { data, error } = await supabase.from('pb_settings').select('value').eq('key', 'tags').maybeSingle();
  if (error) throw error;
  const v = (data?.value && typeof data.value === 'object' ? data.value : {}) as Partial<PbTagSettings>;
  return {
    hide_patterns: Array.isArray(v.hide_patterns) ? v.hide_patterns.map(String).filter(p => !patternProblem(p)) : DEFAULT_TAG_SETTINGS.hide_patterns,
    hide_exact: Array.isArray(v.hide_exact) ? v.hide_exact.map(String) : [],
    max_per_product: Number(v.max_per_product) > 0 ? Number(v.max_per_product) : DEFAULT_TAG_SETTINGS.max_per_product,
    min_len: Number(v.min_len) > 0 ? Number(v.min_len) : DEFAULT_TAG_SETTINGS.min_len,
    title_case: v.title_case !== false, auto_hide_codes: v.auto_hide_codes !== false,
  };
}

/** Admin / manager: the server validates every pattern (length, safety) and answers with the saved rules. */
export const saveTagSettings = (rules: PbTagSettings) => pbCall<{ rules: PbTagSettings }>('tags_settings_save', { rules }).then(r => r.rules ?? rules);

/** Re-run the rules over every product's store tags + current tags (hand-edited tags are kept). Dry run first. */
export const recleanTags = (dryRun: boolean) =>
  pbCall<RecleanResult>('tags_reclean', { dry_run: dryRun })
    .then(r => ({ dry_run: dryRun, products: r.products ?? 0, changed: r.changed ?? 0, sample: Array.isArray(r.sample) ? r.sample : [] }));

/** Save the tags staff typed on a product: normalized and deduped (the hide rules do not apply to what staff typed),
 *  library aliases applied, 'tags' locked so the AI adds but never replaces. `flagged` = kept but hidden in the library. */
export const setProductTags = (productId: string, tags: string[]) =>
  pbCall<SetTagsResult>('set_product_tags', { product_id: productId, tags })
    .then(r => ({ tags: r.tags ?? tags, hidden: Array.isArray(r.hidden) ? r.hidden : [], flagged: Array.isArray(r.flagged) ? r.flagged : [] }));

export type TagSuggestion = Pick<PbTag, 'id' | 'name' | 'kind' | 'hidden' | 'uses'>;
/** Library names that contain `q` (canonical tags only), most used first — for the product's tag picker. */
export async function suggestTags(q: string, limit = 8): Promise<TagSuggestion[]> {
  const s = q.trim().toLowerCase().replace(/[%_\\,()]/g, ' ').replace(/\s+/g, ' ').trim();
  let query = supabase.from('pb_tags').select('id,name,kind,hidden,uses').is('merged_into', null).order('uses', { ascending: false }).order('name').limit(limit);
  if (s) query = query.ilike('key', `%${s}%`);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as TagSuggestion[];
}

/** How many tags wait in the review queue (the Settings tile). */
export async function countTagsToReview(): Promise<number> {
  const { count, error } = await supabase.from('pb_tags').select('id', { count: 'exact', head: true }).is('reviewed_at', null).is('merged_into', null);
  if (error) throw error;
  return count ?? 0;
}

/** Everything the Tags page needs, as one object so the screenshot harness can pass fakes. */
export interface TagsApi {
  review: typeof tagsReview; library: typeof tagsLibrary; act: typeof tagsAct;
  settings: typeof getTagSettings; saveSettings: typeof saveTagSettings; reclean: typeof recleanTags; suggest: typeof suggestTags;
}
export const TAGS_API: TagsApi = { review: tagsReview, library: tagsLibrary, act: tagsAct, settings: getTagSettings, saveSettings: saveTagSettings, reclean: recleanTags, suggest: suggestTags };
