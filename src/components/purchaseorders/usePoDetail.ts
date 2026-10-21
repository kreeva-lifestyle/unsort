// The open PO detail sheet's data: the order, its lines and receipts (read
// before the sheet opens), then — not blocking — the audit trail, the names
// behind every actor id and the revision history, patched in while it is
// still the same PO and only from the newest read. Split out of
// pages/PurchaseOrders.tsx so the page stays under the 200-line limit.
import { useState, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { friendlyError } from '../../lib/friendlyError';
import { loadPoLines, loadPoActivity, type PORevisionRow } from './poDetailData';
import { PO_COLS } from './usePoList';
import type { PurchaseOrder, PurchaseOrderItem, PurchaseOrderReceipt, AuditLog } from '../../types/database';

// audit: null while the trail loads, 'error' when it failed (the card retries).
// names: null until the profiles read lands, so nobody is called "unknown" meanwhile.
// revisions: null until the trail lands (they come with it).
export type PODetailState = { po: PurchaseOrder; items: PurchaseOrderItem[]; receipts: PurchaseOrderReceipt[]; audit: AuditLog[] | null | 'error'; names: Record<string, string> | null; revisions: PORevisionRow[] | null };

export function usePoDetail(addToast: (m: string, t?: string) => void, fetchPos: (silent?: boolean) => void) {
  const [detail, setDetail] = useState<PODetailState | null>(null);

  const actSeq = useRef(0);
  const loadActivity = useCallback(async (po: PurchaseOrder, receipts: PurchaseOrderReceipt[]) => {
    const seq = ++actSeq.current;
    // Rows already on screen stay while the fresh read is in flight (the
    // rail and the card would otherwise flicker); only a missing or failed
    // trail shows "Loading…".
    setDetail(d => d && d.po.id === po.id && !Array.isArray(d.audit) ? { ...d, audit: null } : d);
    const a = await loadPoActivity(po, receipts);
    if (seq !== actSeq.current) return;
    const error = a.auditError || a.namesError;
    if (error) addToast(friendlyError(error), 'error');
    setDetail(d => d && d.po.id === po.id
      ? { ...d, audit: a.auditError ? 'error' : a.audit, names: a.namesError ? d.names : a.names, revisions: a.auditError ? d.revisions : a.revisions }
      : d);
  }, [addToast]);

  // Load lines + receipts for a PO and open the detail panel at once.
  const openDetail = useCallback(async (poRow: PurchaseOrder) => {
    const d = await loadPoLines(poRow);
    // Never open a detail (or later print) on silently-missing data — a
    // transient failure here would render a PO with zero line items.
    if (d.error) { addToast(friendlyError(d.error), 'error'); return; }
    // A refresh of the same PO keeps the names, the trail and the history it
    // already has, so the header does not blink and the rail does not reposition.
    setDetail(prev => prev && prev.po.id === poRow.id
      ? { ...prev, po: poRow, items: d.items, receipts: d.receipts }
      : { po: poRow, items: d.items, receipts: d.receipts, audit: null, names: null, revisions: null });
    loadActivity(poRow, d.receipts);
  }, [addToast, loadActivity]);

  // Re-fetch the fresh PO row (not the stale detail.po) so status transitions —
  // Approve / Mark Sent / Cancel / Receive / Revise — reflect immediately in the buttons.
  const refreshDetail = async () => {
    if (!detail) return;
    const { data, error } = await supabase.from('purchase_orders').select(PO_COLS).eq('id', detail.po.id).maybeSingle();
    // A failed re-read must not quietly re-render the old status and buttons.
    if (error) { addToast(friendlyError(error), 'error'); fetchPos(true); return; }
    await openDetail((data as PurchaseOrder) ?? detail.po);
    fetchPos(true);
  };

  return { detail, setDetail, loadActivity, openDetail, refreshDetail };
}
