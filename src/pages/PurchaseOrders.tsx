// Purchase Orders — container. The list data (paginated fetch, search,
// filters, realtime) lives in usePoList; this page owns the summary above
// the list and the modal orchestration (form / detail / receive / print /
// pendency / contacts). Mirrors the Cash Challan module; PO ≈ challan,
// receipts ≈ payments.
import { useState, useCallback, useEffect, Suspense } from 'react';
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
import POTabs from '../components/purchaseorders/POTabs';
import { usePoList, PO_COLS as COLS, TAB_STATUSES } from '../components/purchaseorders/usePoList';
import type { EditingPO } from '../components/purchaseorders/POForm';
import { POForm, PODetail, POReceive, POReceiveChallan, POPrintOverlay, PendencyReport, Contacts, prefetchPoParts } from '../components/purchaseorders/poLazy';
import type { ChallanVendor } from '../components/purchaseorders/POChallanVendors';
import type { ChallanStart } from '../components/purchaseorders/POReceiveChallan';
import { whenIdle } from '../lib/idle';
import { ITEM_COLS } from '../components/purchaseorders/poDetailData';
import { usePoDetail } from '../components/purchaseorders/usePoDetail';
import type { PurchaseOrder, PurchaseOrderItem } from '../types/database';
import { useModalLock } from '../hooks/useModalLock';

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
    quick, setQuick, vendorFilter, setVendorFilter, dataVersion, bumpData, tab, setTab, otherCount,
  } = usePoList(active, addToast);
  const otherTab = tab === 'open' ? 'completed' : 'open';
  // The list first; the sheets' code once it is on screen and the phone is idle.
  useEffect(() => (loading ? undefined : whenIdle(prefetchPoParts)), [loading]);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<EditingPO | null>(null);
  const [duplicating, setDuplicating] = useState<EditingPO | null>(null);
  const { detail, setDetail, loadActivity, openDetail, refreshDetail } = usePoDetail(addToast, fetchPos);
  const [receiving, setReceiving] = useState<{ po: PurchaseOrder; items: PurchaseOrderItem[] } | null>(null);
  // One vendor challan on several orders: vendor null = picked inside; poId = the order it was opened from.
  const [challan, setChallan] = useState<{ vendor: ChallanVendor | null; poId?: string; init?: ChallanStart } | null>(null);
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
  const onSaved = async (r: { id: string; po_number: number; revision?: number; changed?: boolean }, isNew: boolean) => {
    closeForm();
    addToast(isNew ? `PO #${r.po_number} created` : r.changed === false ? `Nothing changed on PO #${r.po_number}` : r.revision ? `PO #${r.po_number} revised — now Rev ${r.revision}` : `PO #${r.po_number} updated`, 'success');
    fetchPos(); bumpData();
    // Edits originate from the detail view — reopen it so the user keeps their
    // place instead of being dropped back to the list.
    if (!isNew) {
      const { data, error } = await supabase.from('purchase_orders').select(COLS).eq('id', r.id).maybeSingle();
      if (error) { addToast(friendlyError(error), 'error'); return; }
      if (data) openDetail(data as PurchaseOrder);
    }
  };

  if (showContacts) return <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', fontSize: 12, color: T.tx3 }}>Loading…</div>}><Contacts canEdit={canCreate} onBack={() => setShowContacts(false)} addToast={addToast} /></Suspense>;

  return (
    <div className="page-pad" style={{ fontFamily: T.sans, color: T.tx, padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, color: T.tx3 }}>{totalCount} purchase order{totalCount === 1 ? '' : 's'} · fabric, job work &amp; materials</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowContacts(true)} style={S.btnGhost}>Contacts</button>
          {canCreate && <button onClick={() => { setEditing(null); setDuplicating(null); setShowForm(true); }} style={S.btnPrimary} className="desktop-only">+ New Purchase Order</button>}
        </div>
      </div>

      <POStats version={dataVersion} quick={quick} onQuick={q => { if (q) setTab('open'); setQuick(q); setPage(0); }}
        onVendor={v => { setTab('open'); setVendorFilter(v); setQuick('open'); setPage(0); }} addToast={addToast} />
      <POQuickChips quick={quick} vendor={vendorFilter} onClearQuick={() => { setQuick(''); setPage(0); }} onClearVendor={() => { setVendorFilter(''); setPage(0); }} />
      <POTabs tab={tab} onTab={setTab} counts={{ [tab]: loading ? null : totalCount, [otherTab]: otherCount } as Record<typeof tab, number | null>} />

      <POList
        pos={pos} loading={loading} totalCount={totalCount}
        search={search} onSearchChange={updateSearch}
        showFilters={showFilters} onToggleFilters={() => setShowFilters(f => !f)}
        statusFilter={statusFilter} onStatusFilterChange={setStatusFilter}
        typeFilter={typeFilter} onTypeFilterChange={setTypeFilter}
        creatorFilter={creatorFilter} onCreatorFilterChange={setCreatorFilter} users={users}
        dateFrom={dateFrom} onDateFromChange={setDateFrom} dateTo={dateTo} onDateToChange={setDateTo}
        pageSize={pageSize} onPageSizeChange={setPageSize}
        onClearFilters={clearFilters} tabStatuses={TAB_STATUSES[tab]}
        otherTab={{ label: otherTab === 'open' ? 'Open' : 'Completed', count: otherCount }}
        narrowed={!!(quick || vendorFilter || search || debouncedSearch || statusFilter || typeFilter || creatorFilter || dateFrom || dateTo)}
        onResetPage={() => setPage(0)}
        onOpenEmpty={() => { setEditing(null); setDuplicating(null); setShowForm(true); }} canCreate={canCreate}
        onOpenDetail={openDetail} onPrint={(po) => openPrint(po)}
        onPendency={() => setPendency({ vendor: null })}
        onReceiveChallan={canCreate ? () => setChallan({ vendor: null }) : undefined}
        page={page} totalPages={totalPages} onPageChange={setPage}
      />

      <Suspense fallback={null}>
      {showForm && <POForm editing={editing} duplicateFrom={duplicating} onClose={closeForm} onSaved={onSaved} addToast={addToast} />}

      {detail && <PODetail key={detail.po.id}
        po={detail.po} items={detail.items} receipts={detail.receipts} audit={detail.audit} names={detail.names} revisions={detail.revisions}
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
        onReceived={() => { setReceiving(null); refreshDetail(); }} addToast={addToast}
        onChallan={init => { setChallan({ vendor: { id: receiving.po.vendor_id, name: receiving.po.vendor_name }, poId: receiving.po.id, init }); setReceiving(null); }} />}

      {challan && <POReceiveChallan vendor={challan.vendor} poId={challan.poId} init={challan.init} onClose={() => setChallan(null)} addToast={addToast}
        onReceived={() => { setChallan(null); bumpData(); if (detail) refreshDetail(); else fetchPos(true); }} />}

      {printData && <POPrintOverlay po={printData.po} items={printData.items} canManage={canManage} onClose={() => setPrintData(null)} addToast={addToast}
        onSent={async () => { setPrintData(p => p && { ...p, po: { ...p.po, status: 'sent' } }); bumpData(); if (detail?.po.id === printData.po.id) await refreshDetail(); else fetchPos(true); }} />}
      </Suspense>

      {active !== false && !detail && !showForm && !receiving && !challan && !printData && !pendency && canCreate && createPortal(
        <button className="fab" aria-label="New purchase order" onClick={() => { setEditing(null); setDuplicating(null); setShowForm(true); }}>+</button>,
        document.body,
      )}
    </div>
  );
}
