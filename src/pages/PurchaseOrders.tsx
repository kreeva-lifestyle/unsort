// Purchase Orders — container. Owns paginated fetch (head-count + explicit
// columns + items join for receive-progress), debounced search, filters,
// filtered realtime, and modal orchestration (form / detail / receive /
// print). Mirrors the Cash Challan module; PO ≈ challan, receipts ≈ payments.
import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { printOrQueue } from '../lib/printQueue';
import { useAuth } from '../hooks/useAuth';
import { useNotifications } from '../hooks/useNotifications';
import { T, S, PO_STATUS_COLORS } from '../lib/theme';
import { friendlyError } from '../lib/friendlyError';
import POList, { type PORow } from '../components/purchaseorders/POList';
import POForm, { type EditingPO } from '../components/purchaseorders/POForm';
import PODetail from '../components/purchaseorders/PODetail';
import POReceive from '../components/purchaseorders/POReceive';
import { buildPoPdf } from '../components/purchaseorders/poPdf';
import { sharePoImage } from '../components/purchaseorders/poImage';
import type { PurchaseOrder, PurchaseOrderItem, PurchaseOrderReceipt, AuditLog } from '../types/database';

const COLS = 'id, po_number, vendor_id, vendor_name, vendor_phone, po_type, status, po_date, expected_date, payment_terms, notes, subtotal, discount_type, discount_value, discount_amount, tax_percent, tax_amount, other_charges, round_off, grand_total, approved_by, approved_at, cancelled_by, cancelled_at, created_by, modified_by, created_at, updated_at';

type Detail = { po: PurchaseOrder; items: PurchaseOrderItem[]; receipts: PurchaseOrderReceipt[]; audit: AuditLog[] | null };

