// The tag engine with the database around it: the rules (pb_settings 'tags')
// and the library (pb_tags) loaded once per run, a product's tags computed
// (tagEngine.ts) and the library told about new names BEFORE the product is
// written (pb_tags_bump with the right source; the counting trigger on
// pb_products.tags then only moves `uses`). Tags the rules hid go to the
// library too, as hidden + reviewed rows, so staff can see and un-hide them.
// Rules: a product whose 'tags' is locked (staff set them) is never changed
// here — the reader, the writer's extra tags and the re-clean all skip it;
// only set_product_tags (tagsActions.ts) writes a locked product's tags. The
// tags already on a product are re-checked against the rules only by the
// re-clean (recheckExisting); a read or a write keeps them as they are.
import { enc, getSettings, patch, rpc, sel } from './db.ts';
import { HttpError, plain } from './http.ts';
import { tagKey, type TagSettings } from './tagClean.ts';
import { type LibraryRow, type ProductTagResult, type TagLibrary, libraryOf, productTags, sameTags, visibleTags } from './tagEngine.ts';
import type { ProductRow, Settings } from './types.ts';

export interface TagCtx { rules: TagSettings; lib: TagLibrary & { known: Set<string> } }

/** Facts of a product the engine reads (the full row or the slice the re-clean fetches). */
export type TagProduct = Pick<ProductRow, 'id' | 'category' | 'fabric' | 'color' | 'attributes' | 'tags' | 'locked'>;
export const TAG_PRODUCT_COLS = 'id,name,category,fabric,color,attributes,tags,locked';

const LIB_COLS = 'id,name,key,hidden,merged_into,reviewed_at';
const ENGINE_MAX = 20000; // every hidden, alias or reviewed row (pb_tags_engine_idx): the ones that change a result
const KNOWN_MAX = 5000;   // plus the most-used rows, so bumpLibrary rarely has to tell the library about a tag it knows

/** The library's aliases, hidden and kept tags, and the keys it is known to hold (two reads). */
export async function loadLibrary(): Promise<TagCtx['lib']> {
  const [engine, top] = await Promise.all([
    sel<LibraryRow>(`pb_tags?select=${LIB_COLS}&or=(hidden.eq.true,merged_into.not.is.null,reviewed_at.not.is.null)&order=uses.desc&limit=${ENGINE_MAX}`),
    sel<LibraryRow>(`pb_tags?select=${LIB_COLS}&order=uses.desc&limit=${KNOWN_MAX}`),
  ]);
  const byId = new Map([...top, ...engine].map(r => [r.id, r]));
  return { ...libraryOf([...byId.values()]), known: new Set([...byId.values()].map(r => r.key)) };
}

export async function tagCtx(settings?: Settings): Promise<TagCtx> {
  const [s, lib] = await Promise.all([settings ? Promise.resolve(settings) : getSettings(), loadLibrary()]);
  return { rules: s.tags, lib };
}

export const tagsLocked = (p: { locked: string[] | null }) => (p.locked || []).includes('tags');

/** The product's tag set from its facts, store tags, the tags it already has and `aiExtra`. The existing
 *  tags go through the hide rules again only when `recheckExisting` (the re-clean). */
export function computeTags(p: TagProduct, ctx: TagCtx, aiExtra: unknown[] = [], recheckExisting = false): ProductTagResult {
  return productTags({
    facts: { category: p.category, fabric: p.fabric, color: p.color }, attributes: p.attributes || {},
    aiExtra, existing: p.tags || [], keepExisting: !recheckExisting,
  }, ctx.rules, ctx.lib);
}

/** Hidden candidates worth a library row: the rules said no (a pattern, an exact hide, a code) — not empties, repeats or the cap. */
const LIBRARY_HIDDEN = new Set(['pattern', 'exact', 'code']);

/** Library rows for the names the library does not know yet, by source (pb_tags_bump): the kept tags,
 *  and the ones the rules hid as hidden + reviewed rows. Best effort: a failure here only means the
 *  kept rows are created as 'manual' by the counting trigger and the hidden ones wait for the next run. */
