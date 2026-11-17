// suggestion_act (index.ts), admin / manager: the answers to suggestions on the Tags page (moved out of tagsQueue.ts,
// which keeps the list and "Let AI decide").
//   { ids[≤100], act: add|alias|ignore|move|nearest, attribute_id?, value_id?, name?, force? }
//   add runs the look-alike check first: a phrase with look-alikes is NOT added and comes back in `conflicts`
//   (unless force); add / alias / nearest then re-run the rules for the example products, so they pick the word up
//   at once. nearest (owner, 2026-11-13: "bulk same as nearest") files each one under ITS OWN nearest value, the
//   one its card shows (tagNearest.ts nearestOf: the word rules, else the AI's kept answer); one without a nearest
//   value, or whose word that attribute already uses for another value, is left as it is and counted in `skipped`.
//   Two or more at once are one bulk change (bulkLog.ts): Settings → Bulk changes takes it back for 7 days.
//   In batches (owner, 2026-11-17: "select all should work for all tags"): "Select all" sends every suggestion under
//   the chip (suggestions_ids) 100 at a time as ONE bulk change — the first batch opens it (`more: true`), each next one
//   names it (`run_id`, only its opener's, while it runs) and the last (no `more`) closes it, its label then counting
//   what all the batches did. A batch that fails closes it there: what the earlier ones did can still be taken back.
import { uuid, type Body } from './actions.ts';
import { asBulk, endRun, startRun } from './bulkLog.ts';
import { enc, insert, logActivity, one, patch, sel, selAll } from './db.ts';
import { HttpError, plain } from './http.ts';
import { exactIn, lookAlikes } from './tagLook.ts';
import { nearestOf } from './tagNearest.ts';
import { displayName, tagKey } from './tagText.ts';
import { retagProducts } from './tagsProduct.ts';
import { SUG_COLS, type SugRow } from './tagsQueue.ts';
import { loadTaxonomy, taxValues } from './taxonomy.ts';

const ACTIONS = ['ignore', 'move', 'alias', 'add', 'nearest'];

/** What a bulk suggestion action is called in Settings → Bulk changes: "Ignored 12 suggestions (Georgette, Wine, Net and
 *  9 more)", "Moved … to Fabric", "Made … also known as Pink", "Added … as tag values", "Made … also known as their
 *  nearest values". */
async function labelOf(b: Body, action: string, rows: Pick<SugRow, 'phrase'>[], total = rows.length): Promise<string> {
  const n = `${total} suggestions (${rows.slice(0, 3).map(r => r.phrase).join(', ')}${total > 3 ? ` and ${total - 3} more` : ''})`;
  const name = async (path: string) => (await one<{ name: string }>(path))?.name ?? '';
  if (action === 'ignore') return `Ignored ${n}`;
  if (action === 'add') return `Added ${n} as tag values`;
  if (action === 'nearest') return `Made ${n} also known as their nearest values`;
  if (action === 'move') return `Moved ${n} to ${b.attribute_id ? await name(`pb_attributes?id=eq.${enc(uuid(b.attribute_id, 'The attribute'))}&select=name`) || 'another attribute' : 'no attribute'}`;
  return `Made ${n} also known as ${await name(`pb_attribute_values?id=eq.${enc(uuid(b.value_id, 'The value'))}&select=name`) || 'a value'}`;
}

