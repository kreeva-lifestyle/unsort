// Everything the PO detail shows beyond the header row: the lines, the
// receipts, the audit trail, and the names behind every actor id (who
// raised, approved, closed or cancelled it; who received each delivery).
// Lines and receipts are blocking — a detail with missing lines would
// print a wrong document — while the trail and the names are not: the
// card offers a retry.
import { supabase } from '../../lib/supabase';
import type { PurchaseOrder, PurchaseOrderItem, PurchaseOrderReceipt, AuditLog } from '../../types/database';

export interface PoDetailData {
  items: PurchaseOrderItem[];
  receipts: PurchaseOrderReceipt[];
  /** 'error' when the trail or the names could not be read. */
  audit: AuditLog[] | null | 'error';
  names: Record<string, string>;
}

export const ITEM_COLS = 'id, po_id, item_name, sku, fabric_code, quantity, unit, rate, amount, received_qty, sort_order, created_at';

export async function loadPoDetail(po: PurchaseOrder): Promise<PoDetailData & { error: unknown; activityError: unknown }> {
  const [i, r, a] = await Promise.all([
    supabase.from('purchase_order_items').select(ITEM_COLS).eq('po_id', po.id).order('sort_order'),
    supabase.from('purchase_order_receipts').select('id, po_id, po_item_id, received_qty, receipt_date, remarks, received_by, created_at').eq('po_id', po.id).order('created_at', { ascending: false }),
    supabase.from('audit_log').select('id, action, module, record_id, details, user_id, user_email, created_at, changes').eq('module', 'purchase_order').eq('record_id', po.id).order('created_at', { ascending: false }).limit(100),
  ]);
  const error = i.error || r.error;
  if (error) return { items: [], receipts: [], audit: null, names: {}, error, activityError: null };
  const receipts = (r.data as PurchaseOrderReceipt[] | null) ?? [];
  const ids = [...new Set([po.created_by, po.approved_by, po.closed_by, po.cancelled_by, ...receipts.map(x => x.received_by)].filter((x): x is string => !!x))];
  const names: Record<string, string> = {};
  let nameError: unknown = null;
  if (ids.length) {
    const p = await supabase.from('profiles').select('id, full_name').in('id', ids);
    nameError = p.error;
    for (const u of (p.data as { id: string; full_name: string | null }[] | null) ?? []) names[u.id] = u.full_name?.trim() || 'User';
  }
  const activityError = a.error || nameError;
  return { items: (i.data as PurchaseOrderItem[] | null) ?? [], receipts, audit: activityError ? 'error' : ((a.data as AuditLog[] | null) ?? []), names, error: null, activityError };
}
