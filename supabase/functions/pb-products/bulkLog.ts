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
import { countRows, enc, insert, nowIso, one, patch, remove } from './db.ts';
import { plain } from './http.ts';

export type BulkKind = 'import' | 'route_site' | 'reprice_site' | 'retry_failed' | 'reread_failed' | 'reread';

/** The note on a listing a revert took back. Routing leaves such a listing alone; "Send matching products now" takes it
 *  again (routeSite.ts). No quotes, commas or brackets: it travels inside database filters. */
export const REVERTED = 'Taken back by a revert of the bulk send that put it here. Send matching products now sends it again if it still matches.';

/** Open a bulk change and return its id. `id`: use this id (an import's own run id); an existing row is left as it is. */
export async function startRun(kind: BulkKind, label: string, o: { id?: string; websiteId?: string | null; userId?: string | null; createdAt?: string } = {}): Promise<string> {
  const row = { ...(o.id ? { id: o.id } : {}), kind, label: label.replace(/\s+/g, ' ').trim().slice(0, 200), website_id: o.websiteId ?? null, created_by: o.userId ?? null, status: 'running', ...(o.createdAt ? { created_at: o.createdAt } : {}) };
  const made = await insert<{ id: string }>('pb_bulk_runs', [row], o.id ? { onConflict: 'id', mode: 'ignore' } : {});
  return made[0]?.id ?? o.id ?? '';
}

/** Close a bulk change with the action's own counts (kept as they are when none are given). Returns how many rows it
 *  changed; with none, the change leaves the log again. Never throws: the work it describes is already done. */
export async function endRun(id: string, details?: Record<string, unknown>): Promise<number> {
  try {
    const n = await countRows(`pb_bulk_items?select=id&run_id=eq.${enc(id)}`);
    if (!n) { await remove('pb_bulk_runs', `id=eq.${enc(id)}&status=eq.running`); return 0; }
    await patch('pb_bulk_runs', `id=eq.${enc(id)}&status=eq.running`, { status: 'done', items: n, finished_at: nowIso(), ...(details ? { details } : {}) });
    return n;
  } catch (e) {
    console.error(`pb-products bulk log ${id}: ${plain(e)}`);
    return -1;
  }
}

export interface RunRow { id: string; kind: BulkKind; label: string; status: string; website_id: string | null; created_at: string; details: Record<string, unknown> | null }
const RUN_COLS = 'id,kind,label,status,website_id,created_at,details';

/** A run that still says 'running' although its action is over (the function was cut off before endRun): closed here,
 *  so it can be reverted. An import is over when its import run is; anything else after 10 minutes. */
export async function settledRun(id: string): Promise<RunRow | null> {
  const r = await one<RunRow>(`pb_bulk_runs?id=eq.${enc(id)}&select=${RUN_COLS}`);
  if (!r || r.status !== 'running') return r;
  const open = r.kind === 'import'
    ? !!(await one(`pb_import_runs?id=eq.${enc(id)}&status=in.(queued,running)&select=id`))
    : Date.parse(r.created_at) > Date.now() - 10 * 60_000;
  if (open) return r;
  const n = await endRun(id);
  return n === 0 ? null : { ...r, status: n > 0 ? 'done' : r.status };
}
