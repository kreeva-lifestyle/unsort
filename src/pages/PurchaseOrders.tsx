// Purchase Orders — container. The list data (paginated fetch, search,
// filters, realtime) lives in usePoList; this page owns the summary above
// the list and the modal orchestration (form / detail / receive / print /
// pendency / contacts). Mirrors the Cash Challan module; PO ≈ challan,
// receipts ≈ payments.
import { useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useNotifications } from '../hooks/useNotifications';
import { T, S, PO_STATUS_COLORS } from '../lib/theme';
import { useBackClose } from '../hooks/useBackClose';
import { useCrumb } from '../hooks/useBreadcrumb';
import { friendlyError } from '../lib/friendlyError';
import POList from '../components/purchaseorders/POList';
import POStats from '../components/purchaseorders/POStats';
import POQuickChips from '../components/purchaseorders/POQuickChips';
import { usePoList, PO_COLS as COLS } from '../components/purchaseorders/usePoList';
import POForm, { type EditingPO } from '../components/purchaseorders/POForm';
import PODetail from '../components/purchaseorders/PODetail';
import POReceive from '../components/purchaseorders/POReceive';
import POPrintOverlay from '../components/purchaseorders/POPrintOverlay';
import PendencyReport from '../components/purchaseorders/PendencyReport';
import Contacts from '../components/contacts/Contacts';
import { loadPoLines, loadPoActivity, ITEM_COLS } from '../components/purchaseorders/poDetailData';
import type { PurchaseOrder, PurchaseOrderItem, PurchaseOrderReceipt, AuditLog } from '../types/database';
import { useModalLock } from '../hooks/useModalLock';

// audit: null while the trail loads, 'error' when it failed (the card retries).
// names: null until the profiles read lands, so nobody is called "unknown" meanwhile.
type Detail = { po: PurchaseOrder; items: PurchaseOrderItem[]; receipts: PurchaseOrderReceipt[]; audit: AuditLog[] | null | 'error'; names: Record<string, string> | null };

