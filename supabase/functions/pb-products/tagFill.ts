// "Let AI decide" (owner, 2026-11-10): a values-only AI pass for products
// whose required attributes are empty. tags_ai_fill queues products
// (pb_products.tag_fill_run → a pb_tag_fill_runs row that counts progress);
// the per-minute worker runs a few per call AFTER read / write / publish, so
// it never starves them (worker.ts). One product = the word rules first
// (tagAuto.ts, free and the same every time), then — only for what they left
// empty — one cheap call with the reader's model, text + one photo, choosing
// ONLY from the allowed values of those attributes (tagPrompt.ts); rows are
// added as 'rules' / 'ai' and never
// touch an attribute that has a value, so 'manual' choices stay; a product
// whose 'tags' are locked is skipped by the queue (a person asking on the
// product page itself may still fill its empty attributes). Then the gate
// (pb_products_refresh); a product that becomes Ready is routed (now on the
// product page, by the worker's route_due step otherwise).
import { askClaude } from './ai.ts';
import { endRun, fillOver } from './bulkLog.ts';
import { ago, enc, getSettings, logActivity, nowIso, one, patch, rpc, sel } from './db.ts';
import { plain, usdOf } from './http.ts';
import { aiPhotos } from './photos.ts';
import { IMPORTED_TEXT } from './readerPrompt.ts';
import { routeProduct } from './route.ts';
import { cleanStoreTags } from './tagClean.ts';
import { readTags, tagPromptLines, tagSchema, tagSpec } from './tagPrompt.ts';
import { type Refreshed, productValues, suggestFor, writeValues } from './tagStore.ts';
import { tagKey } from './tagText.ts';
import { autoValues } from './tagAuto.ts';
import { type AttrWithValues, type Taxonomy, attrsFor, matchAttrs, shadesOf } from './taxonomy.ts';
import { PRODUCT_COLS, type Budget, type ProductRow } from './types.ts';

export const FILL_NEEDS_MS = 35_000;

export const fillCandidates = (limit: number) =>
  sel<{ id: string; tag_fill_run: string }>(`pb_products?tag_fill_run=not.is.null&status=in.(ready,needs_info)&select=id,tag_fill_run&order=updated_at.asc&limit=${limit}`);

function fillText(p: ProductRow, categories: string[]): string {
  const a = p.attributes || {};
  const facts = [p.name && `Name: ${p.name}`, p.category && `Category: ${p.category}`, p.fabric && `Fabric: ${p.fabric}`, p.color && `Colour: ${p.color}`,
    ...['work', 'occasion', 'pattern', 'type'].filter(k => a[k]).map(k => `${k}: ${a[k]}`),
    cleanStoreTags(a.store_tags, categories).length ? `Store tags: ${cleanStoreTags(a.store_tags, categories).join(', ')}` : ''].filter(Boolean).join('\n');
  return `${facts}\n\nText:\n${String(p.raw_text || '(none — use the photo)').slice(0, 3000)}`;
}

export interface FillResult { filled: string[]; left: string[]; refreshed: Refreshed | null; usd: number }

/** Fill one product's empty required attributes. `manual` = a person asked on the product page. `run`: the queued
 *  "Let AI decide" this belongs to, as a bulk change (its id is the fill run's: tagsQueue.ts). */
export async function fillOne(p: ProductRow, tax: Taxonomy, o: { manual: boolean; userId: string | null; budget: Budget; run?: string | null }): Promise<FillResult> {
  const have = new Set((await productValues(p.id)).map(v => v.attribute_id));
  const target = attrsFor(tax, p.category).filter(a => !have.has(a.id) && a.values.length);
  if (!target.length) return { filled: [], left: [], refreshed: (await rpc<Refreshed[]>('pb_products_refresh', { p_ids: [p.id] }))[0] ?? null, usd: 0 };
  // The word rules first (owner, 13 Nov 2026: rules, then AI, then a person): what the product's own words settle
  // costs nothing and comes out the same every time. The AI is asked only for the attributes still empty.
  const byRules = autoValues(p, matchAttrs(target), { categories: tax.categories, shades: shadesOf(tax) });
  const rest = target.filter(a => !byRules.filled.has(a.id));
  let ai: Awaited<ReturnType<typeof askFor>> | null = null;
  try { if (rest.length) ai = await askFor(p, tax, rest, o.budget); }
  catch (e) { if (byRules.rows.length) await writeValues(p.id, byRules.rows, 'add', undefined, o.run); throw e; } // the words' values are kept
  const rows = [...byRules.rows, ...rest.flatMap(a => (ai?.chosen[a.id] ?? []).map(value_id => ({ value_id, source: 'ai' as const })))];
  const refreshed = await writeValues(p.id, rows, 'add', undefined, o.run);
  const byWords = target.filter(a => byRules.filled.has(a.id)).map(a => a.name);
  const filled = [...byWords, ...rest.filter(a => ai?.chosen[a.id]?.length).map(a => a.name)];
  if (ai) await suggestFor(p.id, ai.other.map(x => ({ phrase: x.phrase, key: tagKey(x.phrase), attribute_id: x.attribute_id, source: 'ai' as const })), tax, o.run);
  const left = refreshed?.missing ?? target.filter(a => !filled.includes(a.name)).map(a => a.name);
  const usd = ai?.usd ?? 0;
  await logActivity({ product_id: p.id, action: 'tags_filled', details: { ...(ai ? { model: ai.model, usd } : {}), filled, by_rules: byWords, left, manual: o.manual }, user_id: o.userId });
  return { filled, left, refreshed, usd };
}

