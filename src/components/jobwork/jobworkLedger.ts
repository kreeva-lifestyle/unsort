// Jobworker ledger (Jobwork → Ledger): one running account per jobworker
// across all their jobs. Both reads are RPCs (migration
// 20261028090000_jobworker_ledger) so the sums happen in Postgres and agree
// with the job list to the paisa: jobworker_accounts() = one line per
// jobworker, jobworker_ledger(key, from, to) = a dated statement with the
// opening balance, every line and a running balance.
// "Balance" is what the company owes the jobworker: work done (OK pieces ×
// rate, booked on the day they came back) minus payments. Below zero = an
// advance paid.
import { supabase } from '../../lib/supabase';
import { today, qty, per, inr, unitShort, PAY_MODE_LABELS } from './jobworkModel';
import type { JobworkQtyUnit } from '../../types/database';

export interface WorkerAccount {
  worker_key: string; vendor_id: string | null; worker_name: string; worker_phone: string | null;
  jobs: number; open_jobs: number; billed: number; paid: number; due: number;
  pending_pcs: number; pending_m: number; last_activity: string | null;
}
export type LedgerKind = 'given' | 'out' | 'in' | 'payment';
export interface LedgerRow {
  d: string; kind: LedgerKind; order_id: string; jw: number; sku: string; job_type: string; component: string | null;
  unit: JobworkQtyUnit; rate: number; status: string; qty: number; rejected: number;
  amount: number; paid: number; balance: number;
  materials: { name: string; qty: number; unit: string }[] | null; note: string | null; mode: string | null; reference: string | null;
}
export interface Ledger { opening: number; work: number; paid: number; closing: number; count: number; rows: LedgerRow[] }
export interface Period { from: string | null; to: string | null }
/** Which account and period are on screen — kept by the Jobwork page so a job opened from a line returns to the same statement. */
export interface LedgerView { key: string | null; pid: PeriodId; custom: Period }
export const LEDGER_START: LedgerView = { key: null, pid: 'all', custom: { from: null, to: null } };
/** The statement shows at most this many lines (totals always cover the whole period). */
export const LEDGER_CAP = 2000;

const num = (v: unknown) => Number(v) || 0;

export async function workerAccounts(): Promise<{ rows: WorkerAccount[]; error: unknown }> {
  const { data, error } = await supabase.rpc('jobworker_accounts');
  const rows = ((data ?? []) as WorkerAccount[]).map(a => ({
    ...a, billed: num(a.billed), paid: num(a.paid), due: num(a.due), pending_pcs: num(a.pending_pcs), pending_m: num(a.pending_m),
  }));
  return { rows, error };
}

export async function workerLedger(key: string, p: Period): Promise<{ ledger: Ledger | null; error: unknown }> {
  const { data, error } = await supabase.rpc('jobworker_ledger', { p_worker_key: key, p_from: p.from, p_to: p.to });
  if (error || !data) return { ledger: null, error };
  const l = data as Ledger;
  return {
    ledger: {
      opening: num(l.opening), work: num(l.work), paid: num(l.paid), closing: num(l.closing), count: num(l.count),
      rows: (l.rows ?? []).map(r => ({ ...r, qty: num(r.qty), rejected: num(r.rejected), amount: num(r.amount), paid: num(r.paid), balance: num(r.balance), rate: num(r.rate) })),
    },
    error: null,
  };
}

// ── Periods (the Indian financial year runs April to March) ────────────────
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export type PeriodId = 'all' | 'month' | 'last_month' | 'fy' | 'custom';
export const PERIODS: { id: Exclude<PeriodId, 'custom'>; label: string }[] = [
  { id: 'all', label: 'All time' }, { id: 'month', label: 'This month' }, { id: 'last_month', label: 'Last month' }, { id: 'fy', label: 'This FY' },
];
export function periodOf(id: Exclude<PeriodId, 'custom'>, now = today()): Period {
  const [y, m] = now.split('-').map(Number);
  if (id === 'month') return { from: iso(y, m, 1), to: now };
  if (id === 'last_month') { const ly = m === 1 ? y - 1 : y, lm = m === 1 ? 12 : m - 1; return { from: iso(ly, lm, 1), to: iso(ly, lm, lastDay(ly, lm)) }; }
  if (id === 'fy') return { from: iso(m >= 4 ? y : y - 1, 4, 1), to: now };
  return { from: null, to: null };
}

// ── Words for one line ──────────────────────────────────────────────────────
const matText = (ms: LedgerRow['materials']) => (ms ?? []).map(x => `${x.name} ${qty(x.qty)} ${unitShort(x.unit)}`.trim()).join(', ');
const u = (r: LedgerRow) => (r.unit === 'm' ? 'm' : 'pcs');
/** What happened, in one line (no money). */
export function lineText(r: LedgerRow): string {
  if (r.kind === 'given') return `Given ${qty(r.qty)} ${u(r)} · ${r.job_type}${r.component ? ` · ${r.component}` : ''}${r.status === 'cancelled' ? ' (job cancelled)' : ''}`;
  if (r.kind === 'out') {
    const bits = [r.qty > 0 ? `Sent back ${qty(r.qty)} ${u(r)} for rework` : '', r.materials?.length ? `Material sent: ${matText(r.materials)}` : ''].filter(Boolean);
    return bits.join(' · ') || 'Handed over to jobworker';   // the OUT that marks the work as sent
  }
  if (r.kind === 'in') {
    const bits = [`Received ${qty(r.qty)} ${u(r)} OK${r.rejected > 0 ? ` · ${qty(r.rejected)} rejected` : ''}`, r.materials?.length ? `Material back: ${matText(r.materials)}` : ''].filter(Boolean);
    return bits.join(' · ');
  }
  return `Paid${r.mode ? ` · ${PAY_MODE_LABELS[r.mode] ?? r.mode}` : ''}${r.reference ? ` · ${r.reference}` : ''}`;
}
/** The rate behind a receipt's amount (admin/manager only). */
export const rateText = (r: LedgerRow) => (r.kind === 'in' && r.qty > 0 ? `${qty(r.qty)} × ${inr(r.rate)}/${per(r.unit)}` : '');
/** "₹1,200 to pay" / "₹300 advance" / "settled". */
export const balanceWords = (b: number) => (Math.abs(b) < 0.005 ? 'settled' : b > 0 ? `${inr(b)} to pay` : `${inr(-b)} advance`);
