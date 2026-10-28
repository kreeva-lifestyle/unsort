// Jobworker ledger (Jobwork → Ledger): one running account per jobworker
// across all their jobs. Both reads are RPCs (migrations
// 20261028090000_jobworker_ledger, …150000_jobworker_ledger_v2) so the sums
// happen in Postgres and agree with the job list to the paisa.
// Wording follows reports/Jobworker ledger made understandable.md: the
// balance is always a sentence from the owner's side ("You owe Iqbar
// ₹24,636", "Iqbar holds ₹500 advance", "Settled"), the money columns are
// "Billed" and "Paid" (never Dr/Cr), pieces and money keep separate words,
// and the running balance is computed server-side in one fixed order.
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
export interface LedgerJob {
  id: string; jw: number; sku: string; job_type: string; component: string | null; unit: JobworkQtyUnit;
  pieces: number; ok: number; rejected: number; rework: number; pending: number; rate: number; bill: number; paid: number; due: number;
  status: string; job_date: string | null; expected_date: string | null; last_entry_date: string | null; out_count: number;
}
export interface Ledger {
  opening: number; work: number; paid: number; closing: number; count: number;
  month_work: number; month_paid: number; oldest_open: string | null; jobs: LedgerJob[]; rows: LedgerRow[];
}
export interface Period { from: string | null; to: string | null }
export type PeriodId = 'all' | 'month' | 'last_month' | 'fy' | 'custom';
export type LedgerTab = 'jobs' | 'money';
export type RowFilter = 'all' | 'money' | 'pieces';
/** Which account, tab, period and filter are on screen — kept by the Jobwork page so a job opened from a line returns to the same statement. */
export interface LedgerView { key: string | null; tab: LedgerTab; pid: PeriodId; custom: Period; filter: RowFilter }
export const LEDGER_START: LedgerView = { key: null, tab: 'jobs', pid: 'all', custom: { from: null, to: null }, filter: 'all' };
/** The statement shows at most this many lines (totals always cover the whole period). */
export const LEDGER_CAP = 2000;

const num = (v: unknown) => Number(v) || 0;
const NUM_JOB: (keyof LedgerJob)[] = ['pieces', 'ok', 'rejected', 'rework', 'pending', 'rate', 'bill', 'paid', 'due', 'out_count'];
const NUM_ROW: (keyof LedgerRow)[] = ['qty', 'rejected', 'amount', 'paid', 'balance', 'rate'];

export async function workerAccounts(): Promise<{ rows: WorkerAccount[]; error: unknown }> {
  const { data, error } = await supabase.rpc('jobworker_accounts');
  const rows = ((data ?? []) as WorkerAccount[]).map(a => ({ ...a, billed: num(a.billed), paid: num(a.paid), due: num(a.due), pending_pcs: num(a.pending_pcs), pending_m: num(a.pending_m) }));
  return { rows, error };
}

export async function workerLedger(key: string, p: Period): Promise<{ ledger: Ledger | null; error: unknown }> {
  const { data, error } = await supabase.rpc('jobworker_ledger', { p_worker_key: key, p_from: p.from, p_to: p.to });
  if (error || !data) return { ledger: null, error };
  const l = data as Ledger;
  const fix = <T extends object>(o: T, keys: (keyof T)[]) => { const c = { ...o }; for (const k of keys) (c as Record<string, unknown>)[k as string] = num(c[k]); return c; };
  return {
    ledger: {
      opening: num(l.opening), work: num(l.work), paid: num(l.paid), closing: num(l.closing), count: num(l.count),
      month_work: num(l.month_work), month_paid: num(l.month_paid), oldest_open: l.oldest_open ?? null,
      jobs: (l.jobs ?? []).map(j => fix(j, NUM_JOB)), rows: (l.rows ?? []).map(r => fix(r, NUM_ROW)),
    },
    error: null,
  };
}

// ── Periods (the Indian financial year runs April to March) ────────────────
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
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
export const daysSince = (d: string | null, now = today()): number => (d ? Math.max(0, Math.round((Date.parse(now) - Date.parse(d)) / 86400000)) : 0);

// ── Words ───────────────────────────────────────────────────────────────────
export type Tone = 'yl' | 'bl' | 'gr' | 'tx3';
/** The balance as a sentence from the company's side. Positive = the company owes the jobworker. */
export function owed(name: string, b: number): { text: string; short: string; tone: Tone } {
  if (b > 0.005) return { text: `You owe ${name} ${inr(b)}`, short: `You owe ${inr(b)}`, tone: 'yl' };
  if (b < -0.005) return { text: `${name} holds ${inr(-b)} advance`, short: `Advance ${inr(-b)}`, tone: 'bl' };
  return { text: 'Settled — nothing owed', short: 'Settled', tone: 'gr' };
}
/** "89 pcs + 12 m with Iqbar" — pieces and meters never added together. */
export const withThem = (pcs: number, m: number, name: string) => {
  const bits = [pcs ? `${qty(pcs)} pcs` : '', m ? `${qty(m)} m` : ''].filter(Boolean);
  return bits.length ? `${bits.join(' + ')} with ${name}` : `Nothing with ${name}`;
};
export const isMoney = (r: LedgerRow) => r.kind === 'in' || r.kind === 'payment';
const matText = (ms: LedgerRow['materials']) => (ms ?? []).map(x => `${x.name} ${qty(x.qty)} ${unitShort(x.unit)}`.trim()).join(', ');
const u = (r: LedgerRow) => (r.unit === 'm' ? 'm' : 'pcs');
/** What happened, in one line (no money). */
export function lineText(r: LedgerRow): string {
  if (r.kind === 'given') return `Job opened: ${qty(r.qty)} ${u(r)} · ${r.job_type}${r.component ? ` · ${r.component}` : ''}${r.status === 'cancelled' ? ' (cancelled)' : ''}`;
  if (r.kind === 'out') {
    const bits = [r.qty > 0 ? `Sent back ${qty(r.qty)} ${u(r)} for rework` : '', r.materials?.length ? `Material sent: ${matText(r.materials)}` : ''].filter(Boolean);
    return bits.join(' · ') || 'Pieces handed over';
  }
  if (r.kind === 'in') return `Received ${qty(r.qty)} ${u(r)} OK${r.rejected > 0 ? ` · ${qty(r.rejected)} rejected` : ''}${r.materials?.length ? ` · material back: ${matText(r.materials)}` : ''}`;
  return `Paid${r.mode ? ` by ${PAY_MODE_LABELS[r.mode] ?? r.mode}` : ''}${r.reference ? ` · ref ${r.reference}` : ''}`;
}
/** "108 × ₹92/pc" behind a receipt's amount (money viewers only). */
export const rateText = (r: LedgerRow) => (r.kind === 'in' && r.qty > 0 ? `${qty(r.qty)} × ${inr(r.rate)}/${per(r.unit)}` : '');
/** Rows grouped by day, newest day first, newest line first inside a day. */
export function byDay(rows: LedgerRow[]): { d: string; rows: LedgerRow[] }[] {
  const out: { d: string; rows: LedgerRow[] }[] = [];
  for (const r of [...rows].reverse()) { const g = out[out.length - 1]; if (g && g.d === r.d) g.rows.push(r); else out.push({ d: r.d, rows: [r] }); }
  return out;
}
