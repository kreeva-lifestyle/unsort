// "Let AI decide" (index.ts):
//   tags_ai_fill     { product_ids? | category? | attribute_id? | needs_info?, missing_only?, now? } → queue (or,
//                    with now and one product, fill it right away: tagFill.ts). A queued one is a bulk change
//                    (bulkLog.ts): Settings → Bulk changes takes it back for 7 days
//   tags_fill_status → the progress of the newest batch of runs, all of them together (fillProgress.ts)
// New tag words are no longer answered here: the worker files them by itself (tagsFile.ts, owner 17 Nov 2026).
import { uuid, type Body } from './actions.ts';
import { endRun, startRun } from './bulkLog.ts';
import { enc, insert, logActivity, one, patch } from './db.ts';
import { HttpError, plain, usdOf } from './http.ts';
import { routeProduct } from './route.ts';
import { fillOne } from './tagFill.ts';
import { displayName } from './tagText.ts';
import { loadTaxonomy } from './taxonomy.ts';
import { PRODUCT_COLS, type ProductRow } from './types.ts';
import { newBudget } from './worker.ts';

export { fillStatus } from './fillProgress.ts';

export async function tagsAiFill(b: Body, userId: string | null) {
  const ids = (Array.isArray(b.product_ids) ? b.product_ids : []).map(v => uuid(v, 'A product')).slice(0, 500);
  if (b.now === true) {
    if (ids.length !== 1) throw new HttpError(400, 'Fill one product at a time.');
    const p = await one<ProductRow>(`pb_products?id=eq.${enc(ids[0])}&select=${PRODUCT_COLS}`);
    if (!p) throw new HttpError(404, 'That product no longer exists.');
    if (!['ready', 'needs_info'].includes(p.status)) throw new HttpError(409, 'This product is still being read — try again in a minute.');
    const r = await fillOne(p, await loadTaxonomy(), { manual: true, userId, budget: newBudget() }).catch(async (e) => {
      // An answer that was paid for and then refused or cut off: logged, so the day's AI limit counts it.
      if (usdOf(e)) await logActivity({ product_id: p.id, action: 'failed', details: { step: 'tags_fill', error: plain(e), usd: usdOf(e) }, user_id: userId });
      throw e;
    });
    let routed = 0;
    if (r.refreshed?.was === 'needs_info' && r.refreshed.status === 'ready') {
      const now = await one<ProductRow>(`pb_products?id=eq.${enc(p.id)}&select=${PRODUCT_COLS}`);
      const r = now ? await routeProduct(now, userId) : null;
      routed = r?.routed ?? 0;
      if (!r?.busy) await patch('pb_products', `id=eq.${enc(p.id)}`, { route_due: false }); // a busy listing keeps the flag: the worker checks again
    }
    return { ok: true, filled: r.filled, left: r.left, status: r.refreshed?.status ?? p.status, missing: r.refreshed?.missing ?? p.missing_attrs, routed };
  }
  // Waiting only for a category the list no longer has ("Missing: Category"): the AI chooses tags, not categories.
  const f = ['status=in.(ready,needs_info)', 'tag_fill_run=is.null', 'locked=not.cs.{tags}', b.missing_only === false ? '' : 'missing_attrs=neq.{}', 'missing_attrs=neq.{Category}'];
  const anyGap = () => { f[3] = ''; }; // products with no missing must-have still go (fillOne fills only what is empty)
  let aim = '';
  if (ids.length) { f.push(`id=in.(${ids.map(enc).join(',')})`); aim = `${ids.length} chosen ${ids.length === 1 ? 'product' : 'products'}`; }
  else if (b.attribute_id) {
    const a = await one<{ name: string; required: boolean | null }>(`pb_attributes?id=eq.${enc(uuid(b.attribute_id, 'The attribute'))}&select=name,required`);
    if (!a) throw new HttpError(404, 'That attribute no longer exists.');
    // "Only if it fits" (Product Type): never in missing_attrs, so the category's products go, and the AI picks where one fits.
    if (a.required === false) { if (!b.category) throw new HttpError(400, 'Say which category.'); anyGap(); }
    else f.push(`missing_attrs=cs.${enc(`{"${a.name.replace(/"/g, '')}"}`)}`);
    if (b.category) f.push(`category=eq.${enc(displayName(b.category))}`);
    aim = `${a.name}${b.category ? ` for ${displayName(b.category)}` : ''}`;
  } else if (b.category) { f.push(`category=eq.${enc(displayName(b.category))}`); aim = displayName(b.category); }
  else if (b.needs_info === true) { f.push('status=eq.needs_info'); aim = 'products in Needs info'; } // Products → Needs info: every product waiting for a tag
  else throw new HttpError(400, 'Say which products: a list, a category or an attribute.');
  const [run] = await insert<{ id: string }>('pb_tag_fill_runs', [{ scope: { ids: ids.length, category: b.category ?? null, attribute_id: b.attribute_id ?? null }, created_by: userId }], { select: 'id' });
  // A bulk change with the fill run's id (bulkLog.ts), opened before any product is queued: the worker writes each
  // product's values as part of it, and closes it once the queue is over (tagFill.ts closeFills).
  await startRun('tag_fill', `Let AI decide the tags: ${aim}`, { id: run.id, userId });
  const queued = (await patch('pb_products', f.filter(Boolean).join('&'), { tag_fill_run: run.id })).length;
  await patch('pb_tag_fill_runs', `id=eq.${enc(run.id)}`, queued ? { total: queued } : { total: 0, finished_at: new Date().toISOString() });
  if (!queued) await endRun(run.id);
  await logActivity({ action: 'tags_fill_queued', details: { queued, category: b.category ?? null }, user_id: userId });
  return { ok: true, run_id: run.id, queued };
}
