// The numbers behind the Jobwork summary, computed from one read of the
// summary view (every non-cancelled job, a few columns). Pure, so the
// screen and a harness can both feed it rows. Pieces and meters never add
// up together: a job counted in meters keeps to its own figure.
import type { JobworkSummary } from '../../types/database';
import { today, workState, n } from './jobworkModel';

export const STAT_COLS = 'status, pcs_remaining, qty_unit, expected_date, due, pieces, pcs_ok, pcs_rejected, out_count, bill, paid, vendor_name';
export type StatRow = Pick<JobworkSummary, 'status' | 'pcs_remaining' | 'qty_unit' | 'expected_date' | 'due' | 'pieces' | 'pcs_ok' | 'pcs_rejected' | 'out_count' | 'bill' | 'paid' | 'vendor_name'>;

export type StateKey = 'notSent' | 'with' | 'part' | 'overdue' | 'done';
export const STATE_LABELS: Record<StateKey, string> = { notSent: 'Not sent yet', with: 'With jobworker', part: 'Part received', overdue: 'Overdue', done: 'All received' };

export interface VendorLoad { vendor: string; pending: number; pendingM: number; jobs: number }
export interface JobStatsData {
  open: number;
  /** Pieces / meters handed over and not yet back, open jobs only. */
  pending: number; pendingM: number;
  overdue: number; oldestLateDays: number;
  /** Open pieces jobs that have been handed over: pieces ordered, and how
   *  many came back OK — with `pending`, the "how much is back" meter. */
  orderedPcs: number; okPcs: number;
  /** Money across every non-cancelled job: `due` is the positive balances
   *  only, `advance` the money paid beyond the bill (due < 0), so that
   *  billed − paid + advance = due. */
  due: number; dueJobs: number; billed: number; paid: number; advance: number; advanceJobs: number;
  /** Open jobs by where the work stands. */
  states: Record<StateKey, number>;
  /** Who holds the most, largest first; past `TOP_VENDORS` folded into `OTHERS`. */
  byVendor: VendorLoad[];
  /** Every open job with work pending, by when it is due back — the same
   *  set the Overdue tile and the Overdue filter count, hand-over or not. */
  dueBack: { overdue: number; today: number; week: number; later: number; none: number };
}

export const TOP_VENDORS = 6;
/** The folded tail of `byVendor` — not a jobworker, so not a filter. */
export const OTHERS = 'Others';

const addDays = (iso: string, days: number): string => {
  const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + days);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const daysBetween = (a: string, b: string) => Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86_400_000);

export function statsOf(rows: StatRow[]): JobStatsData {
  const t = today(), weekEnd = addDays(t, 7);
  const s: JobStatsData = {
    open: 0, pending: 0, pendingM: 0, overdue: 0, oldestLateDays: 0, orderedPcs: 0, okPcs: 0,
    due: 0, dueJobs: 0, billed: 0, paid: 0, advance: 0, advanceJobs: 0,
    states: { notSent: 0, with: 0, part: 0, overdue: 0, done: 0 }, byVendor: [],
    dueBack: { overdue: 0, today: 0, week: 0, later: 0, none: 0 },
  };
  const vendors = new Map<string, VendorLoad>();
  for (const r of rows) {
    s.billed += n(r.bill); s.paid += n(r.paid);
    if (n(r.due) > 0) { s.due += n(r.due); s.dueJobs += 1; }
    else if (n(r.due) < 0) { s.advance += -n(r.due); s.advanceJobs += 1; }
    if (r.status !== 'open') continue;
    s.open += 1;
    const ws = workState(r).label;
    const key: StateKey = ws === 'Overdue' ? 'overdue' : ws === 'Part received' ? 'part' : ws === 'With jobworker' ? 'with' : ws === 'Not sent yet' ? 'notSent' : 'done';
    s.states[key] += 1;
    if (key === 'overdue') { s.overdue += 1; s.oldestLateDays = Math.max(s.oldestLateDays, daysBetween(r.expected_date!, t)); }
    const left = n(r.pcs_remaining), meters = r.qty_unit === 'm';
    if (left > 0) {
      const d = r.expected_date;
      if (!d) s.dueBack.none += 1;
      else if (d < t) s.dueBack.overdue += 1;
      else if (d === t) s.dueBack.today += 1;
      else if (d <= weekEnd) s.dueBack.week += 1;
      else s.dueBack.later += 1;
    }
    // Nothing has moved yet (no send-out, nothing received): the stock is
    // still in-house, so it is not "with" anyone. A receipt without a
    // send-out still proves the hand-over.
    if (n(r.out_count) === 0 && n(r.pcs_ok) + n(r.pcs_rejected) === 0) continue;
    if (meters) s.pendingM += left; else { s.pending += left; s.orderedPcs += n(r.pieces); s.okPcs += n(r.pcs_ok); }
    if (left > 0) {
      const v = vendors.get(r.vendor_name) ?? { vendor: r.vendor_name, pending: 0, pendingM: 0, jobs: 0 };
      v.jobs += 1; if (meters) v.pendingM += left; else v.pending += left;
      vendors.set(r.vendor_name, v);
    }
  }
  const sorted = [...vendors.values()].sort((a, b) => b.pending - a.pending || b.pendingM - a.pendingM || a.vendor.localeCompare(b.vendor));
  if (sorted.length > TOP_VENDORS + 1) {
    const rest = sorted.slice(TOP_VENDORS);
    s.byVendor = [...sorted.slice(0, TOP_VENDORS), rest.reduce((o, v) => ({ vendor: OTHERS, pending: o.pending + v.pending, pendingM: o.pendingM + v.pendingM, jobs: o.jobs + v.jobs }), { vendor: OTHERS, pending: 0, pendingM: 0, jobs: 0 })];
  } else s.byVendor = sorted;
  return s;
}
