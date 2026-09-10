// Vendor pendency: every open purchase order for one vendor with what is
// still to come, headlined by "pending since" (owner's ask — the report
// goes to the vendor as a nudge, so the wait is the point). Open means the
// vendor has the order: approved, sent or partially received. Drafts have
// not reached the vendor; completed and cancelled are over.
import { supabase } from '../../lib/supabase';
import type { PurchaseOrderStatus } from '../../types/database';

export const PENDING_STATUSES: PurchaseOrderStatus[] = ['approved', 'sent', 'partially_received'];

export interface PendencyItem { sku: string | null; item_name: string; unit: string | null; quantity: number; received: number; pending: number; rate: number | null }
export interface PendencyPo {
  id: string; po_number: number; po_date: string | null; expected_date: string | null; status: PurchaseOrderStatus;
  /** ISO date the wait is counted from — the PO date, else the day it was created. */
  since: string; days: number;
  items: PendencyItem[]; pendingQty: number; pendingAmount: number | null;
}
export interface PendencyReport {
  vendor: string; phone: string | null; generated: string;
  pos: PendencyPo[];
  totals: { orders: number; pendingQty: number; oldestSince: string | null; oldestDays: number; pendingAmount: number | null };
}
export interface PendingVendor { name: string; phone: string | null; orders: number; oldestSince: string | null }

const dayMs = 86400000;
export const daysSince = (iso: string): number => {
  const d = new Date(iso.length <= 10 ? iso + 'T00:00:00' : iso);
  return Number.isNaN(d.getTime()) ? 0 : Math.max(0, Math.floor((Date.now() - d.getTime()) / dayMs));
};
const dateOnly = (iso: string) => iso.slice(0, 10);

type Row = {
  id: string; po_number: number; po_date: string | null; expected_date: string | null; status: PurchaseOrderStatus; created_at: string | null; vendor_phone: string | null;
  purchase_order_items: { sku: string | null; item_name: string; unit: string | null; quantity: number; received_qty: number | null; rate: number | null; sort_order: number | null }[] | null;
};

/** Pure: shape raw rows into the report (harness-testable). `now` only feeds the generated stamp. */
export function buildReport(vendor: string, rows: Row[], now = new Date()): PendencyReport {
  const pos: PendencyPo[] = [];
  for (const r of rows) {
    const since = r.po_date ? dateOnly(r.po_date) : r.created_at ? dateOnly(r.created_at) : dateOnly(now.toISOString());
    const items = (r.purchase_order_items || [])
      .slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map(it => {
        const quantity = Number(it.quantity || 0), received = Number(it.received_qty || 0);
        return { sku: it.sku, item_name: it.item_name, unit: it.unit, quantity, received, pending: Math.max(0, quantity - received), rate: it.rate == null ? null : Number(it.rate) };
      })
      .filter(it => it.pending > 0);
    if (items.length === 0) continue; // everything received, only the status lags
    const pendingQty = items.reduce((s, it) => s + it.pending, 0);
    const rated = items.filter(it => it.rate != null);
    const pendingAmount = rated.length ? rated.reduce((s, it) => s + it.pending * (it.rate as number), 0) : null;
    pos.push({ id: r.id, po_number: r.po_number, po_date: r.po_date, expected_date: r.expected_date, status: r.status, since, days: daysSince(since), items, pendingQty, pendingAmount });
  }
  pos.sort((a, b) => a.since.localeCompare(b.since) || a.po_number - b.po_number);
  const phone = rows.find(r => r.vendor_phone)?.vendor_phone ?? null;
  const amounts = pos.filter(p => p.pendingAmount != null);
  return {
    vendor, phone, generated: now.toISOString(), pos,
    totals: {
      orders: pos.length,
      pendingQty: pos.reduce((s, p) => s + p.pendingQty, 0),
      oldestSince: pos[0]?.since ?? null,
      oldestDays: pos[0]?.days ?? 0,
      pendingAmount: amounts.length ? amounts.reduce((s, p) => s + (p.pendingAmount as number), 0) : null,
    },
  };
}

export async function fetchVendorPendency(vendor: string): Promise<PendencyReport> {
  const { data, error } = await supabase.from('purchase_orders')
    .select('id, po_number, po_date, expected_date, status, created_at, vendor_phone, purchase_order_items(sku, item_name, unit, quantity, received_qty, rate, sort_order)')
    .eq('vendor_name', vendor).in('status', PENDING_STATUSES)
    .order('po_date', { ascending: true }).limit(200);
  if (error) throw error;
  return buildReport(vendor, (data as Row[] | null) || []);
}

/** Vendors that have at least one open order, oldest wait first. */
export async function fetchPendingVendors(): Promise<PendingVendor[]> {
  const { data, error } = await supabase.from('purchase_orders')
    .select('vendor_name, vendor_phone, po_date, created_at')
    .in('status', PENDING_STATUSES).order('po_date', { ascending: true }).limit(1000);
  if (error) throw error;
  const map = new Map<string, PendingVendor>();
  for (const r of (data as { vendor_name: string; vendor_phone: string | null; po_date: string | null; created_at: string | null }[] | null) || []) {
    const since = r.po_date ? dateOnly(r.po_date) : r.created_at ? dateOnly(r.created_at) : null;
    const v = map.get(r.vendor_name) || { name: r.vendor_name, phone: r.vendor_phone, orders: 0, oldestSince: null };
    v.orders += 1;
    if (!v.phone && r.vendor_phone) v.phone = r.vendor_phone;
    if (since && (!v.oldestSince || since < v.oldestSince)) v.oldestSince = since;
    map.set(r.vendor_name, v);
  }
  return [...map.values()].sort((a, b) => (a.oldestSince || '').localeCompare(b.oldestSince || '') || a.name.localeCompare(b.name));
}
