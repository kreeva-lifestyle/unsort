// Jobwork reads and writes. Lists read the jobwork_order_summary view
// (totals computed in SQL, paginated); writes go through the RPCs so every
// movement is checked and locked server-side. Every function returns the
// Supabase error for the caller to toast through friendlyError.
import { supabase } from '../../lib/supabase';
import type { JobworkSummary, JobworkMaterial, JobworkPayment, JobworkPaymentInsert, JobworkEntryKind, JobworkQtyUnit } from '../../types/database';
import type { CostingComponent } from '../minis/costing/costingModel';
import { today, type EntryWithLines, type JobDetail, type JobActivityRow } from './jobworkModel';

export const SUMMARY_COLS = 'id, jw_number, vendor_id, vendor_name, vendor_phone, job_type, sku, component, costing_product_id, pieces, qty_unit, rate, job_date, expected_date, status, notes, close_reason, created_at, updated_at, pcs_ok, pcs_rejected, pcs_rework, pcs_remaining, out_count, last_entry_date, bill, paid, due, last_pay_date';
const MATERIAL_COLS = 'id, order_id, name, unit, per_piece, sort_order, removed, created_at, updated_at';
const ENTRY_COLS = 'id, order_id, kind, entry_date, pcs_ok, pcs_rejected, pcs_rework, note, created_by, created_at, jobwork_entry_lines(material_id, qty)';
const PAY_COLS = 'id, order_id, pay_date, amount, mode, reference, note, created_by, created_at';

export type JobFilter = 'open' | 'overdue' | 'unpaid' | 'closed' | 'all';
export const FILTERS: { id: JobFilter; label: string }[] = [
  { id: 'open', label: 'Open' }, { id: 'overdue', label: 'Overdue' }, { id: 'unpaid', label: 'To pay' },
  { id: 'closed', label: 'Closed' }, { id: 'all', label: 'All' },
];

export async function listJobs(opts: { search: string; filter: JobFilter; page: number; perPage: number; vendor?: string | null }) {
  let q = supabase.from('jobwork_order_summary').select(SUMMARY_COLS, { count: 'exact' });
  // Exactly one jobworker (a tap on the summary's bar) — not a text match.
  if (opts.vendor) q = q.eq('vendor_name', opts.vendor);
  if (opts.filter === 'open') q = q.eq('status', 'open');
  if (opts.filter === 'overdue') q = q.eq('status', 'open').lt('expected_date', today()).gt('pcs_remaining', 0);
  if (opts.filter === 'unpaid') q = q.neq('status', 'cancelled').gt('due', 0);
  if (opts.filter === 'closed') q = q.in('status', ['closed', 'cancelled']);
  const s = opts.search.trim().replace(/[%_,()]/g, ' ').trim();
  if (s) {
    const like = `%${s}%`;
    const num = /^#?\d+$/.test(s) ? `,jw_number.eq.${s.replace('#', '')}` : '';
    q = q.or(`sku.ilike.${like},vendor_name.ilike.${like},job_type.ilike.${like}${num}`);
  }
  const from = opts.page * opts.perPage;
  const { data, error, count } = await q.order('created_at', { ascending: false }).order('id').range(from, from + opts.perPage - 1);
  return { rows: (data ?? []) as unknown as JobworkSummary[], count: count ?? 0, error };
}

export async function loadJob(id: string): Promise<{ detail: JobDetail | null; error: unknown }> {
  const [j, m, e, p] = await Promise.all([
    supabase.from('jobwork_order_summary').select(SUMMARY_COLS).eq('id', id).maybeSingle(),
    supabase.from('jobwork_materials').select(MATERIAL_COLS).eq('order_id', id).order('sort_order'),
    supabase.from('jobwork_entries').select(ENTRY_COLS).eq('order_id', id).order('entry_date').order('created_at'),
    supabase.from('jobwork_payments').select(PAY_COLS).eq('order_id', id).order('pay_date').order('created_at'),
  ]);
  const error = j.error || m.error || e.error || p.error;
  if (error || !j.data) return { detail: null, error: error ?? new Error('Job not found') };
  return {
    detail: {
      job: j.data as unknown as JobworkSummary,
      materials: (m.data ?? []) as JobworkMaterial[],
      entries: (e.data ?? []) as unknown as EntryWithLines[],
      payments: (p.data ?? []) as JobworkPayment[],
    },
    error: null,
  };
}

/** Who did what on a job (audit_log, newest first) and the names behind the
 *  movements' created_by ids — one small read each, after the job itself. */
export async function loadJobActivity(id: string, userIds: string[]): Promise<{ audit: JobActivityRow[]; names: Record<string, string>; error: unknown }> {
  const ids = [...new Set(userIds.filter(Boolean))];
  const [a, p] = await Promise.all([
    supabase.from('audit_log').select('id, action, details, user_email, created_at').eq('module', 'jobwork').eq('record_id', id).order('created_at', { ascending: false }).limit(100),
    ids.length ? supabase.from('profiles').select('id, full_name').in('id', ids) : Promise.resolve({ data: [] as { id: string; full_name: string | null }[], error: null }),
  ]);
  const names: Record<string, string> = {};
  for (const r of (p.data ?? []) as { id: string; full_name: string | null }[]) names[r.id] = r.full_name?.trim() || 'User';
  return { audit: (a.data ?? []) as JobActivityRow[], names, error: a.error || p.error };
}

