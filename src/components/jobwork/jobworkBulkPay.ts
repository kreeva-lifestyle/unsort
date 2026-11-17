// Bulk pay (owner, 2026-11-17): every job of ONE jobworker that still has a
// balance, paid together. The jobs are the Open tab's money-owed slice
// (open, or closed with due > 0 — never cancelled, which the payments guard
// refuses). The payments go in as ONE insert of one row per job: a single
// statement, so either every job is paid or none is; the existing triggers
// still check each row (RLS: admin/manager), write its audit line and
// auto-close the job when it is settled.
import { supabase } from '../../lib/supabase';
import type { JobworkPayMode, JobworkSummary } from '../../types/database';
import { n } from './jobworkModel';

export type OwedJob = Pick<JobworkSummary, 'id' | 'jw_number' | 'sku' | 'job_type' | 'component' | 'job_date' | 'bill' | 'paid' | 'due'>;
const OWED_COLS = 'id, jw_number, sku, job_type, component, job_date, bill, paid, due';

/** Rupees to the paisa, as the payment is stored. */
export const paise = (v: unknown): number => Math.round(n(v) * 100) / 100;
export const totalOf = (jobs: Pick<OwedJob, 'due'>[]): number => paise(jobs.reduce((s, j) => s + paise(j.due), 0));

/** One jobworker's jobs with money owed, oldest first. The name is matched
 *  exactly, as the list's jobworker filter does. */
export async function owedJobs(vendor: string): Promise<{ jobs: OwedJob[]; error: unknown }> {
  const { data, error } = await supabase.from('jobwork_order_summary').select(OWED_COLS)
    .eq('vendor_name', vendor).in('status', ['open', 'closed']).gt('due', 0)
    .order('job_date').order('jw_number').limit(500);
  return { jobs: (data ?? []) as unknown as OwedJob[], error };
}

export interface BulkPayCommon { pay_date: string; mode: JobworkPayMode; reference: string | null; note: string | null }

/** Pays each job its balance as shown. First re-reads the balances: if any
 *  changed since the sheet opened (someone else paid, a receipt came in),
 *  nothing is paid and `changed` is true so the sheet can show the new ones. */
export async function payJobs(vendor: string, jobs: OwedJob[], c: BulkPayCommon): Promise<{ changed: boolean; error: unknown }> {
  const now = await owedJobs(vendor);
  if (now.error) return { changed: false, error: now.error };
  const due = new Map(now.jobs.map(j => [j.id, paise(j.due)]));
  if (jobs.some(j => due.get(j.id) !== paise(j.due))) return { changed: true, error: null };
  const rows = jobs.map(j => ({ order_id: j.id, amount: paise(j.due), ...c }));
  const { error } = await supabase.from('jobwork_payments').insert(rows);
  return { changed: false, error };
}