export async function bumpLibrary(r: Pick<ProductTagResult, 'tags' | 'hidden' | 'sources'>, ctx: TagCtx, fallback: 'store' | 'manual' | 'ai' | 'facts' = 'store'): Promise<void> {
  const by: Record<string, string[]> = {};
  const take = (t: string, src: string, hidden: boolean) => {
    const k = tagKey(t);
    if (!k || ctx.lib.known.has(k)) return;
    (by[`${src}:${hidden}`] ||= []).push(t);
    ctx.lib.known.add(k);
  };
  for (const t of r.tags) take(t, r.sources[t] || fallback, false);
  for (const h of r.hidden) if (LIBRARY_HIDDEN.has(h.reason)) take(h.tag, h.src, true);
  for (const [key, names] of Object.entries(by)) {
    const [src, hidden] = key.split(':');
    try { await rpc('pb_tags_bump', { p_names: names, p_source: src, p_hidden: hidden === 'true' }); }
    catch (e) { console.error(`pb-products pb_tags_bump ${key}: ${plain(e)}`); }
  }
}

/** The tags to write for a product after its facts changed (the reader, which owns the row while it
 *  reads), or null when nothing changes or the product's tags are locked. Tells the library first. */
export async function nextTags(p: TagProduct, ctx: TagCtx): Promise<string[] | null> {
  if (tagsLocked(p)) return null;
  const r = computeTags(p, ctx);
  if (sameTags(p.tags || [], r.tags)) return null;
  await bumpLibrary(r, ctx);
  return r.tags;
}

/** The writer's extra tags (generate.ts) added to the product's tags in one statement
 *  (pb_product_add_tags), so two websites writing the same product at once never lose each other's
 *  tags. Returns the product's tags after the add, or null when nothing was added (nothing new, the
 *  product is being read, or its tags are locked). */
export async function addTags(p: TagProduct, ctx: TagCtx, aiExtra: unknown[]): Promise<string[] | null> {
  if (tagsLocked(p) || !aiExtra.length) return null;
  const r = computeTags(p, ctx, aiExtra);
  const have = new Set((p.tags || []).map(t => tagKey(String(t))));
  const fresh = r.tags.filter(t => !have.has(tagKey(t)));
  if (!fresh.length) return null;
  await bumpLibrary(r, ctx);
  return await rpc<string[] | null>('pb_product_add_tags', { p_id: p.id, p_names: fresh, p_max: ctx.rules.max_per_product });
}

/** The product's tags a website may use. */
export const siteTags = (p: { tags: string[] | null }, ctx: TagCtx) => visibleTags(p.tags || [], ctx.lib);

/** Staff set a product's tags by hand: normalized, de-duplicated, aliases applied, capped — the hide
 *  rules do not apply to what staff typed (library-hidden ones stay but are flagged). Locks 'tags'. */
export async function setProductTags(id: string, given: unknown[], ctx: TagCtx): Promise<ProductTagResult & { locked: string[] }> {
  const p = await sel<Pick<ProductRow, 'id' | 'status' | 'locked'>>(`pb_products?id=eq.${enc(id)}&select=id,status,locked&limit=1`).then(r => r[0]);
  if (!p) throw new HttpError(404, 'That product no longer exists.');
  if (p.status === 'reading') throw new HttpError(409, 'This product is being read right now — try again in a minute.');
  const r = productTags({ existing: given, keepExisting: true }, ctx.rules, ctx.lib);
  await bumpLibrary(r, ctx, 'manual');
  const locked = Array.from(new Set([...(p.locked || []), 'tags']));
  const rows = await patch('pb_products', `id=eq.${enc(id)}&status=neq.reading`, { tags: r.tags, locked });
  if (!rows.length) throw new HttpError(409, 'The product changed while its tags were being saved — open it again.');
  return { ...r, locked };
}