export async function suggestionAct(b: Body, userId: string | null) {
  const ids = (Array.isArray(b.ids) ? b.ids : [b.id]).map(v => uuid(v, 'A suggestion')).slice(0, 100);
  if (!ids.length) throw new HttpError(400, 'Pick at least one suggestion.');
  const action = String(b.act || ''); // not `action`: that field names the request itself (index.ts)
  if (!ACTIONS.includes(action)) throw new HttpError(400, 'Unknown suggestion action.');
  const rows = await sel<SugRow>(`pb_tag_suggestions?id=in.(${ids.map(enc).join(',')})&select=${SUG_COLS}`);
  const batch = b.more === true || b.run_id != null;
  // In a batch, ones somebody else answered meanwhile are simply not there any more: the batch goes on without them.
  if (!rows.length && !batch) throw new HttpError(404, 'Those suggestions are gone — reload the list.');
  // Several at once is a bulk change (bulkLog.ts): Settings → Bulk changes takes it back for 7 days. One is an edit.
  if (!batch) {
    if (rows.length < 2) return { ...await act(b, rows, action, userId, null), run_id: null };
    return asBulk('suggestions', await labelOf(b, action, rows), userId, (run) => act(b, rows, action, userId, run));
  }
  const run = b.run_id != null ? await openRun(b.run_id, userId) : await startRun('suggestions', await labelOf(b, action, rows), { userId });
  let res;
  try { res = rows.length ? await act(b, rows, action, userId, run) : { ok: true, done: 0, conflicts: {}, retagged: 0, ...(action === 'nearest' ? { skipped: 0 } : {}) }; }
  catch (e) { await endRun(run); throw e; }
  if (b.more === true) return { ...res, run_id: run };
  // The work is done: a label that cannot be rewritten keeps the first batch's, it does not fail the answer.
  await relabel(run, b, action).catch(e => console.error(`pb-products suggestions relabel ${run}: ${plain(e)}`));
  return { ...res, run_id: (await endRun(run)) ? run : null };
}

/** The batch's bulk change: still running, of suggestions, and opened by this person. */
async function openRun(id: unknown, userId: string | null): Promise<string> {
  const r = await one<{ id: string; kind: string; status: string; created_by: string | null }>(`pb_bulk_runs?id=eq.${enc(uuid(id, 'The bulk change'))}&select=id,kind,status,created_by`);
  if (!r || r.kind !== 'suggestions' || r.status !== 'running' || r.created_by !== userId) throw new HttpError(409, 'That change was closed before the rest could join it. Select them again and repeat.');
  return r.id;
}

/** The last batch: the label counts every suggestion the batches changed (not just the first batch's). */
async function relabel(run: string, b: Body, action: string) {
  const items = await selAll<{ pk: { id?: string } | null }>(`pb_bulk_items?run_id=eq.${enc(run)}&tbl=eq.pb_tag_suggestions&select=pk&order=id.asc`);
  const ids = [...new Set(items.map(i => i.pk?.id).filter((x): x is string => !!x))];
  if (ids.length < 2) return; // not a bulk change of suggestions: endRun decides what it is
  const named = await sel<{ id: string; phrase: string }>(`pb_tag_suggestions?id=in.(${ids.slice(0, 3).map(enc).join(',')})&select=id,phrase`);
  const first = ids.slice(0, 3).map(id => named.find(n => n.id === id)).filter((x): x is { id: string; phrase: string } => !!x);
  const label = (await labelOf(b, action, first, ids.length)).replace(/\s+/g, ' ').trim().slice(0, 200);
  await patch('pb_bulk_runs', `id=eq.${enc(run)}&status=eq.running`, { label });
}

