// Staff actions on the suggestions queue and "Let AI decide" (index.ts):
//   suggestions_list { status?, attribute_id?, page? } → pending phrases by uses, each with up to 3
//                    example product names and its closest look-alikes (tagLook.ts)
//   suggestion_act   { ids, action: add|alias|ignore|move, attribute_id?, value_id?, name?, force? }
//                    add runs the look-alike check first: a phrase with look-alikes is NOT added
//                    and comes back in `conflicts` (unless force); add / alias then re-run the
//                    rules for the example products, so they pick the new word up at once
//   tags_ai_fill     { product_ids? | category? | attribute_id? | needs_info?, missing_only?, now? } → queue (or,
//                    with now and one product, fill it right away: tagFill.ts)
//   tags_fill_status → the latest run's progress
import { uuid, type Body } from './actions.ts';
import { SB_URL, enc, insert, logActivity, nowIso, one, patch, sel, svcHeaders } from './db.ts';
import { HttpError, plain, usdOf } from './http.ts';
import { routeProduct } from './route.ts';
import { fillOne } from './tagFill.ts';
import { exactIn, lookAlikes } from './tagLook.ts';
import { displayName, tagKey } from './tagText.ts';
import { retagProducts } from './tagsProduct.ts';
import { loadTaxonomy, taxValues } from './taxonomy.ts';
import { PRODUCT_COLS, type ProductRow } from './types.ts';
import { newBudget } from './worker.ts';

interface SugRow { id: string; phrase: string; key: string; attribute_id: string | null; status: string; uses: number; examples: string[]; source: string; first_seen_at: string; last_seen_at: string }
const SUG_COLS = 'id,phrase,key,attribute_id,status,uses,examples,source,first_seen_at,last_seen_at';
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
    rows: rows.map(r => ({ ...r, example_names: r.examples.slice(0, 3).map(id => names.get(id)).filter(Boolean), matches: lookAlikes(r.phrase, values, { attributeId: r.attribute_id, max: 3 }) })),
  };
}

