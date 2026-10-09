// Jobwork maths and labels — pure functions shared by the screens and the
// share image. Pieces: ordered − OK − rejected + sent back for rework =
// still with the jobworker. Material: sent − returned − (OK pcs × usage/pc)
// = what the jobworker should still hold (negative = used more than planned).
import type { JobworkSummary, JobworkMaterial, JobworkEntry, JobworkPayment, JobworkQtyUnit } from '../../types/database';
import { fileDate } from '../../lib/exportName';

export const JOB_TYPES = ['Embroidery', 'Handwork', 'Printing', 'Dyeing', 'Washing', 'Stitching', 'Cutwork', 'Finishing'];
export const MATERIAL_UNITS = ['Meter', 'Pcs', 'Yard', 'Kg', 'Gram', 'Set'];
export const PAY_MODE_LABELS: Record<string, string> = { cash: 'Cash', bank: 'Bank', upi: 'UPI', cheque: 'Cheque', other: 'Other' };

export type EntryWithLines = JobworkEntry & { jobwork_entry_lines: { material_id: string; qty: number }[] };
export interface JobDetail {
  job: JobworkSummary;
  materials: JobworkMaterial[];
  entries: EntryWithLines[];
  payments: JobworkPayment[];
}

export const today = () => fileDate();
export const n = (v: unknown): number => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
/** 2.5 → "2.5", 3 → "3", 2.3333 → "2.33" */
export const qty = (v: number): string => String(Math.round(n(v) * 100) / 100);
/** A job is counted in pieces (whole) or meters (2 decimals). */
export const QTY_UNITS: { id: JobworkQtyUnit; label: string }[] = [{ id: 'pcs', label: 'Pieces' }, { id: 'm', label: 'Meters' }];
/** A job quantity with its unit: "12 pcs", "8.8 m". */
export const qu = (v: number, unit?: JobworkQtyUnit): string => `${qty(v)} ${unit === 'm' ? 'm' : 'pcs'}`;
/** Per-unit suffix for rates and usage: "pc" / "m". */
export const per = (unit?: JobworkQtyUnit): string => (unit === 'm' ? 'm' : 'pc');
/** Pending pieces and meters kept apart: "12 pcs · 5.05 m" (zeros left out). */
export const mixedQty = (pcs: number, m: number): string =>
  [pcs ? qu(pcs, 'pcs') : '', m ? qu(m, 'm') : ''].filter(Boolean).join(' · ') || '0 pcs';
/** "Pieces" / "Meters" (form labels). */
export const unitLabel = (unit?: JobworkQtyUnit): string => (unit === 'm' ? 'Meters' : 'Pieces');
/** Typed quantity is valid for the unit: whole pieces, or meters with ≤ 2 decimals. */
export const validQty = (s: string, unit?: JobworkQtyUnit): boolean =>
  (unit === 'm' ? /^\d+(\.\d{1,2})?$/ : /^\d+$/).test(s.trim());
export const inr = (v: unknown): string => {
  const x = n(v);
  return (x < 0 ? '−₹' : '₹') + Math.abs(x).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};
export const fmtDate = (d: string | null | undefined): string =>
  d ? new Date(d + (d.length <= 10 ? 'T00:00:00' : '')).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
export const shortDate = (d: string | null | undefined): string =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—';
/** A moment, in the phone's own clock: "09 Oct, 03:06 pm". */
export const fmtWhen = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
/** "Manav Bhalala" → "MB", "Manthan" → "M", an email → its first letter. */
export const initials = (name: string): string =>
  name.split('@')[0].trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';

/** One audit row on a job (audit_log, module 'jobwork'): the actor's name
 *  and the real time are stamped by the database, never by the client. */
export interface JobActivityRow { id: string; action: string; details: string | null; user_email: string | null; created_at: string | null }

export const isOverdue = (j: Pick<JobworkSummary, 'status' | 'expected_date' | 'pcs_remaining'>): boolean =>
  j.status === 'open' && !!j.expected_date && j.expected_date < today() && j.pcs_remaining > 0;