export default function PurchaseOrders({ active }: { active?: boolean } = {}) {
  const { profile } = useAuth();
  const { addToast } = useNotifications();
  const role = profile?.role;
  const canManage = role === 'admin' || role === 'manager';
  const canCreate = role === 'admin' || role === 'manager' || role === 'operator';

  const {
    pos, loading, page, setPage, pageSize, setPageSize, totalCount, totalPages,
    search, debouncedSearch, updateSearch, statusFilter, setStatusFilter, typeFilter, setTypeFilter, creatorFilter, setCreatorFilter,
    dateFrom, setDateFrom, dateTo, setDateTo, showFilters, setShowFilters, users, fetchPos, clearFilters,
    quick, setQuick, vendorFilter, setVendorFilter, dataVersion, bumpData,
  } = usePoList(active, addToast);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<EditingPO | null>(null);
  const [duplicating, setDuplicating] = useState<EditingPO | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [receiving, setReceiving] = useState<{ po: PurchaseOrder; items: PurchaseOrderItem[] } | null>(null);
  const [printData, setPrintData] = useState<{ po: PurchaseOrder; items: PurchaseOrderItem[] } | null>(null);
  // Vendor pendency report (owner's ask): open orders for one vendor with
  // pending-since headlined, shareable as an image. null = closed.
  const [pendency, setPendency] = useState<{ vendor: string | null } | null>(null);

  useModalLock(!!printData);
  useBackClose(!!detail, () => setDetail(null));
  const [showContacts, setShowContacts] = useState(false); // shared Contacts view (components/contacts)
  useBackClose(showContacts, () => setShowContacts(false));
  useCrumb(detail ? `PO #${detail.po.po_number}` : null); // header: "Purchase Orders / PO #12"
  useBackClose(!!printData, () => setPrintData(null));

  // Who did what, after the sheet is up: the trail and the names behind the
  // actor ids, patched into the open detail — only while it is still the
  // same PO, and only from the newest read (an older one landing late must
  // not hide the action just taken). Not blocking — the card offers a retry;
  // a good half (names) is kept even when the other half (trail) failed.
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
    setDetail(d => d && d.po.id === po.id ? { ...d, audit: error ? 'error' : a.audit, names: a.namesError ? d.names : a.names } : d);
  }, [addToast]);
  // Load lines + receipts for a PO and open the detail panel at once.
  const openDetail = useCallback(async (poRow: PurchaseOrder) => {
    const d = await loadPoLines(poRow);
    // Never open a detail (or later print) on silently-missing data — a
    // transient failure here would render a PO with zero line items.
    if (d.error) { addToast(friendlyError(d.error), 'error'); return; }
    // A refresh of the same PO keeps the names and the trail it already has,
    // so the header does not blink and the rail does not reposition.
    setDetail(prev => prev && prev.po.id === poRow.id
      ? { ...prev, po: poRow, items: d.items, receipts: d.receipts }
      : { po: poRow, items: d.items, receipts: d.receipts, audit: null, names: null });
    loadActivity(poRow, d.receipts);
  }, [addToast, loadActivity]);

  const openPrint = useCallback(async (poRow: PurchaseOrder, preItems?: PurchaseOrderItem[]) => {
    let items = preItems;
    if (!items) {
      const { data, error } = await supabase.from('purchase_order_items').select(ITEM_COLS).eq('po_id', poRow.id).order('sort_order');
      if (error) { addToast(friendlyError(error), 'error'); return; }
      items = (data as PurchaseOrderItem[] | null) || [];
    }
    setPrintData({ po: poRow, items });
  }, [addToast]);

  const closeForm = () => { setShowForm(false); setEditing(null); setDuplicating(null); };
  const onSaved = async (r: { id: string; po_number: number }, isNew: boolean) => {
    closeForm();
    addToast(isNew ? `PO #${r.po_number} created` : `PO #${r.po_number} updated`, 'success');
    fetchPos(); bumpData();
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

      <POStats version={dataVersion} quick={quick} onQuick={q => { setQuick(q); setPage(0); }}
        onVendor={v => { setVendorFilter(v); setQuick('open'); setPage(0); }} addToast={addToast} />
      <POQuickChips quick={quick} vendor={vendorFilter} onClearQuick={() => { setQuick(''); setPage(0); }} onClearVendor={() => { setVendorFilter(''); setPage(0); }} />

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
        narrowed={!!(quick || vendorFilter || search || debouncedSearch || statusFilter || typeFilter || creatorFilter || dateFrom || dateTo)}
        onResetPage={() => setPage(0)}
        onOpenEmpty={() => { setEditing(null); setDuplicating(null); setShowForm(true); }} canCreate={canCreate}
        onOpenDetail={openDetail} onPrint={(po) => openPrint(po)}
        onPendency={() => setPendency({ vendor: null })}
        page={page} totalPages={totalPages} onPageChange={setPage}
      />

      {showForm && <POForm editing={editing} duplicateFrom={duplicating} onClose={closeForm} onSaved={onSaved} addToast={addToast} />}

      {detail && <PODetail
        po={detail.po} items={detail.items} receipts={detail.receipts} audit={detail.audit} names={detail.names}
        statusColors={PO_STATUS_COLORS} canManage={canManage}
        onClose={() => setDetail(null)} onChanged={refreshDetail} onRetryActivity={() => loadActivity(detail.po, detail.receipts)}
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

      {printData && <POPrintOverlay po={printData.po} items={printData.items} onClose={() => setPrintData(null)} addToast={addToast} />}

      {active !== false && !detail && !showForm && !receiving && !printData && !pendency && canCreate && createPortal(
        <button className="fab" aria-label="New purchase order" onClick={() => { setEditing(null); setDuplicating(null); setShowForm(true); }}>+</button>,
        document.body,
      )}
    </div>
  );
}
