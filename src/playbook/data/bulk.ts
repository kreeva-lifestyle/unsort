// The log of bulk changes (Settings → Bulk changes; owner, 2026-11-12). A
// bulk change is one tap that changes many products or listings: an import,
// "Send matching products now", "Re-price", "Retry all", "Read again",
// "Archive the copies". The
// server records each one with the rows it changed (pb_bulk_runs /
// pb_bulk_items) and can take it back for 7 days: only the rows that are
// still as the change left them; what somebody changed since is left alone.
// The list is a direct read (RLS: staff); looking at what a revert would do
// and doing it go through the server (pb-products bulkRevert.ts).
import { supabase } from '../../lib/supabase';
import { pbCall } from './pbFunctions';

export type BulkKind = 'import' | 'route_site' | 'reprice_site' | 'retry_failed' | 'reread_failed' | 'reread' | 'copies';
export type BulkStatus = 'running' | 'done' | 'reverted' | 'partly_reverted';
/** Counts by name (restored, changed, busy…): which ones a kind has is in components/settings/bulkText.ts. */
export type BulkCounts = Record<string, number>;

export interface PbBulkRun {
  id: string; kind: BulkKind; label: string; items: number; status: BulkStatus; details: Record<string, unknown> | null;
  created_at: string; finished_at: string | null; reverted_at: string | null; revert_result: BulkCounts | null;
  by: { full_name: string | null } | null; reverter: { full_name: string | null } | null;
}

/** A bulk change can be taken back for this many days, and is listed that long. */
export const BULK_DAYS = 7;
const COLS = 'id,kind,label,items,status,details,created_at,finished_at,reverted_at,revert_result,'
  + 'by:profiles!pb_bulk_runs_created_by_fkey(full_name),reverter:profiles!pb_bulk_runs_reverted_by_fkey(full_name)';

export async function listBulkRuns(): Promise<PbBulkRun[]> {
  const since = new Date(Date.now() - BULK_DAYS * 86_400_000).toISOString();
  const { data, error } = await supabase.from('pb_bulk_runs').select(COLS).gte('created_at', since).order('created_at', { ascending: false }).limit(50);
  if (error) throw error;
  return (data ?? []) as unknown as PbBulkRun[];
}

/** Only the numbers of a server reply (it also carries ok and the kind). */
const numbers = (r: Record<string, unknown>): BulkCounts => Object.fromEntries(Object.entries(r).filter(([, v]) => typeof v === 'number')) as BulkCounts;

/** What a revert would do right now. Nothing changes. Throws the server's plain sentence when it cannot be reverted. */
export const previewRevert = async (id: string) => numbers(await pbCall('bulk_preview', { run_id: id }));
/** Take the bulk change back (admin / manager). Returns what was done. */
export const revertBulk = async (id: string) => numbers(await pbCall('bulk_revert', { run_id: id }));