export default function PurchaseOrders({ active }: { active?: boolean } = {}) {
  const { profile } = useAuth();
  const { addToast } = useNotifications();
  const role = profile?.role;
  const canManage = role === 'admin' || role === 'manager';
  const canCreate = role === 'admin' || role === 'manager' || role === 'operator';

  const [pos, setPos] = useState<PORow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  const updateSearch = (v: string) => { setSearch(v); clearTimeout(searchTimer.current); searchTimer.current = setTimeout(() => setDebouncedSearch(v), 400); };
  useEffect(() => () => clearTimeout(searchTimer.current), []);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [creatorFilter, setCreatorFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [users, setUsers] = useState<{ id: string; full_name: string }[]>([]);

  // Active users for the "Created By" filter dropdown (pattern from CashBook).
  useEffect(() => {
    supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name')
      .then(({ data }) => setUsers((data as { id: string; full_name: string }[] | null) || []));
  }, []);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<EditingPO | null>(null);
  const [duplicating, setDuplicating] = useState<EditingPO | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [receiving, setReceiving] = useState<{ po: PurchaseOrder; items: PurchaseOrderItem[] } | null>(null);
  const [printData, setPrintData] = useState<{ po: PurchaseOrder; items: PurchaseOrderItem[]; html: string } | null>(null);

  const totalPages = Math.ceil(totalCount / pageSize);

  // Monotonic fetch id — a slower stale response (e.g. the SKU-search path has
  // an extra awaited RPC) must never overwrite the result of a newer fetch.
  const fetchSeq = useRef(0);
  const fetchPos = useCallback(async (silent = false) => {
    const seq = ++fetchSeq.current;
    if (!silent) setLoading(true);
    let q = supabase.from('purchase_orders').select(`${COLS}, purchase_order_items(quantity, received_qty)`, { count: 'estimated' });
    if (debouncedSearch) {
      const s = debouncedSearch.replace(/[%_,().]/g, '').trim();
      if (s) {
        // Vendor name always matches; a pure number also matches the PO #; and
        // ANY term (numeric SKUs like "15003" included) also matches line-item
        // SKUs via search_po_ids.
        const ors = [`vendor_name.ilike.%${s}%`];
        if (/^\d+$/.test(s)) ors.push(`po_number.eq.${parseInt(s)}`);
        const { data: idRows } = await supabase.rpc('search_po_ids', { q: s });
        const ids = (idRows as string[] | null) || [];
        if (ids.length > 0) ors.push(`id.in.(${ids.join(',')})`);
        q = q.or(ors.join(','));
      }
    }
    if (statusFilter) q = q.eq('status', statusFilter);
    if (typeFilter) q = q.eq('po_type', typeFilter);
    if (creatorFilter) q = q.eq('created_by', creatorFilter);
    if (dateFrom) q = q.gte('po_date', dateFrom);
    if (dateTo) q = q.lte('po_date', dateTo);
    q = q.order('po_number', { ascending: false }).range(page * pageSize, (page + 1) * pageSize - 1);
    const { data, count, error } = await q;
    if (seq !== fetchSeq.current) return; // a newer fetch superseded this one
    if (error) { addToast(friendlyError(error), 'error'); if (!silent) setLoading(false); return; }
    setPos((data as PORow[] | null) || []);
    setTotalCount(count || 0);
    if (!silent) setLoading(false);
  }, [debouncedSearch, statusFilter, typeFilter, creatorFilter, dateFrom, dateTo, page, pageSize, addToast]);

  useEffect(() => { fetchPos(); }, [fetchPos]);

  // Filtered realtime — any PO / item / receipt change refetches the list.
  useEffect(() => {
    const imm = () => fetchPos(true);
    const ch = supabase.channel('purchase_orders_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_orders' }, imm)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_order_items' }, imm)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_order_receipts' }, imm)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchPos]);

  useEffect(() => { document.body.classList.toggle('modal-open', !!printData); return () => { document.body.classList.remove('modal-open'); }; }, [printData]);

  // Load full items + receipts + audit for a PO, then open the detail panel.
  const openDetail = useCallback(async (poRow: PurchaseOrder) => {
    const [itemsRes, receiptsRes, auditRes] = await Promise.all([
      supabase.from('purchase_order_items').select('id, po_id, item_name, sku, quantity, unit, rate, amount, received_qty, sort_order, created_at').eq('po_id', poRow.id).order('sort_order'),
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
      const { data, error } = await supabase.from('purchase_order_items').select('id, po_id, item_name, sku, quantity, unit, rate, amount, received_qty, sort_order, created_at').eq('po_id', poRow.id).order('sort_order');
      if (error) { addToast(friendlyError(error), 'error'); return; }
      items = (data as PurchaseOrderItem[] | null) || [];
    }
    setPrintData({ po: poRow, items, html: buildPoPdf(poRow, items) });
  }, [addToast]);

  const closeForm = () => { setShowForm(false); setEditing(null); setDuplicating(null); };
  const onSaved = async (r: { id: string; po_number: number }, isNew: boolean) => {
    closeForm();
    addToast(isNew ? `PO #${r.po_number} created` : `PO #${r.po_number} updated`, 'success');
    fetchPos();
    // Edits originate from the detail view — reopen it so the user keeps their
    // place instead of being dropped back to the list.
    if (!isNew) {
      const { data } = await supabase.from('purchase_orders').select(COLS).eq('id', r.id).maybeSingle();
      if (data) openDetail(data as PurchaseOrder);
    }
  };

  // Re-fetch the fresh PO row (not the stale detail.po) so status transitions —
  // Approve / Mark Sent / Cancel / Receive — reflect immediately in the buttons.
  const refreshDetail = async () => {
    if (!detail) return;
    const { data } = await supabase.from('purchase_orders').select(COLS).eq('id', detail.po.id).maybeSingle();
    await openDetail((data as PurchaseOrder) ?? detail.po);
    fetchPos(true);
  };

  return (
    <div className="page-pad" style={{ fontFamily: T.sans, color: T.tx, padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, color: T.tx3 }}>{totalCount} purchase order{totalCount === 1 ? '' : 's'} · fabric, job work &amp; materials</div>
        {canCreate && <button onClick={() => { setEditing(null); setDuplicating(null); setShowForm(true); }} style={S.btnPrimary} className="desktop-only">+ New Purchase Order</button>}
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
        onClearFilters={() => { setStatusFilter(''); setTypeFilter(''); setCreatorFilter(''); setDateFrom(''); setDateTo(''); setPage(0); }}
        onResetPage={() => setPage(0)}
        onOpenEmpty={() => { setEditing(null); setDuplicating(null); setShowForm(true); }} canCreate={canCreate}
        onOpenDetail={openDetail} onPrint={(po) => openPrint(po)}
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
        addToast={addToast}
      />}

      {receiving && <POReceive po={receiving.po} items={receiving.items} onClose={() => setReceiving(null)}
        onReceived={() => { setReceiving(null); refreshDetail(); }} addToast={addToast} />}

      {printData && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: T.bg, display: 'flex', flexDirection: 'column', touchAction: 'none' }}>
          <div style={{ padding: '12px 16px', paddingTop: 'max(12px, env(safe-area-inset-top))', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,.08)', background: 'rgba(8,11,20,.95)', backdropFilter: 'blur(20px)' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.tx, fontFamily: T.sora }}>Purchase Order</span>
            <button onClick={() => setPrintData(null)} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,255,255,.08)', background: 'rgba(255,255,255,.04)', color: T.tx2, cursor: 'pointer', fontSize: 16 }} aria-label="Close">&times;</button>
          </div>
          <iframe srcDoc={printData.html} style={{ flex: 1, border: 'none', width: '100%', background: '#fff' }} title="Purchase Order preview" />
          <div style={{ padding: '10px 16px', paddingBottom: 'max(10px, env(safe-area-inset-bottom))', background: 'rgba(8,11,20,.95)', borderTop: '1px solid rgba(255,255,255,.08)', display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button onClick={() => setPrintData(null)} style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid rgba(255,255,255,.08)', background: 'rgba(255,255,255,.04)', color: T.tx2, fontSize: 13, cursor: 'pointer', fontWeight: 500, flex: 1, maxWidth: 130 }}>Close</button>
            <button onClick={() => printOrQueue('document', printData.html, 'A4', 'Purchase Order', undefined, addToast)} style={{ padding: '10px 18px', borderRadius: 8, border: `1px solid ${T.ac3}`, background: T.ac3, color: T.ac2, fontSize: 13, fontWeight: 600, cursor: 'pointer', flex: 1, maxWidth: 130 }}>Print</button>
            <button onClick={() => sharePoImage(printData.po, printData.items, addToast)} style={{ padding: '10px 18px', borderRadius: 8, border: 'none', ...S.btnPrimary, fontSize: 13, flex: 1, maxWidth: 130 }}>Share</button>
          </div>
        </div>, document.body)}

      {active !== false && !detail && !showForm && !receiving && !printData && canCreate && createPortal(
        <button className="fab" aria-label="New purchase order" onClick={() => { setEditing(null); setDuplicating(null); setShowForm(true); }}>+</button>,
        document.body,
      )}
    </div>
  );
}
