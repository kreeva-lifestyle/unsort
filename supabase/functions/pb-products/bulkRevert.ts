// Taking a bulk change back (bulkLog.ts explains the log).
//   bulk_preview { run_id } → what a revert would do right now, in counts; nothing changes
//   bulk_revert  { run_id } → does it (admin / manager)
// The database does the work, row by row, and only where a row is still as
// the bulk change left it (pb_bulk_revert, 20261113060000_pb_bulk_log.sql): a
// row somebody changed since is left alone and counted. It also refuses, in
// plain words, a change that is still running, already taken back, older than
// 7 days, or that a later bulk change of the same kind has built on.
// Two kinds need this function as well:
//   import — the products it added are deleted here, 25 at a time, with their
//     photo files (the database only says which: untouched, on no store).
//     Kept and said: products on a store, products somebody typed into.
//   reread — after the fields are back, the tag rules run again for them.
// A category rename or move is taken back here entirely (categoryRevert.ts).
// A listing that is live on its store is not hidden here: it is marked, and
// the worker takes it off (takeOff.ts). A vendor's stock notice: the database
// finds the listings it took off the websites by their note (PERM_NOTE); one
// archived on Shopify is sent again and made visible (publish.ts put_back).
import { type Body, uuid } from './actions.ts';
import { REVERTED, TAG_KINDS, netRows, settledRun, type RunRow, type TagKind } from './bulkLog.ts';
import { enc, logActivity, remove, rpc, sel } from './db.ts';
import { HttpError } from './http.ts';
import { removeFiles } from './productDelete.ts';
import { PERM_NOTE } from './stockSend.ts';
import { retagProducts } from './tagsProduct.ts';
import { CATEGORY_KINDS, previewCategory, revertCategory } from './categoryRevert.ts';

type Counts = Record<string, number>;
const GONE = 'That bulk change is no longer in the list.';

/** Only the numbers of a database answer (it also carries the kind, the label and, for a re-read, product ids). */
export function counts(res: Record<string, unknown> | null | undefined): Counts {
  const out: Counts = {};
  for (const [k, v] of Object.entries(res || {})) if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  return out;
}

async function runOf(b: Body): Promise<RunRow> {
  const r = await settledRun(uuid(b.run_id, 'run_id'));
  if (!r) throw new HttpError(404, GONE);
  return r;
}

/** The note on the listings the change took off a website, by which the database finds them. */
const noteOf = (r: RunRow) => (r.kind === 'stock_notice' ? PERM_NOTE : REVERTED);

/** What a tag change did to the lists that the database's counts leave out: the category links and the category list it
 *  changed, and the suggestions it changed that were there before it (one it added stays in the queue). Read before a
 *  revert, which marks the record settled. */
async function listCounts(r: RunRow): Promise<Counts> {
  if (!TAG_KINDS.includes(r.kind as TagKind)) return {};
  let links = 0, suggestions = 0, list = 0;
  for (const n of await netRows(r.id, ['pb_category_attributes', 'pb_tag_suggestions', 'pb_settings'], true)) {
    if (!n.changed) continue;
    if (n.tbl === 'pb_category_attributes') links++;
    else if (n.tbl === 'pb_tag_suggestions') { if (n.before) suggestions++; }
    else list = 1;
  }
  return { links, suggestions, list };
}

export async function bulkPreview(b: Body) {
  const r = await runOf(b);
  if (CATEGORY_KINDS.includes(r.kind)) return { ok: true, kind: r.kind, ...await previewCategory(r) };
  const extra = await listCounts(r);
  const res = await rpc<Record<string, unknown>>('pb_bulk_revert', { p_run: r.id, p_apply: false, p_note: noteOf(r) });
  return { ok: true, kind: r.kind, ...counts(res), ...extra };
}

export async function bulkRevert(b: Body, userId: string | null) {
  const r = await runOf(b);
  if (r.kind === 'import') return revertImport(r, userId);
  if (CATEGORY_KINDS.includes(r.kind)) return { ok: true, kind: r.kind, ...await revertCategory(r, userId) };
  const extra = await listCounts(r);
  const res = await rpc<Record<string, unknown>>('pb_bulk_revert', { p_run: r.id, p_apply: true, p_user: userId, p_note: noteOf(r) });
  const done = { ...counts(res), ...extra };
  if (r.kind === 'reread') { // the tags the rules read off the name, colour and details follow the text that is back
    const ids = Array.isArray(res.ids) ? res.ids.map(String) : [];
    for (let i = 0; i < ids.length; i += 50) await retagProducts(ids.slice(i, i + 50));
  }
  await logActivity({ website_id: r.website_id, action: 'bulk_reverted', details: { run_id: r.id, kind: r.kind, label: r.label, ...done }, user_id: userId });
  return { ok: true, kind: r.kind, ...done };
}

const AT_ONCE = 25, BUDGET_MS = 90_000;

async function revertImport(r: RunRow, userId: string | null) {
  // The same refusals as every revert (still running, too old, already done), in the database's words.
  await rpc('pb_bulk_revert', { p_run: r.id, p_apply: false });
  const t0 = Date.now();
  let deleted = 0, filesLeft = 0, more = false;
  const targets = () => rpc<{ product_id: string; verdict: string }[]>('pb_bulk_import_targets', { p_run: r.id });
  for (;;) {
    if (Date.now() - t0 > BUDGET_MS) { more = true; break; }
    const ids = (await targets()).filter(t => t.verdict === 'delete').slice(0, AT_ONCE).map(t => t.product_id);
    if (!ids.length) break;
    const list = ids.map(enc).join(',');
    const files = (await sel<{ path: string }>(`pb_product_images?product_id=in.(${list})&select=path&limit=1000`)).map(i => i.path).filter(Boolean);
    await remove('pb_products', `id=in.(${list})`); // the rows first, the files second: a failed file removal leaves files nothing points to
    filesLeft += await removeFiles(files);
    await rpc('pb_bulk_mark_done', { p_run: r.id, p_tbl: 'pb_products', p_ids: ids });
    deleted += ids.length;
  }
  const rest = await targets(), left: Counts = {};
  for (const t of rest) left[t.verdict] = (left[t.verdict] || 0) + 1;
  // Kept for good: the ones somebody typed into, and the ones that are gone already. Still open: on a store, or busy.
  const settled = rest.filter(t => t.verdict === 'edited' || t.verdict === 'gone').map(t => t.product_id);
  if (settled.length) await rpc('pb_bulk_mark_done', { p_run: r.id, p_tbl: 'pb_products', p_ids: settled });
  const before = counts((await sel<{ revert_result: Record<string, unknown> | null }>(`pb_bulk_runs?id=eq.${enc(r.id)}&select=revert_result`))[0]?.revert_result);
  const result: Counts = { deleted: (before.deleted || 0) + deleted, on_site: left.on_site || 0, edited: (before.edited || 0) + (left.edited || 0), busy: left.busy || 0, ...(filesLeft ? { files_left: (before.files_left || 0) + filesLeft } : {}) };
  const open = more || (left.delete || 0) > 0 || result.on_site > 0 || result.busy > 0;
  await rpc('pb_bulk_close', { p_run: r.id, p_user: userId, p_result: result, p_more: open });
  await logActivity({ action: 'bulk_reverted', details: { run_id: r.id, kind: r.kind, label: r.label, ...result, ...(more ? { more } : {}) }, user_id: userId });
  return { ok: true, kind: r.kind, ...result, more };
}
