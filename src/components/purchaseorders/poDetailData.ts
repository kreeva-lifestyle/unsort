// What the PO detail shows beyond the header row, in two steps so the sheet
// opens as soon as it can: first the lines and the receipts (blocking — a
// detail with missing lines would print a wrong document), then, in one
// round trip, the audit trail and the names behind every actor id (who
// raised, approved, closed or cancelled it; who received each delivery).
// The second step is not blocking: the card offers a retry. The revision
// history (Rev 2, Rev 3 … with what changed) rides along with the trail.
import { supabase } from '../../lib/supabase';
import type { PurchaseOrder, PurchaseOrderItem, PurchaseOrderReceipt, PurchaseOrderRevision, AuditLog } from '../../types/database';

export const ITEM_COLS = 'id, po_id, item_name, sku, fabric_code, quantity, unit, rate, amount, received_qty, sort_order, created_at, cancelled_qty, cancelled_at, cancelled_by, cancel_reason';
/** A revision with the name of whoever made it (embedded, one round trip). */
export type PORevisionRow = PurchaseOrderRevision & { creator?: { full_name: string | null } | null };
const REV_COLS = 'id, po_id, revision, kind, changes, reason, created_by, created_at, notified_at, notified_by, notified_how, creator:profiles!purchase_order_revisions_created_by_fkey(full_name)';

export async function loadPoLines(po: PurchaseOrder): Promise<{ items: PurchaseOrderItem[]; receipts: PurchaseOrderReceipt[]; error: unknown }> {
  const [i, r] = await Promise.all([
    supabase.from('purchase_order_items').select(ITEM_COLS).eq('po_id', po.id).order('sort_order'),
    supabase.from('purchase_order_receipts').select('id, po_id, po_item_id, received_qty, receipt_date, remarks, received_by, created_at').eq('po_id', po.id).order('created_at', { ascending: false }),
  ]);
  const error = i.error || r.error;
  if (error) return { items: [], receipts: [], error };
  return { items: (i.data as PurchaseOrderItem[] | null) ?? [], receipts: (r.data as PurchaseOrderReceipt[] | null) ?? [], error: null };
}

/** Who did what (audit_log, newest first) and the names behind the header's
 *  actor columns and the receipts' `received_by` — one parallel read, each
 *  half reporting its own failure so a good half is never thrown away. */
export async function loadPoActivity(po: PurchaseOrder, receipts: PurchaseOrderReceipt[]): Promise<{ audit: AuditLog[]; names: Record<string, string>; revisions: PORevisionRow[]; auditError: unknown; namesError: unknown }> {
  const ids = [...new Set([po.created_by, po.approved_by, po.closed_by, po.cancelled_by, po.revised_by, ...receipts.map(x => x.received_by)].filter((x): x is string => !!x))];
  const [a, p, r] = await Promise.all([
    supabase.from('audit_log').select('id, action, module, record_id, details, user_id, user_email, created_at, changes').eq('module', 'purchase_order').eq('record_id', po.id).order('created_at', { ascending: false }).limit(100),
    ids.length ? supabase.from('profiles').select('id, full_name').in('id', ids) : Promise.resolve({ data: [] as { id: string; full_name: string | null }[], error: null }),
    // Only an order revised after approval has any (revision 1 is the order as raised).
    po.revision > 1 ? supabase.from('purchase_order_revisions').select(REV_COLS).eq('po_id', po.id).order('revision', { ascending: false }) : Promise.resolve({ data: [] as PORevisionRow[], error: null }),
  ]);
  const names: Record<string, string> = {};
  // A profile with no name is still a person ("User"); an id with no profile at all is left out.
  for (const u of (p.data as { id: string; full_name: string | null }[] | null) ?? []) names[u.id] = u.full_name?.trim() || 'User';
  // The history is part of the trail: a failed read shows as the trail's retry.
  return { audit: (a.data as AuditLog[] | null) ?? [], names, revisions: (r.data as unknown as PORevisionRow[] | null) ?? [], auditError: a.error || r.error, namesError: p.error };
}
