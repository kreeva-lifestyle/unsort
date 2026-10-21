// The PO list, sorted into what needs doing (owner's pick, "Sorted into
// sections"): Overdue first — anything with the vendor past its due date,
// latest first — then To approve, To send, With vendor, Part received, and on
// the Completed tab Received / Closed / Cancelled. Each section carries its
// count, its pieces still to come and its money, so the heading can say who
// to chase. Pure: rows and an ISO "today" in, sections out.
import { T } from '../../lib/theme';
import { dueOf, dueTone, type DueState } from './poDue';
import { unitOf } from './poStats';
import type { PORow } from './POList';

export type SectionKey = 'overdue' | 'approve' | 'send' | 'vendor' | 'partial' | 'received' | 'closed' | 'cancelled';
export const SECTION_ORDER: SectionKey[] = ['overdue', 'approve', 'send', 'vendor', 'partial', 'received', 'closed', 'cancelled'];
export const SECTION_META: Record<SectionKey, { label: string; color: string; short: string }> = {
  overdue: { label: 'Overdue', color: T.re, short: 'overdue' },
  approve: { label: 'To approve', color: T.ac2, short: 'to approve' },
  send: { label: 'To send', color: T.ac2, short: 'to send' },
  vendor: { label: 'With vendor', color: T.bl, short: 'with vendor' },
  partial: { label: 'Part received', color: T.yl, short: 'part received' },
  received: { label: 'Received', color: T.gr, short: 'received' },
  closed: { label: 'Closed short', color: T.tx3, short: 'closed' },
  cancelled: { label: 'Cancelled', color: T.re, short: 'cancelled' },
};
/** The row's own status, as a dot and a word (an overdue row still says what stage it is at). */
export const STATUS_DOT: Record<PORow['status'], { label: string; color: string }> = {
  draft: { label: 'To approve', color: T.ac2 }, approved: { label: 'To send', color: T.ac2 }, sent: { label: 'With vendor', color: T.bl },
  partially_received: { label: 'Part received', color: T.yl }, completed: { label: 'Received', color: T.gr },
  closed: { label: 'Closed short', color: T.tx3 }, cancelled: { label: 'Cancelled', color: T.re },
};

const n = (v: unknown) => Number(v || 0);
const WAITING: PORow['status'][] = ['approved', 'sent', 'partially_received'];

export interface RowView {
  po: PORow;
  ordered: number; got: number; pending: number;
  /** The lines' one unit ("pcs", "m" …); lines in more than one unit are `mixed` — counts are not added, the share is shown instead. */
  unit: string; mixed: boolean;
  /** Open orders only (drafts too): when it is due and where today stands. */
  due: DueState | null;
  /** With the vendor (or approved) and past its due date: the Overdue section. */
  late: boolean;
  /** Past its due date, whatever the status (a draft too): shown in red. */
  pastDue: boolean;
}
/** Quantities still to come, kept apart by unit — metres are never added to pieces. */
export type UnitQty = { unit: string; qty: number }[];
export interface Section { key: SectionKey; rows: RowView[]; pending: UnitQty; total: number; oldestLate: number }

/** Adds each row's still-to-come per unit (mixed-unit orders are left out). */
export const pendingOf = (rows: RowView[]): UnitQty => {
  const m = new Map<string, number>();
  for (const r of rows) if (!r.mixed && r.pending > 0) m.set(r.unit, (m.get(r.unit) ?? 0) + r.pending);
  return [...m.entries()].map(([unit, qty]) => ({ unit, qty })).sort((a, b) => b.qty - a.qty);
};

export function viewOf(po: PORow, today: string): RowView {
  const items = po.purchase_order_items ?? [];
  const ordered = items.reduce((t, it) => t + n(it.quantity), 0);
  const got = items.reduce((t, it) => t + Math.min(n(it.received_qty), n(it.quantity)), 0);
  const units = new Set(items.map(it => unitOf(it.unit)));
  const open = po.status === 'draft' || WAITING.includes(po.status);
  const due = open ? dueOf(po, today) : null;
  const pastDue = !!due && dueTone(due) === 'late';
  return { po, ordered, got, pending: Math.max(0, ordered - got), unit: [...units][0] ?? 'pcs', mixed: units.size > 1, due, late: pastDue && WAITING.includes(po.status), pastDue };
}

const sectionOf = (v: RowView): SectionKey => {
  if (v.late) return 'overdue';
  switch (v.po.status) {
    case 'draft': return 'approve';
    case 'approved': return 'send';
    case 'sent': return 'vendor';
    case 'partially_received': return 'partial';
    case 'completed': return 'received';
    case 'closed': return 'closed';
    default: return 'cancelled';
  }
};

/** The rows on screen in sections, worst first; empty sections are left out. Overdue runs latest first, the rest keep the list's order. */
export function sectionsOf(pos: PORow[], today: string): Section[] {
  const by = new Map<SectionKey, RowView[]>();
  for (const po of pos) { const v = viewOf(po, today), k = sectionOf(v); by.set(k, [...(by.get(k) ?? []), v]); }
  return SECTION_ORDER.filter(k => by.has(k)).map(k => {
    const rows = by.get(k)!;
    if (k === 'overdue') rows.sort((a, b) => (b.due?.late ?? 0) - (a.due?.late ?? 0));
    return { key: k, rows, pending: pendingOf(rows), total: rows.reduce((t, r) => t + n(r.po.grand_total), 0), oldestLate: Math.max(0, ...rows.map(r => r.due?.late ?? 0)) };
  });
}