async function act(b: Body, rows: SugRow[], action: string, userId: string | null, run: string | null) {
  const inList = `id=in.(${rows.map(r => enc(r.id)).join(',')})`;
  let done = 0, skipped = 0; const conflicts: Record<string, unknown[]> = {}; const touched: string[] = [];
  if (action === 'ignore') done = (await patch('pb_tag_suggestions', inList, { status: 'ignored' }, 'id', run)).length;
  else if (action === 'move') {
    const to = b.attribute_id ? uuid(b.attribute_id, 'The attribute') : null;
    for (const r of rows) {
      const twin = await one<SugRow>(`pb_tag_suggestions?key=eq.${enc(r.key)}&attribute_id=${to ? `eq.${enc(to)}` : 'is.null'}&id=neq.${enc(r.id)}&select=${SUG_COLS}`);
      if (twin) { await patch('pb_tag_suggestions', `id=eq.${enc(twin.id)}`, { uses: twin.uses + r.uses }, 'id', run); await patch('pb_tag_suggestions', `id=eq.${enc(r.id)}`, { status: 'ignored' }, 'id', run); }
      else await patch('pb_tag_suggestions', `id=eq.${enc(r.id)}`, { attribute_id: to }, 'id', run);
      done++;
    }
  } else {
    const tax = await loadTaxonomy();
    const values = taxValues(tax);
    const chosen = action === 'alias' ? tax.values.find(v => v.id === uuid(b.value_id, 'The value')) : null;
    if (action === 'alias' && !chosen) throw new HttpError(404, 'That value no longer exists.');
    for (const r of rows) {
      // 'nearest': each into its own nearest value, as its card shows it (tagNearest.ts); one without stays as it is.
      const nid = action === 'nearest' ? nearestOf(r, values)?.value_id : null;
      const into = action === 'nearest' ? (nid ? tax.values.find(v => v.id === nid) : undefined) : chosen;
      if (action === 'nearest' && !into) { skipped++; continue; }
      if (into) {
        const used = tax.values.find(v => v.attribute_id === into.attribute_id && v.id !== into.id && (v.key === r.key || v.aliases.includes(r.key)));
        if (used && action === 'nearest') { skipped++; continue; }
        if (used) throw new HttpError(409, `“${r.phrase}” is already used by “${used.name}”.`);
        if (r.key !== into.key && !into.aliases.includes(r.key)) into.aliases = [...into.aliases, r.key];
        await patch('pb_attribute_values', `id=eq.${enc(into.id)}`, { aliases: into.aliases }, 'id', run);
        await patch('pb_tag_suggestions', `id=eq.${enc(r.id)}`, { status: 'aliased', resolved_value_id: into.id }, 'id', run);
      } else {
        const attributeId = b.attribute_id ? uuid(b.attribute_id, 'The attribute') : r.attribute_id;
        if (!attributeId || !tax.attrs.some(a => a.id === attributeId)) throw new HttpError(400, `Pick the attribute “${r.phrase}” belongs to.`);
        const name = displayName(rows.length === 1 && b.name ? b.name : r.phrase);
        const same = exactIn(name, values, attributeId);
        if (same) { await patch('pb_tag_suggestions', `id=eq.${enc(r.id)}`, { status: 'aliased', resolved_value_id: same.id }, 'id', run); done++; continue; }
        const matches = lookAlikes(name, values, { attributeId });
        if (matches.length && b.force !== true) { conflicts[r.id] = matches; continue; }
        const last = tax.values.filter(v => v.attribute_id === attributeId).reduce((m, v) => Math.max(m, v.position), 0);
        const [v] = await insert<{ id: string }>('pb_attribute_values', [{ attribute_id: attributeId, name, key: tagKey(name), aliases: r.key !== tagKey(name) ? [r.key] : [], position: last + 1 }], { select: 'id', run });
        values.push({ id: v.id, attribute_id: attributeId, attribute: '', name, key: tagKey(name), aliases: [] });
        await patch('pb_tag_suggestions', `id=eq.${enc(r.id)}`, { status: 'added', resolved_value_id: v.id }, 'id', run);
      }
      touched.push(...r.examples); done++;
    }
  }
  const retagged = touched.length ? await retagProducts([...new Set(touched)].slice(0, 50), run) : 0;
  await logActivity({ action: 'tags_edited', details: { what: 'suggestions', action, done, conflicts: Object.keys(conflicts).length, ...(skipped ? { skipped } : {}), ...(run ? { run_id: run } : {}) }, user_id: userId });
  return { ok: true, done, conflicts, retagged, ...(action === 'nearest' ? { skipped } : {}) };
}
