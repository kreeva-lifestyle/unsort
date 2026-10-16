// "What came back on a date" (Jobwork → Received on): every IN movement
// recorded with that receipt date, across all jobs and jobworkers, with the
// job it belongs to, the material returned with it, and who keyed it in.
// Reads jobwork_entries by (kind, entry_date) — indexed by
// migration 20261016090000_jobwork_auto_close.
import { supabase } from '../../lib/supabase';
import type { JobworkQtyUnit } from '../../types/database';

export interface ReceivedRow {
  id: string; order_id: string; entry_date: string; pcs_ok: number; pcs_rejected: number;
  note: string | null; created_by: string | null; created_at: string;
  job: { jw_number: number; vendor_name: string; sku: string; job_type: string; component: string | null; qty_unit: JobworkQtyUnit; pieces: number; rate: number } | null;
  lines: { qty: number; name: string; unit: string }[];
}
type RawRow = Omit<ReceivedRow, 'job' | 'lines'> & {
  jobwork_orders: ReceivedRow['job'];
  jobwork_entry_lines: { qty: number; jobwork_materials: { name: string; unit: string } | null }[];
};

const COLS = 'id, order_id, entry_date, pcs_ok, pcs_rejected, note, created_by, created_at, jobwork_orders(jw_number, vendor_name, sku, job_type, component, qty_unit, pieces, rate), jobwork_entry_lines(qty, jobwork_materials(name, unit))';

/** Where each job stands today (all receipts to date, not just this day's). */
export interface JobProgress { ok: number; rejected: number; remaining: number; status: string }
/** A day holds a few dozen receipts at most; the cap only guards a runaway. */
export const RECEIVED_CAP = 500;

export async function receivedOn(date: string): Promise<{ rows: ReceivedRow[]; names: Record<string, string>; progress: Record<string, JobProgress>; error: unknown }> {
  const { data, error } = await supabase.from('jobwork_entries').select(COLS)
    .eq('kind', 'in').eq('entry_date', date).order('created_at').limit(RECEIVED_CAP);
  if (error) return { rows: [], names: {}, progress: {}, error };
  const rows = ((data ?? []) as unknown as RawRow[]).map(r => ({
    id: r.id, order_id: r.order_id, entry_date: r.entry_date, pcs_ok: Number(r.pcs_ok) || 0, pcs_rejected: Number(r.pcs_rejected) || 0,
    note: r.note, created_by: r.created_by, created_at: r.created_at, job: r.jobwork_orders,
    lines: (r.jobwork_entry_lines ?? []).filter(l => Number(l.qty) > 0).map(l => ({ qty: Number(l.qty), name: l.jobwork_materials?.name ?? 'Material', unit: l.jobwork_materials?.unit ?? '' })),
  }));
  const ids = [...new Set(rows.map(r => r.created_by).filter((x): x is string => !!x))];
  const jobIds = [...new Set(rows.map(r => r.order_id))];
  const [p, j] = await Promise.all([
    ids.length ? supabase.from('profiles').select('id, full_name').in('id', ids) : Promise.resolve({ data: [], error: null }),
    jobIds.length ? supabase.from('jobwork_order_summary').select('id, pcs_ok, pcs_rejected, pcs_remaining, status').in('id', jobIds) : Promise.resolve({ data: [], error: null }),
  ]);
  const names: Record<string, string> = {};
  for (const u of (p.data ?? []) as { id: string; full_name: string | null }[]) names[u.id] = u.full_name?.trim() || 'User';
  const progress: Record<string, JobProgress> = {};
  for (const x of (j.data ?? []) as { id: string; pcs_ok: number; pcs_rejected: number; pcs_remaining: number; status: string }[])
    progress[x.id] = { ok: Number(x.pcs_ok) || 0, rejected: Number(x.pcs_rejected) || 0, remaining: Number(x.pcs_remaining) || 0, status: x.status };
  return { rows, names, progress, error: p.error || j.error };
}

/** Every jobworker who has a job, A→Z — the picker on Received on. */
export async function jobworkerNames(): Promise<{ names: string[]; error: unknown }> {
  const { data, error } = await supabase.from('jobwork_orders').select('vendor_name').order('vendor_name').limit(2000);
  return { names: [...new Set(((data ?? []) as { vendor_name: string }[]).map(r => r.vendor_name).filter(Boolean))], error };
}