export async function suggestionAct(b: Body, userId: string | null) {
  const ids = (Array.isArray(b.ids) ? b.ids : [b.id]).map(v => uuid(v, 'A suggestion')).slice(0, 100);
  if (!ids.length) throw new HttpError(400, 'Pick at least one suggestion.');
  const action = String(b.action || '');
  const rows = await sel<SugRow>(`pb_tag_suggestions?id=in.(${ids.map(enc).join(',')})&select=${SUG_COLS}`);
  if (!rows.length) throw new HttpError(404, 'Those suggestions are gone — reload the list.');
  const inList = `id=in.(${rows.map(r => enc(r.id)).join(',')})`;
  let done = 0; const conflicts: Record<string, unknown[]> = {}; const touched: string[] = [];
  if (action === 'ignore') done = (await patch('pb_tag_suggestions', inList, { status: 'ignored' })).length;
  else if (action === 'move') {
    const to = b.attribute_id ? uuid(b.attribute_id, 'The attribute') : null;
    for (const r of rows) {
      const twin = await one<SugRow>(`pb_tag_suggestions?key=eq.${enc(r.key)}&attribute_id=${to ? `eq.${enc(to)}` : 'is.null'}&id=neq.${enc(r.id)}&select=${SUG_COLS}`);
      if (twin) { await patch('pb_tag_suggestions', `id=eq.${enc(twin.id)}`, { uses: twin.uses + r.uses }); await patch('pb_tag_suggestions', `id=eq.${enc(r.id)}`, { status: 'ignored' }); }
      else await patch('pb_tag_suggestions', `id=eq.${enc(r.id)}`, { attribute_id: to });
      done++;
    }
  } else if (action === 'alias' || action === 'add') {
    const tax = await loadTaxonomy();
    const values = taxValues(tax);
    const into = action === 'alias' ? tax.values.find(v => v.id === uuid(b.value_id, 'The value')) : null;
    if (action === 'alias' && !into) throw new HttpError(404, 'That value no longer exists.');
    for (const r of rows) {
      if (into) {
        const used = tax.values.find(v => v.attribute_id === into.attribute_id && v.id !== into.id && (v.key === r.key || v.aliases.includes(r.key)));
        if (used) throw new HttpError(409, `“${r.phrase}” is already used by “${used.name}”.`);
        if (r.key !== into.key && !into.aliases.includes(r.key)) into.aliases = [...into.aliases, r.key];
        await patch('pb_attribute_values', `id=eq.${enc(into.id)}`, { aliases: into.aliases });
        await patch('pb_tag_suggestions', `id=eq.${enc(r.id)}`, { status: 'aliased', resolved_value_id: into.id });
      } else {
        const attributeId = b.attribute_id ? uuid(b.attribute_id, 'The attribute') : r.attribute_id;
        if (!attributeId || !tax.attrs.some(a => a.id === attributeId)) throw new HttpError(400, `Pick the attribute “${r.phrase}” belongs to.`);
        const name = displayName(rows.length === 1 && b.name ? b.name : r.phrase);
        const same = exactIn(name, values, attributeId);
        if (same) { await patch('pb_tag_suggestions', `id=eq.${enc(r.id)}`, { status: 'aliased', resolved_value_id: same.id }); done++; continue; }
        const matches = lookAlikes(name, values, { attributeId });
        if (matches.length && b.force !== true) { conflicts[r.id] = matches; continue; }
        const last = tax.values.filter(v => v.attribute_id === attributeId).reduce((m, v) => Math.max(m, v.position), 0);
        const [v] = await insert<{ id: string }>('pb_attribute_values', [{ attribute_id: attributeId, name, key: tagKey(name), aliases: r.key !== tagKey(name) ? [r.key] : [], position: last + 1 }], { select: 'id' });
        values.push({ id: v.id, attribute_id: attributeId, attribute: '', name, key: tagKey(name), aliases: [] });
        await patch('pb_tag_suggestions', `id=eq.${enc(r.id)}`, { status: 'added', resolved_value_id: v.id });
      }
      touched.push(...r.examples); done++;
    }
  } else throw new HttpError(400, 'Unknown suggestion action.');
  const retagged = touched.length ? await retagProducts([...new Set(touched)].slice(0, 50)) : 0;
  await logActivity({ action: 'tags_edited', details: { what: 'suggestions', action, done, conflicts: Object.keys(conflicts).length }, user_id: userId });
  return { ok: true, done, conflicts, retagged };
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
  const f = ['status=in.(ready,needs_info)', 'tag_fill_run=is.null', 'locked=not.cs.{tags}', b.missing_only === false ? '' : 'missing_attrs=neq.{}'];
  if (ids.length) f.push(`id=in.(${ids.map(enc).join(',')})`);
  else if (b.attribute_id) {
    const a = await one<{ name: string }>(`pb_attributes?id=eq.${enc(uuid(b.attribute_id, 'The attribute'))}&select=name`);
    if (!a) throw new HttpError(404, 'That attribute no longer exists.');
    f.push(`missing_attrs=cs.${enc(`{"${a.name.replace(/"/g, '')}"}`)}`);
    if (b.category) f.push(`category=eq.${enc(displayName(b.category))}`);
  } else if (b.category) f.push(`category=eq.${enc(displayName(b.category))}`);
  else if (b.needs_info === true) f.push('status=eq.needs_info'); // Products → Needs info: every product waiting for a tag
  else throw new HttpError(400, 'Say which products: a list, a category or an attribute.');
  const [run] = await insert<{ id: string }>('pb_tag_fill_runs', [{ scope: { ids: ids.length, category: b.category ?? null, attribute_id: b.attribute_id ?? null }, created_by: userId }], { select: 'id' });
  const queued = (await patch('pb_products', f.filter(Boolean).join('&'), { tag_fill_run: run.id })).length;
  await patch('pb_tag_fill_runs', `id=eq.${enc(run.id)}`, queued ? { total: queued } : { total: 0, finished_at: new Date().toISOString() });
  await logActivity({ action: 'tags_fill_queued', details: { queued, category: b.category ?? null }, user_id: userId });
  return { ok: true, run_id: run.id, queued };
}
