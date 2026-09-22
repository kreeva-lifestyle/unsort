// Purchase Orders — container. The list data (paginated fetch, search,
// filters, realtime) lives in usePoList; this page owns the modal
// orchestration (form / detail / receive / print / pendency / contacts).
// Mirrors the Cash Challan module; PO ≈ challan, receipts ≈ payments.
import { useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { printOrQueue } from '../lib/printQueue';
import { useAuth } from '../hooks/useAuth';
import { useNotifications } from '../hooks/useNotifications';
import { T, S, PO_STATUS_COLORS } from '../lib/theme';
import { useBackClose } from '../hooks/useBackClose';
import { useCrumb } from '../hooks/useBreadcrumb';
import { friendlyError } from '../lib/friendlyError';
import POList from '../components/purchaseorders/POList';
import { usePoList, PO_COLS as COLS } from '../components/purchaseorders/usePoList';
import POForm, { type EditingPO } from '../components/purchaseorders/POForm';
import PODetail from '../components/purchaseorders/PODetail';
import POReceive from '../components/purchaseorders/POReceive';
import { buildPoPdf } from '../components/purchaseorders/poPdf';
import { sharePoImage } from '../components/purchaseorders/poImage';
import PendencyReport from '../components/purchaseorders/PendencyReport';
import Contacts from '../components/contacts/Contacts';
import type { PurchaseOrder, PurchaseOrderItem, PurchaseOrderReceipt, AuditLog } from '../types/database';
import { useModalLock } from '../hooks/useModalLock';
import Toggle from '../components/ui/Toggle';

type Detail = { po: PurchaseOrder; items: PurchaseOrderItem[]; receipts: PurchaseOrderReceipt[]; audit: AuditLog[] | null };

export default function PurchaseOrders({ active }: { active?: boolean } = {}) {
  const { profile } = useAuth();
  const { addToast } = useNotifications();
  const role = profile?.role;
  const canManage = role === 'admin' || role === 'manager';
  const canCreate = role === 'admin' || role === 'manager' || role === 'operator';

  const {
    pos, loading, page, setPage, pageSize, setPageSize, totalCount, totalPages,
    search, updateSearch, statusFilter, setStatusFilter, typeFilter, setTypeFilter, creatorFilter, setCreatorFilter,
    dateFrom, setDateFrom, dateTo, setDateTo, showFilters, setShowFilters, users, fetchPos, clearFilters,
  } = usePoList(active, addToast);

  const [sharing, setSharing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<EditingPO | null>(null);
  const [duplicating, setDuplicating] = useState<EditingPO | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [receiving, setReceiving] = useState<{ po: PurchaseOrder; items: PurchaseOrderItem[] } | null>(null);
  // rates: OFF by default — the document that reaches a vendor must not
  // carry rates or totals (owner's rule); the switch in the overlay turns
  // them on for an internal copy.
  const [printData, setPrintData] = useState<{ po: PurchaseOrder; items: PurchaseOrderItem[]; html: string; rates: boolean } | null>(null);
  const printFrameRef = useRef<HTMLIFrameElement | null>(null);
  // Vendor pendency report (owner's ask): open orders for one vendor with
  // pending-since headlined, shareable as an image. null = closed.
  const [pendency, setPendency] = useState<{ vendor: string | null } | null>(null);

  useModalLock(!!printData);
  useBackClose(!!detail, () => setDetail(null));
  const [showContacts, setShowContacts] = useState(false); // shared Contacts view (components/contacts)
  useBackClose(showContacts, () => setShowContacts(false));
  useCrumb(detail ? `PO #${detail.po.po_number}` : null); // header: "Purchase Orders / PO #12"
  useBackClose(!!printData, () => setPrintData(null));

  // Load full items + receipts + audit for a PO, then open the detail panel.
  const openDetail = useCallback(async (poRow: PurchaseOrder) => {
    const [itemsRes, receiptsRes, auditRes] = await Promise.all([
      supabase.from('purchase_order_items').select('id, po_id, item_name, sku, fabric_code, quantity, unit, rate, amount, received_qty, sort_order, created_at').eq('po_id', poRow.id).order('sort_order'),
      supabase.from('purchase_order_receipts').select('id, po_id, po_item_id, received_qty, receipt_date, remarks, received_by, created_at').eq('po_id', poRow.id).order('created_at', { ascending: false }),
      supabase.from('audit_log').select('id, action, module, record_id, details, user_id, user_email, created_at, changes').eq('module', 'purchase_order').eq('record_id', poRow.id).order('created_at', { ascending: false }).limit(30),
    ]);
    // Never open a detail (or later print) on silently-missing data — a
    // transient failure here would render a PO with zero line items.
    if (itemsRes.error || receiptsRes.error) { addToast(friendlyError(itemsRes.error || receiptsRes.error), 'error'); return; }
    setDetail({ po: poRow, items: (itemsRes.data as PurchaseOrderItem[] | null) || [], receipts: (receiptsRes.data as PurchaseOrderReceipt[] | null) || [], audit: (auditRes.data as AuditLog[] | null) || [] });
  }, [addToast]);

  const openPrint = useCallback(async (poRow: PurchaseOrder, preItems?: PurchaseOrderItem[]) => {
    let items = preItems;
    if (!items) {
      const { data, error } = await supabase.from('purchase_order_items').select('id, po_id, item_name, sku, fabric_code, quantity, unit, rate, amount, received_qty, sort_order, created_at').eq('po_id', poRow.id).order('sort_order');
      if (error) { addToast(friendlyError(error), 'error'); return; }
      items = (data as PurchaseOrderItem[] | null) || [];
    }
    setPrintData({ po: poRow, items, html: buildPoPdf(poRow, items, { rates: false }), rates: false });
  }, [addToast]);

  const closeForm = () => { setShowForm(false); setEditing(null); setDuplicating(null); };
  const onSaved = async (r: { id: string; po_number: number }, isNew: boolean) => {
    closeForm();
    addToast(isNew ? `PO #${r.po_number} created` : `PO #${r.po_number} updated`, 'success');
    fetchPos();
    // Edits originate from the detail view — reopen it so the user keeps their
    // place instead of being dropped back to the list.
    if (!isNew) {
      const { data, error } = await supabase.from('purchase_orders').select(COLS).eq('id', r.id).maybeSingle();
      if (error) { addToast(friendlyError(error), 'error'); return; }
      if (data) openDetail(data as PurchaseOrder);
    }
  };

  // Re-fetch the fresh PO row (not the stale detail.po) so status transitions —
  // Approve / Mark Sent / Cancel / Receive — reflect immediately in the buttons.
  const refreshDetail = async () => {
    if (!detail) return;
    const { data, error } = await supabase.from('purchase_orders').select(COLS).eq('id', detail.po.id).maybeSingle();
    // A failed re-read must not quietly re-render the old status and buttons.
    if (error) { addToast(friendlyError(error), 'error'); fetchPos(true); return; }
    await openDetail((data as PurchaseOrder) ?? detail.po);
    fetchPos(true);
  };

  if (showContacts) return <Contacts canEdit={canCreate} onBack={() => setShowContacts(false)} addToast={addToast} />;

  return (
    <div className="page-pad" style={{ fontFamily: T.sans, color: T.tx, padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, color: T.tx3 }}>{totalCount} purchase order{totalCount === 1 ? '' : 's'} · fabric, job work &amp; materials</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowContacts(true)} style={S.btnGhost}>Contacts</button>
          {canCreate && <button onClick={() => { setEditing(null); setDuplicating(null); setShowForm(true); }} style={S.btnPrimary} className="desktop-only">+ New Purchase Order</button>}
        </div>
      </div>

      <POList
        pos={pos} loading={loading} totalCount={totalCount} statusColors={PO_STATUS_COLORS}
        search={search} onSearchChange={updateSearch}
        showFilters={showFilters} onToggleFilters={() => setShowFilters(f => !f)}
        statusFilter={statusFilter} onStatusFilterChange={setStatusFilter}
        typeFilter={typeFilter} onTypeFilterChange={setTypeFilter}
        creatorFilter={creatorFilter} onCreatorFilterChange={setCreatorFilter} users={users}
        dateFrom={dateFrom} onDateFromChange={setDateFrom} dateTo={dateTo} onDateToChange={setDateTo}
        pageSize={pageSize} onPageSizeChange={setPageSize}
        onClearFilters={clearFilters}
        onResetPage={() => setPage(0)}
        onOpenEmpty={() => { setEditing(null); setDuplicating(null); setShowForm(true); }} canCreate={canCreate}
        onOpenDetail={openDetail} onPrint={(po) => openPrint(po)}
        onPendency={() => setPendency({ vendor: null })}
        page={page} totalPages={totalPages} onPageChange={setPage}
      />

      {showForm && <POForm editing={editing} duplicateFrom={duplicating} onClose={closeForm} onSaved={onSaved} addToast={addToast} />}

      {detail && <PODetail
        po={detail.po} items={detail.items} receipts={detail.receipts} audit={detail.audit}
        statusColors={PO_STATUS_COLORS} canManage={canManage}
        onClose={() => setDetail(null)} onChanged={refreshDetail}
        onEdit={() => { setEditing({ ...detail.po, items: detail.items }); setDuplicating(null); setDetail(null); setShowForm(true); }}
        onDuplicate={() => { setDuplicating({ ...detail.po, items: detail.items }); setEditing(null); setDetail(null); setShowForm(true); }}
        onReceive={() => { setReceiving({ po: detail.po, items: detail.items }); }}
        onPrint={() => openPrint(detail.po, detail.items)}
        onPendency={() => setPendency({ vendor: detail.po.vendor_name })}
        addToast={addToast}
      />}

      {pendency && <PendencyReport vendor={pendency.vendor} onClose={() => setPendency(null)} addToast={addToast} />}

      {receiving && <POReceive po={receiving.po} items={receiving.items} onClose={() => setReceiving(null)}
        onReceived={() => { setReceiving(null); refreshDetail(); }} addToast={addToast} />}

      {printData && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: T.bg, display: 'flex', flexDirection: 'column', overscrollBehavior: 'contain' }}>
          <div style={{ padding: '12px 16px', paddingTop: 'max(12px, env(safe-area-inset-top))', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,.08)', background: 'rgba(8,11,20,.95)', backdropFilter: 'blur(20px)' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.tx, fontFamily: T.sora }}>Purchase Order</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: printData.rates ? T.yl : T.tx3, marginLeft: 'auto', marginRight: 12 }}>
              {printData.rates ? 'Rates shown' : 'Rates hidden'}
              <Toggle size="sm" on={printData.rates} label="Show rates" onToggle={() => setPrintData(d => d && ({ ...d, rates: !d.rates, html: buildPoPdf(d.po, d.items, { rates: !d.rates }) }))} />
            </label>
            <button onClick={() => setPrintData(null)} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,255,255,.08)', background: 'rgba(255,255,255,.04)', color: T.tx2, cursor: 'pointer', fontSize: 16 }} aria-label="Close">&times;</button>
          </div>
          <iframe ref={printFrameRef} srcDoc={printData.html} style={{ flex: 1, border: 'none', width: '100%', background: '#fff' }} title="Purchase Order preview" />
          <div style={{ padding: '10px 16px', paddingBottom: 'max(10px, env(safe-area-inset-bottom))', background: 'rgba(8,11,20,.95)', borderTop: '1px solid rgba(255,255,255,.08)', display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button onClick={() => setPrintData(null)} style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid rgba(255,255,255,.08)', background: 'rgba(255,255,255,.04)', color: T.tx2, fontSize: 13, cursor: 'pointer', fontWeight: 500, flex: 1, maxWidth: 130 }}>Close</button>
            <button onClick={() => printOrQueue('document', printData.html, 'A4', 'Purchase Order', undefined, addToast, printFrameRef.current)} style={{ padding: '10px 18px', borderRadius: 8, border: `1px solid ${T.ac3}`, background: T.ac3, color: T.ac2, fontSize: 13, fontWeight: 600, cursor: 'pointer', flex: 1, maxWidth: 130 }}>Print</button>
            <button onClick={() => { if (sharing) return; setSharing(true); sharePoImage(printData.po, printData.items, addToast, { rates: printData.rates }).finally(() => setSharing(false)); }} style={{ padding: '10px 18px', borderRadius: 8, border: 'none', ...S.btnPrimary, fontSize: 13, flex: 1, maxWidth: 130, opacity: sharing ? 0.5 : 1, pointerEvents: sharing ? 'none' as const : 'auto' as const }}>{sharing ? 'Sharing…' : 'Share'}</button>
          </div>
        </div>, document.body)}

      {active !== false && !detail && !showForm && !receiving && !printData && !pendency && canCreate && createPortal(
        <button className="fab" aria-label="New purchase order" onClick={() => { setEditing(null); setDuplicating(null); setShowForm(true); }}>+</button>,
        document.body,
      )}
    </div>
  );
}
