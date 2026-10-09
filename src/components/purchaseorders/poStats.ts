// The numbers behind the Purchase Orders summary, from two small reads:
// every open order with its lines (approved, sent, partly received — the
// vendor has it), and the recent headers (drafts, plus this and last
// month's orders). Pure, so the screen and a harness can both feed it.
// Quantities are summed per unit — meters never add up with pieces.
import { fileDate } from '../../lib/exportName';
import type { PurchaseOrderStatus } from '../../types/database';
import { PENDING_STATUSES } from './pendencyData';

export const OPEN_COLS = 'status, po_date, created_at, expected_date, vendor_name, purchase_order_items(unit, quantity, received_qty)';
export const RECENT_COLS = 'status, po_date, grand_total';
export interface OpenRow {
  status: PurchaseOrderStatus; po_date: string | null; created_at: string | null; expected_date: string | null; vendor_name: string;
  purchase_order_items: { unit: string | null; quantity: number | null; received_qty: number | null }[] | null;
}
export interface RecentRow { status: PurchaseOrderStatus; po_date: string | null; grand_total: number | null }

export type OpenKey = 'approved' | 'sent' | 'partial';
export const OPEN_LABELS: Record<OpenKey, string> = { approved: 'Approved', sent: 'Sent', partial: 'Partly received' };
/** How long an open order has waited since its PO date — the list's own 7 / 14 day colour steps. */
export type AgeKey = 'lt7' | 'd8_14' | 'd15_30' | 'gt30';
export const AGE_LABELS: Record<AgeKey, string> = { lt7: 'Up to 7 d', d8_14: '8–14 d', d15_30: '15–30 d', gt30: 'Over 30 d' };

export interface UnitPending { unit: string; ordered: number; received: number; pending: number; lines: number }
export interface VendorOpen { vendor: string; orders: number; oldestDays: number; pending: number; unit: string }
export interface MonthBuying { orders: number; value: number; rated: number }
export interface PoStatsData {
  open: number; drafts: number;
  states: Record<OpenKey, number>;
  /** Open orders' lines by unit, most pending first; `lines` counts every line, `linesDone` the fully received ones. */
  byUnit: UnitPending[]; lines: number; linesDone: number;
  waiting: { over7: number; over14: number; oldestDays: number; pastExpected: number };
  ages: Record<AgeKey, number>;
  /** Most open orders first; past `TOP_VENDORS` folded into `OTHERS`. `pending` is in the vendor's main unit. */
  byVendor: VendorOpen[];
  /** Orders dated this and last month (drafts and cancelled left out); `rated` = how many carry a total. */
  month: MonthBuying; lastMonth: MonthBuying;
}
export const TOP_VENDORS = 6;
export const OTHERS = 'Others';

const n = (v: unknown): number => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
export const fmtQty = (v: number): string => v.toLocaleString('en-IN', { maximumFractionDigits: 2 });
export const inr = (v: number): string => '₹' + Math.round(v).toLocaleString('en-IN');
const UNIT_ALIASES: Record<string, string> = {
  meter: 'm', meters: 'm', metre: 'm', metres: 'm', mtr: 'm', mtrs: 'm', m: 'm',
  piece: 'pcs', pieces: 'pcs', pc: 'pcs', pcs: 'pcs', nos: 'pcs', no: 'pcs',
  dozen: 'dz', dz: 'dz', kg: 'kg', kgs: 'kg', kilogram: 'kg', yard: 'yd', yards: 'yd', yd: 'yd',
};
/** "Meter" / "Mtrs" / "m" → "m"; an unknown unit keeps its own (lower-cased) name. */
export const unitOf = (u: string | null | undefined): string => { const k = (u ?? '').trim().toLowerCase(); return UNIT_ALIASES[k] ?? (k || 'units'); };

const pad = (x: number) => String(x).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const addDays = (day: string, days: number): string => { const d = new Date(day + 'T00:00:00'); d.setDate(d.getDate() + days); return iso(d); };
export const daysBetween = (from: string, to: string): number =>
  Math.max(0, Math.round((new Date(to + 'T00:00:00').getTime() - new Date(from + 'T00:00:00').getTime()) / 86_400_000));
