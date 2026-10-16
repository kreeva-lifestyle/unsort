// Purchase Orders list data: the paginated fetch (estimated count + explicit
// columns + items join for receive-progress), debounced search (vendor name,
// PO #, and line-item SKUs via search_po_ids), the filters, the Created-By
// users, and the visibility-gated realtime refetch. Split out of
// pages/PurchaseOrders.tsx (audit L6): the page keeps the modals, this owns
// the list.
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useActiveRefetch } from '../../hooks/useActiveRefetch';
import { friendlyError } from '../../lib/friendlyError';
import { fileDate } from '../../lib/exportName';
import { PENDING_STATUSES } from './pendencyData';
import { addDays, ASSUMED_LEAD_DAYS } from './poDue';
import type { PORow } from './POList';
import type { PurchaseOrderStatus } from '../../types/database';

export const PO_COLS = 'id, po_number, vendor_id, vendor_name, vendor_phone, po_type, status, po_date, expected_date, payment_terms, notes, for_pieces, lump_sum, costing_product_id, subtotal, discount_type, discount_value, discount_amount, tax_percent, tax_amount, other_charges, round_off, grand_total, approved_by, approved_at, cancelled_by, cancelled_at, closed_at, closed_by, close_reason, created_by, modified_by, created_at, updated_at';

/** The summary tiles' one-tap slices: open orders, or open orders past their due date. */
export type PoQuick = '' | 'open' | 'breached';
export const QUICK_LABELS: Record<Exclude<PoQuick, ''>, string> = { open: 'Open orders', breached: 'Breached orders' };

/** The list's two tabs. A partly received order is still open. */
export type PoTab = 'open' | 'completed';
export const TAB_STATUSES: Record<PoTab, PurchaseOrderStatus[]> = {
  open: ['draft', 'approved', 'sent', 'partially_received'],
  completed: ['completed', 'closed', 'cancelled'],
};

// One builder type for both the list query and the head-only count, so the
// two share a single filter chain (narrow, in fetchPos).
const poQuery = (columns: string, opts: { count: 'estimated' | 'exact'; head?: boolean }) =>
  supabase.from('purchase_orders').select(columns, opts);
type PoQuery = ReturnType<typeof poQuery>;