/** Where the work stands, in the words used on the floor. */
export type WorkStateInput = Pick<JobworkSummary, 'status' | 'expected_date' | 'pcs_remaining' | 'pcs_ok' | 'pcs_rejected' | 'out_count'>;
export function workState(j: WorkStateInput): { label: string; tone: 'gr' | 'yl' | 're' | 'bl' | 'tx3' } {
  if (j.status === 'cancelled') return { label: 'Cancelled', tone: 'tx3' };
  if (j.status === 'closed') return { label: j.pcs_remaining > 0 ? 'Closed short' : 'Closed', tone: 'tx3' };
  if (isOverdue(j)) return { label: 'Overdue', tone: 're' };
  if (j.pcs_remaining === 0) return { label: 'All received', tone: 'gr' };
  if (j.pcs_ok + j.pcs_rejected > 0) return { label: 'Part received', tone: 'yl' };
  if (j.out_count > 0) return { label: 'With jobworker', tone: 'bl' };
  return { label: 'Not sent yet', tone: 'tx3' };
}

export function payState(j: Pick<JobworkSummary, 'bill' | 'paid' | 'due'>): { label: string; tone: 'gr' | 'yl' | 're' | 'bl' | 'tx3' } {
  const bill = n(j.bill), paid = n(j.paid), due = n(j.due);
  if (bill === 0 && paid === 0) return { label: 'Nothing billed', tone: 'tx3' };
  if (due < 0) return { label: `Advance ${inr(-due)}`, tone: 'bl' };
  if (paid === 0) return { label: 'Unpaid', tone: 're' };
  if (due > 0) return { label: 'Part paid', tone: 'yl' };
  return { label: 'Paid', tone: 'gr' };
}

export interface MaterialBalance {
  m: JobworkMaterial;
  sent: number;
  returned: number;
  /** OK pcs × usage per piece; null when usage/pc is unknown. */
  used: number | null;
  /** What the jobworker should still hold (sent − returned − used). */
  held: number;
}

export function materialBalances(d: Pick<JobDetail, 'materials' | 'entries'>, pcsOk: number): MaterialBalance[] {
  const sent = new Map<string, number>(), back = new Map<string, number>();
  for (const e of d.entries) for (const l of e.jobwork_entry_lines) {
    const map = e.kind === 'out' ? sent : back;
    map.set(l.material_id, (map.get(l.material_id) ?? 0) + n(l.qty));
  }
  return d.materials
    .filter(m => !m.removed || sent.has(m.id) || back.has(m.id))
    .map(m => {
      const s = sent.get(m.id) ?? 0, r = back.get(m.id) ?? 0;
      const used = m.per_piece == null ? null : n(m.per_piece) * pcsOk;
      return { m, sent: s, returned: r, used, held: s - r - (used ?? 0) };
    });
}

/** Rejected pieces we hold that can still go back for rework. */
export const rejectedHeld = (j: Pick<JobworkSummary, 'pcs_rejected' | 'pcs_rework'>) => Math.max(0, j.pcs_rejected - j.pcs_rework);

export type TimelineRow =
  | { kind: 'out' | 'in'; date: string; at: string; entry: EntryWithLines }
  | { kind: 'pay'; date: string; at: string; pay: JobworkPayment };

/** Movements and payments in one dated list, oldest first. */
export function timeline(d: Pick<JobDetail, 'entries' | 'payments'>): TimelineRow[] {
  const rows: TimelineRow[] = [
    ...d.entries.map(e => ({ kind: e.kind, date: e.entry_date, at: e.created_at, entry: e }) as TimelineRow),
    ...d.payments.map(p => ({ kind: 'pay', date: p.pay_date, at: p.created_at, pay: p }) as TimelineRow),
  ];
  return rows.sort((a, b) => (a.date === b.date ? a.at.localeCompare(b.at) : a.date.localeCompare(b.date)));
}

/** "30 m flute · 50 pcs lining" */
export function linesText(lines: { material_id: string; qty: number }[], materials: JobworkMaterial[]): string {
  return lines.map(l => {
    const m = materials.find(x => x.id === l.material_id);
    return `${qty(l.qty)} ${unitShort(m?.unit)} ${m?.name ?? 'material'}`;
  }).join(' · ');
}
export const unitShort = (u?: string | null): string =>
  ({ Meter: 'm', Pcs: 'pcs', Yard: 'yd', Kg: 'kg', Gram: 'g', Set: 'set' } as Record<string, string>)[u ?? ''] ?? (u || '');
