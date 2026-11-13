// The log of bulk changes (owner, 2026-11-12: "log all bulk changes … with
// option to revert them … only allow those bulk changes which can be reverted
// in bulk easily without creating any problem").
// A bulk change = one tap that changes many products or listings. Each one:
//   1. startRun → a pb_bulk_runs row ('running');
//   2. passes the run id to every database call that belongs to it (db.ts
//      `run`): the database then records every row the call changes, as it
//      was and as it became, in the same transaction (pb_bulk_capture). A
//      change that cannot be recorded fails, so nothing bulk goes unrecorded;
//   3. endRun → 'done' with the action's own counts; a change that touched
//      nothing leaves the log again.
// Taking one back: bulkRevert.ts (the database does it: pb_bulk_revert,
// 20261113060000_pb_bulk_log.sql). Kinds and what a revert does:
//   import        delete the products it added that nobody touched since
//   route_site    set aside the listings it queued; take the live ones off
//   reprice_site  the old prices back; live listings are sent again
//   retry_failed  the listings not tried again yet go back to Failed
//   reread_failed the products not read again yet go back to Needs info
//   reread        (only from the log of 12 Nov 2026) the fields a re-read changed
//   copies        the copies it archived that are still archived go back to Needs info (copies.ts)
// Part 2 (20261113090000_pb_bulk_log_tags_stock.sql): the changes that reach
// products through the tag lists — retag, tag_fill ("Let AI decide"),
// value_delete, value_merge, attribute_delete, categories, category_links,
// suggestions (tagsBulk.ts, tagsQueue.ts, tagsProduct.ts) — and a vendor's
// stock_notice (stockNotice.ts). One revert serves every tag kind: the rows
// the change deleted come back, the rows it added go, and the products are
// checked again. A notice's products get their stock back, and the listings
// it took off the websites go back.
import { countRows, enc, insert, nowIso, one, patch, remove, rpc, selAll } from './db.ts';
import { plain } from './http.ts';

/** Changes that reach products through the tag lists. */
export type TagKind = 'retag' | 'tag_fill' | 'value_delete' | 'value_merge' | 'attribute_delete' | 'categories' | 'category_links' | 'suggestions';
export const TAG_KINDS: readonly TagKind[] = ['retag', 'tag_fill', 'value_delete', 'value_merge', 'attribute_delete', 'categories', 'category_links', 'suggestions'];
export type BulkKind = 'import' | 'route_site' | 'reprice_site' | 'retry_failed' | 'reread_failed' | 'reread' | 'copies' | TagKind | 'stock_notice';
const BY_PRODUCT: readonly BulkKind[] = [...TAG_KINDS, 'stock_notice'];

/** The note on a listing a revert took back. Routing leaves such a listing alone. "Send matching products now" queues it
 *  again when it never reached the store (routeSite.ts); one that was hidden on the store is put back from its own page.
 *  No quotes, commas or brackets: it travels inside database filters. */
export const REVERTED = 'Taken back by a revert of the bulk send that put it here. Put back on site lists it again.';

/** Open a bulk change and return its id. `id`: use this id (an import's own run id); an existing row is left as it is. */
export async function startRun(kind: BulkKind, label: string, o: { id?: string; websiteId?: string | null; userId?: string | null; createdAt?: string } = {}): Promise<string> {
  const row = { ...(o.id ? { id: o.id } : {}), kind, label: label.replace(/\s+/g, ' ').trim().slice(0, 200), website_id: o.websiteId ?? null, created_by: o.userId ?? null, status: 'running', ...(o.createdAt ? { created_at: o.createdAt } : {}) };
  const made = await insert<{ id: string }>('pb_bulk_runs', [row], o.id ? { onConflict: 'id', mode: 'ignore' } : {});
  return made[0]?.id ?? o.id ?? '';
}

export interface NetRow { tbl: string; before: unknown; after: unknown; changed: boolean }
/** What a run changed in these tables, net, per row: as it was first and as it became last (as pb_bulk_net does; read
 *  here by table, so an import's thousands of rows are not fetched for it). A category's links are replaced by deleting
 *  them all and writing them again: a link written back as it was is no change (`changed` false). `open`: only the rows
 *  no revert has settled yet. */
export async function netRows(id: string, tables: string[], open = false): Promise<NetRow[]> {
  const rows = await selAll<{ tbl: string; pk: unknown; before: unknown; after: unknown }>(`pb_bulk_items?run_id=eq.${enc(id)}${open ? '&done=is.false' : ''}&tbl=in.(${tables.join(',')})&select=tbl,pk,before,after&order=id.asc`);
  const net = new Map<string, NetRow>();
  for (const r of rows) {
    const k = `${r.tbl}|${JSON.stringify(r.pk)}`, had = net.get(k);
    if (had) had.after = r.after; else net.set(k, { tbl: r.tbl, before: r.before, after: r.after, changed: true });
  }
  for (const n of net.values()) n.changed = JSON.stringify(n.before ?? null) !== JSON.stringify(n.after ?? null);
  return [...net.values()];
}

