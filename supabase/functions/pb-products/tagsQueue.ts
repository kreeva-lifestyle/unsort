// Staff actions on the suggestions queue and "Let AI decide" (index.ts):
//   suggestions_list { status?, attribute_id?, page? } → pending phrases by uses, each with up to 3
//                    example product names, its closest look-alikes (tagLook.ts) and its nearest
//                    value (tagNearest.ts: the word rules, else the AI's kept answer; null = not asked yet)
//   suggestion_act   the answers to them: tagsSuggestAct.ts
//                    A queued "Let AI decide" is a bulk change (bulkLog.ts): Settings → Bulk changes
//                    takes it back for 7 days
//   tags_ai_fill     { product_ids? | category? | attribute_id? | needs_info?, missing_only?, now? } → queue (or,
//                    with now and one product, fill it right away: tagFill.ts)
//   tags_fill_status → the latest run's progress
import { uuid, type Body } from './actions.ts';
import { endRun, startRun } from './bulkLog.ts';
import { SB_URL, enc, insert, logActivity, nowIso, one, patch, sel, svcHeaders } from './db.ts';
import { HttpError, plain, usdOf } from './http.ts';
import { routeProduct } from './route.ts';
import { fillOne } from './tagFill.ts';
import { lookAlikes } from './tagLook.ts';
import { nearestOf, type StoredNearest } from './tagNearest.ts';
import { displayName } from './tagText.ts';
import { loadTaxonomy, taxValues } from './taxonomy.ts';
import { PRODUCT_COLS, type ProductRow } from './types.ts';
import { newBudget } from './worker.ts';

export interface SugRow { id: string; phrase: string; key: string; attribute_id: string | null; status: string; uses: number; examples: string[]; source: string; first_seen_at: string; last_seen_at: string; nearest: StoredNearest | null }
export const SUG_COLS = 'id,phrase,key,attribute_id,status,uses,examples,source,first_seen_at,last_seen_at,nearest';
const STATUSES = ['pending', 'added', 'aliased', 'ignored'];

async function count(path: string): Promise<number> {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { method: 'HEAD', headers: { ...svcHeaders, prefer: 'count=exact' } });
  return Number((r.headers.get('content-range') || '').split('/')[1]) || 0;
}

export async function suggestionsList(b: Body) {
  const status = STATUSES.includes(String(b.status)) ? String(b.status) : 'pending';
  const per = 20, page = Math.max(0, Math.floor(Number(b.page)) || 0);
  const attr = b.attribute_id === 'none' ? 'attribute_id=is.null' : b.attribute_id ? `attribute_id=eq.${enc(uuid(b.attribute_id, 'The attribute'))}` : '';
  const f = [`status=eq.${status}`, attr].filter(Boolean).join('&');
  const [rows, total, tax] = await Promise.all([
    sel<SugRow>(`pb_tag_suggestions?select=${SUG_COLS}&${f}&order=uses.desc,last_seen_at.desc&limit=${per}&offset=${page * per}`),
    count(`pb_tag_suggestions?select=id&${f}`), loadTaxonomy(),
  ]);
  const ids = [...new Set(rows.flatMap(r => r.examples.slice(0, 3)))];
  const names = new Map((ids.length ? await sel<{ id: string; name: string | null; sku: string | null }>(`pb_products?id=in.(${ids.map(enc).join(',')})&select=id,name,sku`) : []).map(p => [p.id, p.name || p.sku || 'Untitled']));
  const values = taxValues(tax);
  return {
    ok: true, page, per, count: total,
    rows: rows.map(r => ({ ...r, example_names: r.examples.slice(0, 3).map(id => names.get(id)).filter(Boolean), matches: lookAlikes(r.phrase, values, { attributeId: r.attribute_id, max: 3 }), nearest: nearestOf(r, values) })),
  };
}

export async function fillStatus() {
  const r = await one<{ id: string; total: number; filled: number; left_empty: number; created_at: string; finished_at: string | null }>('pb_tag_fill_runs?select=id,total,filled,left_empty,created_at,finished_at&order=created_at.desc&limit=1');
  if (!r) return null;
  // Waiting = what the worker would still take (fillCandidates): an archived product keeps its queue mark but is never picked.
  const waiting = r.finished_at ? 0 : await count(`pb_products?select=id&tag_fill_run=eq.${enc(r.id)}&status=in.(ready,needs_info)`);
  // Nothing left to take, yet no tick closed the run (its last products were archived meanwhile): close it here,
  // or the progress line never ends. Not in its first minutes: a run is created before its products are marked.
  if (!r.finished_at && !waiting && Date.parse(r.created_at) < Date.now() - 2 * 60_000) {
    r.finished_at = nowIso();
    await patch('pb_tag_fill_runs', `id=eq.${enc(r.id)}&finished_at=is.null`, { finished_at: r.finished_at });
  }
  return { ...r, done: Math.max(0, r.total - waiting), waiting };
}

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
  let aim = '';
  if (ids.length) { f.push(`id=in.(${ids.map(enc).join(',')})`); aim = `${ids.length} chosen ${ids.length === 1 ? 'product' : 'products'}`; }
  else if (b.attribute_id) {
    const a = await one<{ name: string }>(`pb_attributes?id=eq.${enc(uuid(b.attribute_id, 'The attribute'))}&select=name`);
    if (!a) throw new HttpError(404, 'That attribute no longer exists.');
    f.push(`missing_attrs=cs.${enc(`{"${a.name.replace(/"/g, '')}"}`)}`);
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