export const monthStart = (day: string): string => day.slice(0, 7) + '-01';
export const lastMonthStart = (day = fileDate()): string => { const d = new Date(monthStart(day) + 'T00:00:00'); d.setMonth(d.getMonth() - 1); return iso(d); };
/** The day an open order's wait is counted from: its PO date, else the day it was raised. */
export const sinceOf = (r: Pick<OpenRow, 'po_date' | 'created_at'>, today: string): string => r.po_date || r.created_at?.slice(0, 10) || today;

export function poStatsOf(open: OpenRow[], recent: RecentRow[], today = fileDate()): PoStatsData {
  const mStart = monthStart(today), lmStart = lastMonthStart(today);
  const s: PoStatsData = {
    open: 0, drafts: 0, states: { approved: 0, sent: 0, partial: 0 }, byUnit: [], lines: 0, linesDone: 0,
    waiting: { over7: 0, over14: 0, oldestDays: 0, pastExpected: 0 }, ages: { lt7: 0, d8_14: 0, d15_30: 0, gt30: 0 }, byVendor: [],
    month: { orders: 0, value: 0, rated: 0 }, lastMonth: { orders: 0, value: 0, rated: 0 },
  };
  for (const r of recent) {
    if (r.status === 'draft') { s.drafts += 1; continue; }
    if (r.status === 'cancelled' || !r.po_date) continue;
    const b = r.po_date >= mStart ? s.month : r.po_date >= lmStart ? s.lastMonth : null;
    if (!b) continue;
    b.orders += 1;
    const v = n(r.grand_total); if (v > 0) { b.value += v; b.rated += 1; }
  }
  const units = new Map<string, UnitPending>();
  const vendors = new Map<string, { vendor: string; orders: number; oldestDays: number; pending: Map<string, number> }>();
  for (const r of open) {
    if (!PENDING_STATUSES.includes(r.status)) continue;
    s.open += 1;
    s.states[r.status === 'partially_received' ? 'partial' : r.status === 'sent' ? 'sent' : 'approved'] += 1;
    const days = daysBetween(sinceOf(r, today), today);
    s.ages[days <= 7 ? 'lt7' : days <= 14 ? 'd8_14' : days <= 30 ? 'd15_30' : 'gt30'] += 1;
    if (days > 7) s.waiting.over7 += 1;
    if (days > 14) s.waiting.over14 += 1;
    s.waiting.oldestDays = Math.max(s.waiting.oldestDays, days);
    if (r.expected_date && r.expected_date < today) s.waiting.pastExpected += 1;
    const v = vendors.get(r.vendor_name) ?? { vendor: r.vendor_name, orders: 0, oldestDays: 0, pending: new Map<string, number>() };
    v.orders += 1; v.oldestDays = Math.max(v.oldestDays, days); vendors.set(r.vendor_name, v);
    for (const it of r.purchase_order_items ?? []) {
      const q = n(it.quantity), got = n(it.received_qty), left = Math.max(0, q - got), u = unitOf(it.unit);
      s.lines += 1; if (left === 0) s.linesDone += 1;
      const b = units.get(u) ?? { unit: u, ordered: 0, received: 0, pending: 0, lines: 0 };
      // Over-delivery is normal; the meter counts it as fully received, not more.
      b.ordered += q; b.received += Math.min(got, q); b.pending += left; b.lines += 1; units.set(u, b);
      v.pending.set(u, (v.pending.get(u) ?? 0) + left);
    }
  }
  s.byUnit = [...units.values()].sort((a, b) => b.pending - a.pending || b.ordered - a.ordered);
  const lead = (m: Map<string, number>): [string, number] => [...m.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
  const sorted = [...vendors.values()]
    .map(v => { const [unit, pending] = lead(v.pending); return { vendor: v.vendor, orders: v.orders, oldestDays: v.oldestDays, pending, unit }; })
    .sort((a, b) => b.orders - a.orders || b.oldestDays - a.oldestDays || a.vendor.localeCompare(b.vendor));
  if (sorted.length > TOP_VENDORS + 1) {
    const rest = sorted.slice(TOP_VENDORS);
    s.byVendor = [...sorted.slice(0, TOP_VENDORS), { vendor: OTHERS, orders: rest.reduce((t, v) => t + v.orders, 0), oldestDays: Math.max(...rest.map(v => v.oldestDays)), pending: 0, unit: '' }];
  } else s.byVendor = sorted;
  return s;
}