export function usePoList(active: boolean | undefined, addToast: (m: string, t?: string) => void) {
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
  const [quick, setQuick] = useState<PoQuick>('');
  const [tab, setTabState] = useState<PoTab>('open');
  // The other tab's count under the same search and filters (null = unknown).
  const [otherCount, setOtherCount] = useState<number | null>(null);
  // Exactly one vendor (a tap on the summary's bar) — not a text match.
  const [vendorFilter, setVendorFilter] = useState('');
  // Bumped when the data changed (a write, a realtime event, a foreground
  // refetch) — never on a search or a page flip — so the summary follows
  // edits without refetching on every keystroke.
  const [dataVersion, setDataVersion] = useState(0);
  const bumpData = useCallback(() => setDataVersion(v => v + 1), []);
  const [users, setUsers] = useState<{ id: string; full_name: string }[]>([]);

  // Active users for the "Created By" filter dropdown (pattern from CashBook) —
  // read the first time Filters is opened, not on every page open.
  const usersAsked = useRef(false);
  useEffect(() => {
    if (!showFilters || usersAsked.current) return;
    usersAsked.current = true;
    supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name').limit(200)
      .then(({ data, error }) => {
        if (error) { addToast(friendlyError(error), 'error'); return; }
        setUsers((data as { id: string; full_name: string }[] | null) || []);
      });
  }, [showFilters, addToast]);

  const totalPages = Math.ceil(totalCount / pageSize);

  // Monotonic fetch id — a slower stale response (e.g. the SKU-search path has
  // an extra awaited RPC) must never overwrite the result of a newer fetch.
  const fetchSeq = useRef(0);
  const fetchPos = useCallback(async (silent = false) => {
    const seq = ++fetchSeq.current;
    if (!silent) setLoading(true);
    // The open-orders slices (summary tiles, vendor bar) only ever live on Open.
    const shown: PoTab = quick ? 'open' : tab;
    const other: PoTab = shown === 'open' ? 'completed' : 'open';
    const ors: string[] = [];
    if (debouncedSearch) {
      // Vendor name always matches; a pure number also matches the PO #; and
      // ANY term (numeric SKUs like "15003" included) also matches line-item
      // SKUs via search_po_ids. The RPC gets the RAW term (parameterized, so
      // safe) — stripping dots/underscores made "DRS_178" unfindable; only
      // the or-filter string needs the PostgREST-syntax characters removed.
      const raw = debouncedSearch.trim();
      const s = raw.replace(/[%_,().]/g, '').trim();
      if (s) {
        ors.push(`vendor_name.ilike.%${s}%`);
        // <=9 digits only: a 13-digit barcode overflows int4 and 400s the query.
        if (/^\d{1,9}$/.test(s)) ors.push(`po_number.eq.${parseInt(s)}`);
      }
      if (raw) {
        const { data: idRows, error: rpcErr } = await supabase.rpc('search_po_ids', { q: raw });
        // A swallowed error here made SKU search silently degrade to
        // vendor-only — surface it so a break is visible, not mysterious.
        if (rpcErr) addToast(`SKU search failed — ${friendlyError(rpcErr)}`, 'error');
        const ids = (idRows as string[] | null) || [];
        if (ids.length > 0) ors.push(`id.in.(${ids.slice(0, 200).join(',')})`);
      }
    }
    // Search + filters, applied the same way to the list and to the other
    // tab's count.
    const narrow = (q: PoQuery): PoQuery => {
      if (ors.length > 0) q = q.or(ors.join(','));
      if (quick) q = q.in('status', PENDING_STATUSES);
      // "Breached" = past the due date: the expected date, or (none given)
      // the PO date plus ASSUMED_LEAD_DAYS — the same rule as poDue.dueOf,
      // which turns the list's row red.
      if (quick === 'breached') {
        const today = fileDate(), cut = addDays(today, -ASSUMED_LEAD_DAYS);
        q = q.or(`expected_date.lt.${today},and(expected_date.is.null,po_date.lt.${cut}),and(expected_date.is.null,po_date.is.null,created_at.lt.${cut})`);
      }
      if (vendorFilter) q = q.eq('vendor_name', vendorFilter);
      if (statusFilter) q = q.eq('status', statusFilter);
      if (typeFilter) q = q.eq('po_type', typeFilter);
      if (creatorFilter) q = q.eq('created_by', creatorFilter);
      if (dateFrom) q = q.gte('po_date', dateFrom);
      if (dateTo) q = q.lte('po_date', dateTo);
      return q;
    };
    const listQ = narrow(poQuery(`${PO_COLS}, costing_products(sku), purchase_order_items(sku, item_name, fabric_code, quantity, received_qty)`, { count: 'estimated' }).in('status', TAB_STATUSES[shown]))
      .order('po_number', { ascending: false }).range(page * pageSize, (page + 1) * pageSize - 1);
    // A slice that lives on Open only has nothing on Completed: no query.
    const otherQ = quick ? null : narrow(poQuery('id', { count: 'exact', head: true }).in('status', TAB_STATUSES[other]));
    const { data, count, error } = await listQ;
    if (seq !== fetchSeq.current) return; // a newer fetch superseded this one
    // The other tab's count is a hint, read only once the list is on screen:
    // the rows someone came for never wait behind it. A failure leaves it blank.
    if (otherQ) otherQ.then(o => { if (seq === fetchSeq.current) setOtherCount(o.error ? null : (o.count ?? 0)); });
    else setOtherCount(null);
    // We ARE the latest fetch, so ALWAYS clear loading — even on the silent
    // path. A silent refetch (channel connect / foreground) can supersede the
    // mount fetch, and the superseded one returns above without clearing;
    // gating this on !silent left the skeletons up forever.
    if (error) { addToast(friendlyError(error), 'error'); setLoading(false); return; }
    setPos((data as unknown as PORow[] | null) || []);
    setTotalCount(count || 0);
    setLoading(false);
    if (silent) setDataVersion(v => v + 1); // silent = something changed, not a new slice
  }, [debouncedSearch, quick, tab, vendorFilter, statusFilter, typeFilter, creatorFilter, dateFrom, dateTo, page, pageSize, addToast]);

  useEffect(() => { fetchPos(); }, [fetchPos]);

  // Realtime, gated on the page being the VISIBLE tab (hidden tabs stay
  // mounted forever — refetching them was invisible server load). Hidden
  // events mark the page stale; one refetch fires on switching back / app
  // resume. The hook throttles bursts and owns the foreground listeners.
  const notifyPos = useActiveRefetch(active ?? true, () => fetchPos(true));
  useEffect(() => {
    const ch = supabase.channel('purchase_orders_rt')
      // Header only: every PO RPC that touches items or receipts also stamps
      // the header's updated_at in the same transaction, so the two extra
      // table-wide subscriptions only fanned out duplicate events.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_orders' }, notifyPos)
      // Reconnect catch-up: realtime never replays missed events.
      .subscribe(status => { if (status === 'SUBSCRIBED') notifyPos(); });
    return () => { supabase.removeChannel(ch); };
  }, [notifyPos]);

  // Switching tab starts at page 1, drops a status filter that belongs to the
  // other tab, and leaves an open-orders slice (it lives on Open only).
  const setTab = (t: PoTab) => {
    setTabState(t); setPage(0); setOtherCount(null);
    if (statusFilter && !TAB_STATUSES[t].includes(statusFilter as PurchaseOrderStatus)) setStatusFilter('');
    if (t === 'completed') { setQuick(''); setVendorFilter(''); }
  };
  const tabShown: PoTab = quick ? 'open' : tab;

  const clearFilters = () => { setStatusFilter(''); setTypeFilter(''); setCreatorFilter(''); setDateFrom(''); setDateTo(''); setQuick(''); setVendorFilter(''); setPage(0); };

  return {
    pos, loading, page, setPage, pageSize, setPageSize, totalCount, totalPages,
    // debouncedSearch is what the rows on screen were fetched with.
    search, debouncedSearch, updateSearch, statusFilter, setStatusFilter, typeFilter, setTypeFilter, creatorFilter, setCreatorFilter,
    dateFrom, setDateFrom, dateTo, setDateTo, showFilters, setShowFilters, users, fetchPos, clearFilters,
    quick, setQuick, vendorFilter, setVendorFilter, dataVersion, bumpData,
    tab: tabShown, setTab, otherCount,
  };
}