/** Every open job of one jobworker, with movements — the jobworker statement. */
export async function loadVendorOpen(vendorName: string): Promise<{ details: JobDetail[]; error: unknown }> {
  const { data, error } = await supabase.from('jobwork_order_summary').select('id')
    .eq('vendor_name', vendorName).eq('status', 'open').order('job_date').limit(100);
  if (error) return { details: [], error };
  const loaded = await Promise.all(((data ?? []) as { id: string }[]).map(r => loadJob(r.id)));
  const bad = loaded.find(r => r.error);
  return { details: loaded.map(r => r.detail).filter((d): d is JobDetail => !!d), error: bad?.error ?? null };
}

export interface VendorPending { vendor: string; jobs: number; pending: number; pendingM: number; overdue: number; due: number }
/** Jobworkers with open jobs, most pending first (Share pending). Pieces and
 *  meters are summed apart — a total across both would mean nothing. */
export async function openByVendor(): Promise<{ rows: VendorPending[]; error: unknown }> {
  const { data, error } = await supabase.from('jobwork_order_summary')
    .select('vendor_name, pcs_remaining, qty_unit, expected_date, due').eq('status', 'open').limit(2000);
  if (error) return { rows: [], error };
  const by = new Map<string, VendorPending>(), t = today();
  for (const r of (data ?? []) as { vendor_name: string; pcs_remaining: number; qty_unit: string; expected_date: string | null; due: number }[]) {
    const v = by.get(r.vendor_name) ?? { vendor: r.vendor_name, jobs: 0, pending: 0, pendingM: 0, overdue: 0, due: 0 };
    v.jobs += 1; v.due += Number(r.due) || 0;
    if (r.qty_unit === 'm') v.pendingM += Number(r.pcs_remaining) || 0; else v.pending += Number(r.pcs_remaining) || 0;
    if (r.expected_date && r.expected_date < t && r.pcs_remaining > 0) v.overdue += 1;
    by.set(r.vendor_name, v);
  }
  return { rows: [...by.values()].sort((a, b) => b.pending - a.pending || b.pendingM - a.pendingM || a.vendor.localeCompare(b.vendor)), error: null };
}

export interface MaterialDraft { id?: string; name: string; unit: string; per_piece: string }
export interface JobDraft {
  vendor_id: string | null; vendor_name: string; vendor_phone: string;
  job_type: string; sku: string; component: string; costing_product_id: string | null;
  pieces: string; qty_unit: JobworkQtyUnit; rate: string; job_date: string; expected_date: string; notes: string;
}

export async function saveJob(id: string | null, d: JobDraft, materials: MaterialDraft[]) {
  const num = (s: string) => (s.trim() === '' ? null : Number(s));
  const { data, error } = await supabase.rpc('save_jobwork_order', {
    p_id: id,
    p_order: { ...d, pieces: num(d.pieces), rate: num(d.rate) ?? 0, expected_date: d.expected_date || null, job_date: d.job_date || null },
    p_materials: materials.map(m => ({ id: m.id ?? null, name: m.name, unit: m.unit, per_piece: num(m.per_piece) })),
  });
  return { id: (data as string | null) ?? null, error };
}

export async function addEntry(orderId: string, kind: JobworkEntryKind, e: {
  date: string; ok: number; rejected: number; rework: number; note: string; lines: { material_id: string; qty: number }[];
}) {
  const { error } = await supabase.rpc('add_jobwork_entry', {
    p_order_id: orderId, p_kind: kind, p_date: e.date || null, p_pcs_ok: e.ok, p_pcs_rejected: e.rejected,
    p_pcs_rework: e.rework, p_note: e.note, p_lines: e.lines.filter(l => l.qty > 0),
  });
  return { error };
}

export const deleteEntry = (id: string) => supabase.from('jobwork_entries').delete().eq('id', id);
export const addPayment = (p: JobworkPaymentInsert) => supabase.from('jobwork_payments').insert(p);
export const deletePayment = (id: string) => supabase.from('jobwork_payments').delete().eq('id', id);
export const setStatus = (id: string, status: 'open' | 'closed' | 'cancelled', reason = '') =>
  supabase.rpc('set_jobwork_status', { p_order_id: id, p_status: status, p_reason: reason });

export interface CostingRef { id: string; sku: string; image_url: string | null; components: CostingComponent[] }
/** The costing sheet for a SKU (newest first), for photo, components, rates and usage. */
export async function costingFor(sku: string): Promise<{ costing: CostingRef | null; error: unknown }> {
  const s = sku.trim();
  if (!s) return { costing: null, error: null };
  const { data, error } = await supabase.from('costing_products').select('id, sku, image_url, components')
    .ilike('sku', s.replace(/[%_]/g, '\\$&')).order('created_at', { ascending: false }).limit(1);
  return { costing: ((data ?? [])[0] as CostingRef | undefined) ?? null, error };
}

export async function costingImage(id: string | null): Promise<{ url: string | null; error: unknown }> {
  if (!id) return { url: null, error: null };
  const { data, error } = await supabase.from('costing_products').select('image_url').eq('id', id).maybeSingle();
  return { url: (data as { image_url: string | null } | null)?.image_url ?? null, error };
}