/** One cheap AI call for the attributes the rules left empty: text + the first photo, choosing only from their values. */
async function askFor(p: ProductRow, tax: Taxonomy, attrs: AttrWithValues[], budget: Budget) {
  const s = await getSettings();
  const spec = tagSpec(attrs);
  const imgs = await sel<{ path: string }>(`pb_product_images?product_id=eq.${enc(p.id)}&kind=eq.image&select=path&order=position.asc&limit=1`);
  const photos = await aiPhotos(imgs.map(i => i.path));
  const ai = await askClaude<{ tags: Record<string, { values: string[]; other: string[] }> }>({
    model: s.reader.model, effort: s.reader.effort,
    system: ['You tag an Indian ethnic-wear product for an online store.', ...tagPromptLines(spec, { fillOnly: true }), ...(p.source === 'import' ? [IMPORTED_TEXT] : [])].join('\n'),
    content: [...photos.blocks, { type: 'text', text: fillText(p, tax.categories) }],
    schema: { type: 'object', properties: tagSchema(spec, { fillOnly: true }) ?? {}, required: ['tags'], additionalProperties: false },
    maxTokens: 3000, timeoutMs: budget.hard - Date.now(),
  });
  return { ...readTags(spec, ai.data), model: ai.model, usd: ai.usd };
}

/** Worker step: one queued product. It leaves the queue FIRST, and that is the claim: worker runs can
 *  overlap (one starts every minute, each may take over two), and only the run whose patch returns the row
 *  fills the product and ticks the run. Returns false when another run had taken it. Once taken it is
 *  always ticked (an AI error counts as "left empty"). The values are written as part of the queue's bulk
 *  change — only while that is open: a write tagged with a change that is not in the log is refused. The change is
 *  closed by the worker once the queue is over (closeFills). */
export async function fillQueued(c: { id: string; tag_fill_run: string }, tax: Taxonomy, userId: string | null, budget: Budget): Promise<boolean> {
  const mine = await patch('pb_products', `id=eq.${enc(c.id)}&tag_fill_run=eq.${enc(c.tag_fill_run)}`, { tag_fill_run: null });
  if (!mine.length) return false;
  let filled = 0, left = 0, run: string | null = null;
  try {
    run = (await one(`pb_bulk_runs?id=eq.${enc(c.tag_fill_run)}&status=eq.running&select=id`)) ? c.tag_fill_run : null;
    const p = await one<ProductRow>(`pb_products?id=eq.${enc(c.id)}&select=${PRODUCT_COLS}`);
    if (p && !(p.locked || []).includes('tags')) {
      const r = await fillOne(p, tax, { manual: false, userId, budget, run });
      filled = r.filled.length ? 1 : 0; left = r.left.length ? 1 : 0;
    }
  } catch (e) {
    left = 1;
    console.error(`pb-products tag fill ${c.id}: ${plain(e)}`);
    await logActivity({ product_id: c.id, action: 'failed', details: { step: 'tags_fill', error: plain(e), ...(usdOf(e) ? { usd: usdOf(e) } : {}) }, user_id: userId });
  } finally {
    await rpc('pb_tag_fill_tick', { p_run: c.tag_fill_run, p_filled: filled, p_left: left });
  }
  return true;
}

/** Worker step: close the queued "Let AI decide" runs that are over as bulk changes (bulkLog.ts fillOver: nothing waits,
 *  and the last product was taken 5 minutes ago or more — never sooner, because a product another worker run took may
 *  still be on its way, and a write tagged with a change that has left the log is refused). A run whose last products
 *  were archived meanwhile is marked finished here, as fillStatus does. Returns how many it closed. */
export async function closeFills(): Promise<number> {
  let n = 0;
  for (const r of await sel<{ id: string }>('pb_bulk_runs?kind=eq.tag_fill&status=eq.running&select=id&order=created_at.asc&limit=5')) {
    if (await one(`pb_products?tag_fill_run=eq.${enc(r.id)}&status=in.(ready,needs_info)&select=id`)) continue; // still filling
    await patch('pb_tag_fill_runs', `id=eq.${enc(r.id)}&finished_at=is.null&created_at=lt.${ago(2 * 60_000)}`, { finished_at: nowIso() });
    if (await fillOver(r.id)) { await endRun(r.id); n++; }
  }
  return n;
}

/** Worker step: route products a tag change made Ready (route_due, set by pb_products_refresh), and those whose
 *  listing was being written or published when they were last checked (route.ts). The flag is cleared BEFORE
 *  routing, so a listing that is still busy can raise it again. */
export async function routeDue(limit: number, userId: string | null, inTime: () => boolean): Promise<number> {
  let n = 0;
  for (const c of await sel<{ id: string }>(`pb_products?route_due=eq.true&select=id&order=updated_at.asc&limit=${limit}`)) {
    if (!inTime()) break;
    const p = await one<ProductRow>(`pb_products?id=eq.${enc(c.id)}&select=${PRODUCT_COLS}`);
    await patch('pb_products', `id=eq.${enc(c.id)}`, { route_due: false });
    try {
      if (p?.status === 'ready') { await routeProduct(p, userId); n++; }
    } catch (e) { // logged on the product's timeline; "Check websites again" there routes it
      console.error(`pb-products route_due ${c.id}: ${plain(e)}`);
      await logActivity({ product_id: c.id, action: 'failed', details: { step: 'route', error: plain(e) }, user_id: userId });
    }
  }
  return n;
}
