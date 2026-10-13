// When an open purchase order is due, and where today stands against it.
// The due date is the PO's expected date; a PO raised without one gives the
// vendor ASSUMED_LEAD_DAYS from the PO date (owner's rule). Past the due
// date the order is "breached" — the summary tile, the list rows, the due
// columns and the vendor pendency report all read this one definition.
// Pure: dates in and out are ISO days, so a harness can feed any "today".

/** No expected date on the PO → due this many days after the PO date. */
export const ASSUMED_LEAD_DAYS = 3;

const pad = (x: number) => String(x).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const addDays = (day: string, days: number): string => { const d = new Date(day + 'T00:00:00'); d.setDate(d.getDate() + days); return iso(d); };
/** Whole days from `from` to `to`, never negative. */
export const daysBetween = (from: string, to: string): number =>
  Math.max(0, Math.round((new Date(to + 'T00:00:00').getTime() - new Date(from + 'T00:00:00').getTime()) / 86_400_000));

export interface DueInput { po_date: string | null; created_at: string | null; expected_date: string | null }
/** The day an open order's wait is counted from: its PO date, else the day it was raised. */
export const sinceOf = (r: Pick<DueInput, 'po_date' | 'created_at'>, today: string): string => r.po_date || r.created_at?.slice(0, 10) || today;

export interface DueState {
  /** ISO day the order was due. */
  due: string;
  /** No expected date on the PO — `due` is the PO date plus ASSUMED_LEAD_DAYS. */
  assumed: boolean;
  /** Days past the due date (0 when not yet due or due today). */
  late: number;
  /** Days still to go (0 when due today or already late). */
  left: number;
}
export const dueOf = (r: DueInput, today: string): DueState => {
  const due = r.expected_date || addDays(sinceOf(r, today), ASSUMED_LEAD_DAYS);
  return { due, assumed: !r.expected_date, late: daysBetween(due, today), left: daysBetween(today, due) };
};

/** Breached (red), due today (amber) or still within its date. */
export type DueTone = 'late' | 'today' | 'ok';
export const dueTone = (d: Pick<DueState, 'late' | 'left'>): DueTone => (d.late > 0 ? 'late' : d.left === 0 ? 'today' : 'ok');

/** The summary's due columns: how far past (or short of) the due date each open order is. */
export type DueKey = 'ok' | 'today' | 'd1_3' | 'd4_7' | 'gt7';
export const DUE_LABELS: Record<DueKey, string> = { ok: 'Not due yet', today: 'Due today', d1_3: '1–3 d late', d4_7: '4–7 d late', gt7: 'Over 7 d late' };
export const dueBucket = (d: Pick<DueState, 'late' | 'left'>): DueKey =>
  d.late > 7 ? 'gt7' : d.late > 3 ? 'd4_7' : d.late > 0 ? 'd1_3' : d.left === 0 ? 'today' : 'ok';