/** The size of a tag change or a stock notice, or null when it is not a bulk change after all (owner: "only those which
 *  are done in bulk"). Bulk = it reached two or more products (their own row or their tags), or — tag lists only — it
 *  took two or more entries out of the lists at once (an attribute goes with its values and links) or handled two or
 *  more suggestions at once. `unit` says what `items` counts (the app words the row by it). */
async function sizeOf(id: string, kind: BulkKind): Promise<{ items: number; unit: string } | null> {
  const products = Number(await rpc<number>('pb_bulk_products', { p_run: id })) || 0;
  if (products >= 2) return { items: products, unit: 'products' };
  if (!['value_delete', 'value_merge', 'attribute_delete', 'categories', 'category_links', 'suggestions'].includes(kind)) return null;
  let entries = 0, suggestions = 0;
  for (const n of await netRows(id, ['pb_attributes', 'pb_attribute_values', 'pb_category_attributes', 'pb_tag_suggestions'])) {
    if (n.tbl === 'pb_tag_suggestions') { if (n.changed) suggestions++; }
    else if (n.before && !n.after) entries++;
  }
  if (entries >= 2) return { items: entries, unit: 'entries' };
  if (suggestions >= 2) return { items: suggestions, unit: 'suggestions' };
  return null;
}

/** Close a bulk change with the action's own counts (kept as they are when none are given). Returns how many rows it
 *  changed (a tag change or a stock notice: how many products it reached, sizeOf); with none — or below the size of a
 *  bulk change — the change leaves the log again. Never throws: the work it describes is already done. */
export async function endRun(id: string, details?: Record<string, unknown>): Promise<number> {
  try {
    const n = await countRows(`pb_bulk_items?select=id&run_id=eq.${enc(id)}`);
    const run = n ? await one<{ kind: BulkKind }>(`pb_bulk_runs?id=eq.${enc(id)}&select=kind`) : null;
    const size = run && BY_PRODUCT.includes(run.kind) ? await sizeOf(id, run.kind) : n ? { items: n, unit: '' } : null;
    if (!size) { await remove('pb_bulk_runs', `id=eq.${enc(id)}&status=eq.running`); return 0; }
    const all = { ...(details || {}), ...(size.unit ? { unit: size.unit } : {}) };
    await patch('pb_bulk_runs', `id=eq.${enc(id)}&status=eq.running`, { status: 'done', items: size.items, finished_at: nowIso(), ...(Object.keys(all).length ? { details: all } : {}) });
    return size.items;
  } catch (e) {
    console.error(`pb-products bulk log ${id}: ${plain(e)}`);
    return -1;
  }
}

/** One tap that changes many rows, as a bulk change: `work` gets the run id to pass to each of its database calls. The
 *  run is closed afterwards, also when `work` fails half-way (what it did is recorded). `run_id` = the change in the log,
 *  or null when it turned out not to be a bulk change (endRun). */
export async function asBulk<T extends object>(kind: BulkKind, label: string, userId: string | null, work: (run: string) => Promise<T>, details?: (r: T) => Record<string, unknown>): Promise<T & { run_id: string | null }> {
  const run = await startRun(kind, label, { userId });
  let res: T;
  try { res = await work(run); } catch (e) { await endRun(run); throw e; }
  const kept = await endRun(run, details?.(res));
  return { ...res, run_id: kept ? run : null };
}

export interface RunRow { id: string; kind: BulkKind; label: string; status: string; website_id: string | null; created_at: string; details: Record<string, unknown> | null }
const RUN_COLS = 'id,kind,label,status,website_id,created_at,details';

/** "Let AI decide" (queued: the bulk run has the fill run's id) is over when no product waits in its queue and its last
 *  product was taken 5 minutes ago or more: a product another worker run took may still be on its way (tagFill.ts). */
export async function fillOver(id: string): Promise<boolean> {
  if (await one(`pb_products?tag_fill_run=eq.${enc(id)}&status=in.(ready,needs_info)&select=id`)) return false;
  const f = await one<{ finished_at: string | null }>(`pb_tag_fill_runs?id=eq.${enc(id)}&select=finished_at`);
  return !f || (!!f.finished_at && Date.parse(f.finished_at) < Date.now() - 5 * 60_000);
}

/** A run that still says 'running' although its action is over (the function was cut off before endRun): closed here,
 *  so it can be reverted. An import is over when its import run is; "Let AI decide" by fillOver (the worker closes it
 *  too: tagFill.ts closeFills); anything else after 10 minutes. */
export async function settledRun(id: string): Promise<RunRow | null> {
  const r = await one<RunRow>(`pb_bulk_runs?id=eq.${enc(id)}&select=${RUN_COLS}`);
  if (!r || r.status !== 'running') return r;
  const open = r.kind === 'import' ? !!(await one(`pb_import_runs?id=eq.${enc(id)}&status=in.(queued,running)&select=id`))
    : r.kind === 'tag_fill' ? !(await fillOver(id))
    : Date.parse(r.created_at) > Date.now() - 10 * 60_000;
  if (open) return r;
  const n = await endRun(id);
  return n === 0 ? null : { ...r, status: n > 0 ? 'done' : r.status };
}
