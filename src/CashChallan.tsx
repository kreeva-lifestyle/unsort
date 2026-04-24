import { useState, useEffect, useCallback, useRef } from 'react';
import CashBook from './CashBook';
import { supabase } from './lib/supabase';
import { useNotifications } from './hooks/useNotifications';
import ChallanAnalytics from './components/challan/ChallanAnalytics';
import ChallanLedger from './components/challan/ChallanLedger';
import ChallanForm from './components/challan/ChallanForm';
import ChallanDetail from './components/challan/ChallanDetail';
import Empty from './components/ui/Empty';
import { friendlyError } from './lib/friendlyError';
import { useDebouncedFetch } from './hooks/useDebouncedFetch';
import type {
  CashChallan,
  CashChallanItem as DbCashChallanItem,
  CashChallanCustomer,
  AuditLog,
} from './types/database';

const PAYMENT_MODES = ['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Card', 'Other'];

const ccAuditLog = async (action: string, recordId: string, details: string, changes?: Record<string, { from: unknown; to: unknown }>) => {
  const { data: { user } } = await supabase.auth.getUser();
  let userName = user?.email || null;
  if (user) { const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle(); userName = prof?.full_name || userName; }
  await supabase.from('audit_log').insert({ action, module: 'cash_challan', record_id: recordId, details, user_id: user?.id ?? null, user_email: userName, changes: changes || null });
};

import { T } from './lib/theme';

// View model: form-state representation of a cash_challan_items row.
// Differs from DB row: `id` optional (unsaved items), no challan_id/sort_order
// (managed at save-time), discount_* are optional (defaulted to flat/0).
interface ChallanItem { id?: string; sku: string; description: string; quantity: number; price: number; total: number; discount_type?: string; discount_value?: number; discount_amount?: number; }

// View model: central CashChallan row + joined nested items.
// created_at/updated_at asserted non-null — DB defaults always populate them.
type Challan = Omit<CashChallan, 'created_at' | 'updated_at'> & {
  created_at: string;
  updated_at: string;
  items?: ChallanItem[];
  cash_challan_items?: Array<Partial<DbCashChallanItem>>;
};

// Narrow customer row used by the auto-suggest dropdown.
type Customer = Pick<CashChallanCustomer, 'id' | 'name' | 'phone' | 'address'>;

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  draft: { bg: 'rgba(56,189,248,.10)', color: T.bl },
  paid: { bg: 'rgba(34,197,94,.10)', color: T.gr },
  unpaid: { bg: 'rgba(239,68,68,.10)', color: T.re },
  partial: { bg: 'rgba(245,158,11,.10)', color: T.yl },
  voided: { bg: 'rgba(255,255,255,.10)', color: T.tx3 },
};


export default function CashChallan({ active }: { active?: boolean } = {}) {
  const { addToast } = useNotifications();
  // ── State ──────────────────────────────────────────────────────────────────
  const [challans, setChallans] = useState<Challan[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  // Bulk pay/unpay
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkPay, setShowBulkPay] = useState(false);
  const [showBulkUnpay, setShowBulkUnpay] = useState(false);
  const [bulkPayMode, setBulkPayMode] = useState('');
  const [bulkReceivedAmount, setBulkReceivedAmount] = useState('');
  const [lastBatch, setLastBatch] = useState<{ id: string; count: number; mode: string } | null>(null);
  const [undoingBatch, setUndoingBatch] = useState(false);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Challan | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerSuggestions, setCustomerSuggestions] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [items, setItems] = useState<ChallanItem[]>([{ sku: '', description: '', quantity: 1, price: 0, total: 0, discount_type: 'flat', discount_value: 0, discount_amount: 0 }]);
  const [shippingCharges, setShippingCharges] = useState(0);
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState('');
  const [paymentMode, setPaymentMode] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [amountPaid, setAmountPaid] = useState(0);
  const [challanStatus, setChallanStatus] = useState('unpaid');
  const [customerPhone, setCustomerPhone] = useState('');
  const [isReturn, setIsReturn] = useState(false);
  const [returnSource, setReturnSource] = useState<Challan | null>(null);
  const [returnSearchQ, setReturnSearchQ] = useState('');
  const [returnResults, setReturnResults] = useState<Challan[]>([]);
  const [auditTrail, setAuditTrail] = useState<AuditLog[] | null>(null);
  const [reminderChallan, setReminderChallan] = useState<Challan | null>(null);
  const [reminderPhone, setReminderPhone] = useState('');

  // Analytics
  const [showErpReminder, setShowErpReminder] = useState(false);
  // Ledger PDF preview — rendered in an in-app iframe (audit: no popup).
  const [ledgerPdfHtml, setLedgerPdfHtml] = useState<string | null>(null);
  const [ledgerPdfTitle, setLedgerPdfTitle] = useState('');
  const ledgerPdfIframeRef = useRef<HTMLIFrameElement | null>(null);
  const [userName, setUserName] = useState('there');
  const [confirmAction, setConfirmAction] = useState<{ type: 'void' | 'delete'; id: string; challanNumber?: number } | null>(null);
  const [viewingChallan, setViewingChallan] = useState<Challan | null>(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [analytics, setAnalytics] = useState<{ totalRevenue: number; count: number; byMode: Record<string, number>; returnsCount?: number; voidedCount?: number; prevRevenue?: number; prevCount?: number }>({ totalRevenue: 0, count: 0, byMode: {} });
  const [analyticsFrom, setAnalyticsFrom] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; });
  const [analyticsTo, setAnalyticsTo] = useState(() => new Date().toISOString().slice(0, 10));

  // Ledger
  const [showLedger, setShowLedger] = useState(false);
  const [showCashBook, setShowCashBook] = useState(false);
  const [ledgerCustomers, setLedgerCustomers] = useState<{ name: string; total: number; paid: number; outstanding: number; count: number }[]>([]);
  const [ledgerFetchLimit, setLedgerFetchLimit] = useState(100);
  const [ledgerDetail, setLedgerDetail] = useState<string | null>(null);
  const [ledgerChallans, setLedgerChallans] = useState<Challan[]>([]);
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerFrom, setLedgerFrom] = useState('');
  const [ledgerTo, setLedgerTo] = useState('');


  // ── Computed values (per-item discount) ─────────────────────────────────
  // Honest math throughout — no silent clamping. If the user enters an
  // over-discount, the totals card shows the real numbers (e.g. Subtotal
  // ₹2,000, Discount -₹3,000, Total -₹1,000) so they can see and correct
  // the mistake. Save is blocked downstream by itemValidationError +
  // grandTotal < 0 checks before anything hits the DB.
  const computeItemLineTotal = (it: ChallanItem) => Math.round((it.quantity * it.price) * 100) / 100;
  const computeItemDiscount = (it: ChallanItem) => {
    const d = it.discount_value || 0;
    const raw = it.discount_type === 'percentage' ? (it.quantity * it.price * d / 100) : d;
    return Math.round(raw * 100) / 100;
  };
  const computeItemTotal = (it: ChallanItem) => {
    return Math.round((computeItemLineTotal(it) - computeItemDiscount(it)) * 100) / 100;
  };

  // Human-readable validation for a single line item. Returns null when OK,
  // or the specific reason it's invalid. Used for inline red border while the
  // user types AND the save block — single source of truth so the two can't
  // drift. Empty rows (no qty/price yet) are treated as "not an error yet".
  const itemValidationError = (it: ChallanItem): string | null => {
    const q = Number(it.quantity) || 0;
    const p = Number(it.price) || 0;
    const d = Number(it.discount_value) || 0;
    if (q < 0) return 'Quantity cannot be negative';
    if (p < 0) return 'Price cannot be negative';
    if (d < 0) return 'Discount cannot be negative';
    if (it.discount_type === 'percentage' && d > 100) return 'Discount cannot exceed 100%';
    // Only compare flat discount to line total when both qty and price are set
    // (so partially-typed rows don't flash red prematurely).
    if (it.discount_type !== 'percentage' && q > 0 && p > 0 && d > q * p) {
      return `Discount ₹${d.toLocaleString('en-IN')} exceeds line total ₹${(q * p).toLocaleString('en-IN')}`;
    }
    return null;
  };
  // Subtotal = raw line totals (pre-discount). Discount = raw sum as entered.
  // Total = subtotal - discount + shipping (can go negative while editing).
  const subtotal = Math.round(items.reduce((s, i) => s + computeItemLineTotal(i), 0) * 100) / 100;
  const totalDiscount = Math.round(items.reduce((s, i) => s + computeItemDiscount(i), 0) * 100) / 100;
  const clampedShipping = Math.max(0, shippingCharges);
  const afterAll = Math.round((subtotal - totalDiscount + clampedShipping) * 100) / 100;
  const roundOff = Math.round((Math.round(afterAll) - afterAll) * 100) / 100;
  const grandTotal = Math.round(afterAll);

  // ── Fetch challans ─────────────────────────────────────────────────────────
  const fetchChallans = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('cash_challans').select('*, cash_challan_items(sku)', { count: 'estimated' });
    if (search) {
      const s = search.replace(/[%_,().]/g, '');
      const num = parseInt(s);
      if (num && !isNaN(num)) query = query.eq('challan_number', num);
      else if (s.trim()) query = query.ilike('customer_name', `%${s}%`);
    }
    if (statusFilter) query = query.eq('status', statusFilter);
    if (tagFilter) query = query.contains('tags', [tagFilter]);
    if (dateFrom) query = query.gte('created_at', dateFrom + 'T00:00:00');
    if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59');
    query = query.order('created_at', { ascending: false }).range(page * pageSize, (page + 1) * pageSize - 1);
    const { data, count } = await query;
    setChallans((data as Challan[] | null) || []);
    setTotalCount(count || 0);
    setLoading(false);
  }, [search, statusFilter, tagFilter, dateFrom, dateTo, page, pageSize]);

  useEffect(() => { fetchChallans(); }, [fetchChallans]);

  useEffect(() => {
    if (active) { setShowCashBook(false); setShowAnalytics(false); setShowLedger(false); setLedgerDetail(null); }
  }, [active]);

  // Browser back button support
  useEffect(() => {
    const onPop = () => {
      if (ledgerDetail) { setLedgerDetail(null); return; }
      if (showLedger) { setShowLedger(false); setLedgerSearch(''); return; }
      if (showAnalytics) { setShowAnalytics(false); return; }
      if (showCashBook) { setShowCashBook(false); return; }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [ledgerDetail, showLedger, showAnalytics, showCashBook]);

  // ── Realtime sync — multi-user safety ──────────────────────────────────────
  // INSERT/DELETE instant; UPDATE debounced 500ms to coalesce bulk operations.
  const { debounced: debouncedFetchChallans } = useDebouncedFetch(fetchChallans, 500);
  useEffect(() => {
    const imm = () => fetchChallans();
    const channel = supabase.channel('cash_challans_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cash_challans' }, imm)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'cash_challans' }, imm)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'cash_challans' }, debouncedFetchChallans)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cash_challan_items' }, imm)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'cash_challan_items' }, imm)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'cash_challan_items' }, debouncedFetchChallans)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchChallans, debouncedFetchChallans]);
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
        setUserName(prof?.full_name || user.email?.split('@')[0] || 'there');
      }
    })();
  }, []);

  // ── Return source invoice search ────────────────────────────────────────────
  const searchReturnSource = useCallback(async (q: string) => {
    if (!q.trim()) { setReturnResults([]); return; }
    const num = parseInt(q);
    let query = supabase.from('cash_challans').select('*, cash_challan_items(*)').eq('is_return', false).neq('status', 'voided');
    if (num && !isNaN(num)) query = query.eq('challan_number', num);
    else query = query.ilike('customer_name', `%${q.replace(/[%_]/g, '\\$&')}%`);
    const { data } = await query.order('created_at', { ascending: false }).limit(10);
    setReturnResults((data as Challan[] | null) || []);
  }, []);

  const selectReturnSource = (challan: Challan) => {
    if (challan.status === 'voided') { setReturnResults([]); return; }
    if (challan.is_return) { setReturnResults([]); return; }
    setReturnSource(challan);
    setReturnResults([]);
    setReturnSearchQ('');
    setCustomerName(challan.customer_name);
    setSelectedCustomerId(challan.customer_id);
    const sourceItems: ChallanItem[] = (challan.cash_challan_items || []).map((it) => ({
      sku: it.sku ?? '', description: it.description ?? '', quantity: it.quantity ?? 0, price: Number(it.price ?? 0),
      total: Number(it.total ?? 0), discount_type: it.discount_type || 'flat', discount_value: Number(it.discount_value || 0), discount_amount: Number(it.discount_amount || 0),
    }));
    setItems(sourceItems);
  };

  // ── Customer auto-suggest ──────────────────────────────────────────────────
  const searchCustomers = useCallback(async (q: string) => {
    if (q.length < 2) { setCustomerSuggestions([]); return; }
    const { data } = await supabase.from('cash_challan_customers').select('id, name, phone, address').ilike('name', `%${q.replace(/[%_]/g, '\\$&')}%`).limit(5);
    const rows = (data as Customer[] | null) || [];
    setCustomerSuggestions(rows);
    // Auto-fill phone if exact match found (case-insensitive)
    const exact = rows.find((c) => c.name.toLowerCase() === q.trim().toLowerCase());
    if (exact) {
      setSelectedCustomerId(exact.id);
      if (exact.phone) setCustomerPhone(exact.phone);
    } else {
      setSelectedCustomerId(null);
    }
  }, []);

  // ── Fetch analytics ────────────────────────────────────────────────────────
  const fetchAnalytics = useCallback(async () => {
    const fromDt = new Date(analyticsFrom + 'T00:00:00');
    const toDt = new Date(analyticsTo + 'T23:59:59');
    const rangeMs = toDt.getTime() - fromDt.getTime();
    // Previous comparable period (audit P2: "This period vs Previous")
    const prevToDt = new Date(fromDt.getTime() - 1);
    const prevFromDt = new Date(prevToDt.getTime() - rangeMs);
    type AnalyticsRow = Pick<CashChallan, 'total' | 'payment_mode' | 'status' | 'is_return'>;
    const fromIso = fromDt.toISOString(); const toIso = toDt.toISOString();
    const fromDate = analyticsFrom; const toDate = analyticsTo;
    const [{ data }, { count: voidedCount }, { data: prevData }, { data: paidInPeriod }] = await Promise.all([
      supabase.from('cash_challans').select('total, payment_mode, status, is_return').gte('created_at', fromIso).lte('created_at', toIso).neq('status', 'voided'),
      supabase.from('cash_challans').select('id', { count: 'estimated', head: true }).gte('created_at', fromIso).lte('created_at', toIso).eq('status', 'voided'),
      supabase.from('cash_challans').select('total, is_return').gte('created_at', prevFromDt.toISOString()).lte('created_at', prevToDt.toISOString()).neq('status', 'voided'),
      supabase.from('cash_challans').select('total, payment_mode, is_return').gte('payment_date', fromDate).lte('payment_date', toDate).in('status', ['paid', 'partial']).neq('status', 'voided'),
    ]);
    const rows = (data as AnalyticsRow[] | null) || [];
    const totalRevenue = rows.reduce((s, r) => s + (r.is_return ? -1 : 1) * Number(r.total), 0);
    const byMode: Record<string, number> = {};
    ((paidInPeriod as AnalyticsRow[] | null) || []).forEach((r) => { const m = r.payment_mode || 'Unset'; byMode[m] = (byMode[m] || 0) + (r.is_return ? -1 : 1) * Number(r.total); });
    const salesCount = rows.filter((r) => !r.is_return).length;
    const returnsCount = rows.filter((r) => r.is_return).length;
    const prevRows = (prevData as Pick<CashChallan, 'total' | 'is_return'>[] | null) || [];
    const prevRevenue = prevRows.reduce((s, r) => s + (r.is_return ? -1 : 1) * Number(r.total), 0);
    const prevCount = prevRows.filter(r => !r.is_return).length;
    setAnalytics({ totalRevenue, count: salesCount, byMode, returnsCount, voidedCount: voidedCount || 0, prevRevenue, prevCount } as typeof analytics);
  }, [analyticsFrom, analyticsTo]);

  // ── Fetch ledger (recent 10 customers) ──────────────────────────────────────
  const fetchLedger = useCallback(async (limit = ledgerFetchLimit) => {
    const { data } = await supabase.from('cash_challans').select('customer_name, total, amount_paid, is_return, created_at').neq('status', 'voided').order('created_at', { ascending: false }).limit(limit);
    type LedgerRow = Pick<CashChallan, 'customer_name' | 'total' | 'amount_paid' | 'is_return' | 'created_at'>;
    const map: Record<string, { total: number; paid: number; count: number; latest: string }> = {};
    ((data as LedgerRow[] | null) || []).forEach((r) => {
      const name = r.customer_name;
      const sign = r.is_return ? -1 : 1;
      if (!map[name]) map[name] = { total: 0, paid: 0, count: 0, latest: r.created_at ?? '' };
      map[name].total += sign * Number(r.total);
      map[name].paid += sign * Number(r.amount_paid || 0);
      map[name].count++;
    });
    const list = Object.entries(map).map(([name, v]) => ({ name, total: v.total, paid: v.paid, outstanding: v.total - v.paid, count: v.count }));
    list.sort((a, b) => (map[b.name].latest > map[a.name].latest ? 1 : -1));
    setLedgerCustomers(list.slice(0, 10));
  }, [ledgerFetchLimit]);

  const searchLedgerCustomer = useCallback(async (q: string) => {
    if (!q.trim()) { fetchLedger(); return; }
    const { data } = await supabase.from('cash_challans').select('customer_name, total, amount_paid, is_return').neq('status', 'voided').ilike('customer_name', `%${q.replace(/[%_]/g, '\\$&')}%`);
    type LedgerSearchRow = Pick<CashChallan, 'customer_name' | 'total' | 'amount_paid' | 'is_return'>;
    const map: Record<string, { total: number; paid: number; count: number }> = {};
    ((data as LedgerSearchRow[] | null) || []).forEach((r) => {
      const name = r.customer_name;
      const sign = r.is_return ? -1 : 1;
      if (!map[name]) map[name] = { total: 0, paid: 0, count: 0 };
      map[name].total += sign * Number(r.total);
      map[name].paid += sign * Number(r.amount_paid || 0);
      map[name].count++;
    });
    setLedgerCustomers(Object.entries(map).map(([name, v]) => ({ name, total: v.total, paid: v.paid, outstanding: v.total - v.paid, count: v.count })));
  }, [fetchLedger]);

  const fetchLedgerDetailWithRange = useCallback(async (name: string, from: string, to: string) => {
    let q = supabase.from('cash_challans').select('id, challan_number, customer_id, customer_name, status, subtotal, discount_type, discount_value, discount_amount, round_off, total, amount_paid, payment_mode, payment_date, notes, tags, shipping_charges, is_return, source_challan_id, created_at, updated_at').ilike('customer_name', name.replace(/[%_]/g, '\\$&')).neq('status', 'voided').order('created_at', { ascending: false });
    if (from) q = q.gte('created_at', from + 'T00:00:00');
    if (to) q = q.lte('created_at', to + 'T23:59:59');
    const { data } = await q.limit(500);
    setLedgerChallans((data as Challan[] | null) || []);
  }, []);

  const fetchLedgerDetail = useCallback(async (name: string) => {
    setLedgerDetail(name);
    setLedgerFrom('');
    setLedgerTo('');
    window.history.pushState({ view: 'ledger-detail' }, '');
    await fetchLedgerDetailWithRange(name, '', '');
  }, [fetchLedgerDetailWithRange]);

  // ── Save challan ───────────────────────────────────────────────────────────
  const [formError, setFormError] = useState('');
  const saveChallan = async () => {
    setFormError('');
    if (editing && editing.status === 'voided') { setFormError('Cannot edit a voided challan'); return; }
    if (isReturn && !editing && !returnSource) { setFormError('Select the original invoice for this return'); return; }
    if (!customerName.trim()) { setFormError('Customer name is required'); return; }
    if (items.length === 0) { setFormError('Add at least one item'); return; }
    const emptySkuItem = items.find(it => !it.sku.trim());
    if (emptySkuItem) { setFormError('SKU is required for all items'); return; }
    const zeroQtyItem = items.find(it => it.quantity <= 0);
    if (zeroQtyItem) { setFormError(`Item "${zeroQtyItem.sku}" has invalid quantity (must be > 0)`); return; }
    const zeroPriceItem = items.find(it => it.price <= 0);
    if (zeroPriceItem) { setFormError(`Item "${zeroPriceItem.sku}" has invalid price (must be > 0)`); return; }
    // Consolidated discount/negative checks (flat discount > line total is the new case).
    for (let i = 0; i < items.length; i++) {
      const err = itemValidationError(items[i]);
      if (err) { setFormError(`Row ${i + 1} (${items[i].sku || '—'}): ${err}`); return; }
    }
    if (shippingCharges < 0) { setFormError('Shipping/Porter charges cannot be negative'); return; }
    if (isReturn && returnSource) {
      const sourceItems = returnSource.cash_challan_items || [];
      // Check cumulative returns — fetch all previous returns for this source
      const { data: prevReturns } = await supabase.from('cash_challans').select('id').eq('source_challan_id', returnSource.id).eq('is_return', true).neq('status', 'voided');
      type IdRow = Pick<CashChallan, 'id'>;
      const prevReturnIds = ((prevReturns as IdRow[] | null) || []).map((r) => r.id).filter((id) => !editing || id !== editing.id);
      const prevQtyMap: Record<string, number> = {};
      if (prevReturnIds.length > 0) {
        const { data: prevItems } = await supabase.from('cash_challan_items').select('sku, quantity').in('challan_id', prevReturnIds);
        type PrevItemRow = Pick<DbCashChallanItem, 'sku' | 'quantity'>;
        ((prevItems as PrevItemRow[] | null) || []).forEach((pi) => { const key = pi.sku ?? ''; prevQtyMap[key] = (prevQtyMap[key] || 0) + pi.quantity; });
      }
      for (const it of items) {
        const src = sourceItems.find((s: Partial<DbCashChallanItem>) => s.sku === it.sku);
        if (!src) continue;
        const srcQty = src.quantity ?? 0;
        const alreadyReturned = prevQtyMap[it.sku] || 0;
        const remaining = srcQty - alreadyReturned;
        if (it.quantity > remaining) { setFormError(`"${it.sku}": only ${remaining} remaining (${alreadyReturned} already returned of ${srcQty})`); return; }
      }
    }
    if (subtotal <= 0) { setFormError('Subtotal must be greater than zero'); return; }
    if (grandTotal < 0) { setFormError('Total cannot be negative. Check item discounts.'); return; }
    if (amountPaid < 0) { setFormError('Amount paid cannot be negative'); return; }
    if (amountPaid > grandTotal) { setFormError(`Amount paid (₹${amountPaid}) cannot exceed total (₹${grandTotal})`); return; }
    if (!paymentMode && amountPaid > 0) { setFormError('Select a payment mode when amount is paid'); return; }
    if (editing && editing.status !== 'draft' && challanStatus === 'draft') { setFormError('Cannot revert to Draft once saved'); return; }
    if (challanStatus === 'paid' && amountPaid < grandTotal) { setFormError(isReturn ? `Refund amount (₹${amountPaid}) must equal return total (₹${grandTotal})` : `Status is "Paid" but amount paid (₹${amountPaid}) is less than total (₹${grandTotal})`); return; }
    if (!isReturn && challanStatus === 'partial' && (amountPaid <= 0 || amountPaid >= grandTotal)) { setFormError('Partial status requires amount between ₹1 and total'); return; }
    if (challanStatus === 'draft' && amountPaid > 0) { setFormError('Draft challans cannot have payment. Change status first.'); return; }
    if (challanStatus === 'unpaid' && amountPaid > 0) { setFormError('Status is "Unpaid" but amount is paid. Change status to "Paid" or "Partial"'); return; }
    const { data: { user } } = await supabase.auth.getUser();

    // Upsert customer (case-insensitive match, save phone too)
    let custId = selectedCustomerId;
    if (!custId) {
      const trimmed = customerName.trim();
      const { data: existing } = await supabase.from('cash_challan_customers').select('id').ilike('name', trimmed).maybeSingle();
      if (existing) {
        custId = existing.id;
        if (customerPhone.trim()) await supabase.from('cash_challan_customers').update({ phone: customerPhone.trim() }).eq('id', custId);
      } else {
        const { data: newCust, error: insErr } = await supabase.from('cash_challan_customers').insert({ name: trimmed, phone: customerPhone.trim() || null }).select('id').single();
        if (insErr && insErr.code === '23505') {
          // Race: another user just created this customer — fetch them
          const { data: raceCust } = await supabase.from('cash_challan_customers').select('id').ilike('name', trimmed).maybeSingle();
          custId = raceCust?.id || null;
          if (custId && customerPhone.trim()) await supabase.from('cash_challan_customers').update({ phone: customerPhone.trim() }).eq('id', custId);
        } else {
          custId = newCust?.id || null;
        }
      }
    } else if (customerPhone.trim()) {
      await supabase.from('cash_challan_customers').update({ phone: customerPhone.trim() }).eq('id', custId);
    }

    const challanData = {
      // Returns are always 'paid' (=Refunded) — refunds are instant.
      customer_id: custId, customer_name: customerName.trim(), status: isReturn ? 'paid' : challanStatus,
      subtotal, discount_type: null, discount_value: 0,
      discount_amount: totalDiscount, shipping_charges: clampedShipping, round_off: roundOff, total: grandTotal,
      amount_paid: amountPaid, payment_mode: paymentMode || null,
      payment_date: paymentDate || null, notes, tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      is_return: isReturn,
      modified_by: user?.id,
    };

    try {
      if (editing) {
        const { data: current } = await supabase.from('cash_challans').select('updated_at').eq('id', editing.id).maybeSingle();
        if (current && editing.updated_at && current.updated_at !== editing.updated_at) {
          setFormError('This challan was modified by another user. Please close and reopen to get latest data.');
          return;
        }
        const { error: delErr } = await supabase.from('cash_challan_items').delete().eq('challan_id', editing.id);
        if (delErr) throw new Error(delErr.message);
        const { error: insErr2 } = await supabase.from('cash_challan_items').insert(items.map((it, i) => ({ challan_id: editing.id, sku: it.sku, description: it.description, quantity: it.quantity, price: it.price, total: computeItemTotal(it), discount_type: it.discount_type || null, discount_value: it.discount_value || 0, discount_amount: Math.round((it.quantity * it.price - computeItemTotal(it)) * 100) / 100, sort_order: i })));
        if (insErr2) throw new Error(insErr2.message);
        const { error: upErr } = await supabase.from('cash_challans').update({ ...challanData, updated_at: new Date().toISOString() }).eq('id', editing.id);
        if (upErr) throw new Error(upErr.message);
        // Record payment change
        const prevPaid = Number(editing.amount_paid || 0);
        const newPaid = amountPaid;
        const today = new Date().toISOString().slice(0, 10);
        if (newPaid > prevPaid) {
          await supabase.from('cash_challan_payments').insert({ challan_id: editing.id, amount: newPaid - prevPaid, payment_mode: paymentMode || 'Cash', payment_date: paymentDate || today, paid_by: user?.id });
        } else if (newPaid < prevPaid) {
          await supabase.from('cash_challan_payments').insert({ challan_id: editing.id, amount: prevPaid - newPaid, payment_mode: editing.payment_mode || paymentMode || 'Cash', payment_date: today, paid_by: user?.id, notes: 'Payment removed/reduced', is_reversal: true });
        }
        // Structured field-level diff for audit
        const tracked: (keyof typeof challanData)[] = ['status', 'amount_paid', 'payment_mode', 'payment_date', 'total', 'customer_name', 'shipping_charges', 'notes'];
        const changes: Record<string, { from: unknown; to: unknown }> = {};
        for (const k of tracked) { const prev = (editing as any)[k]; const next = (challanData as any)[k]; if (String(prev ?? '') !== String(next ?? '')) changes[k] = { from: prev, to: next }; }
        await ccAuditLog('UPDATE', editing.id, `Challan #${editing.challan_number} updated`, Object.keys(changes).length > 0 ? changes : undefined);
      } else {
        const { data: newChallan, error: crErr } = await supabase.from('cash_challans').insert({ ...challanData, created_by: user?.id, source_challan_id: isReturn && returnSource ? returnSource.id : null }).select('id, challan_number').single();
        if (crErr || !newChallan) throw new Error(crErr?.message || 'Failed to create challan');
        const { error: itErr } = await supabase.from('cash_challan_items').insert(items.map((it, i) => ({ challan_id: newChallan.id, sku: it.sku, description: it.description, quantity: it.quantity, price: it.price, total: computeItemTotal(it), discount_type: it.discount_type || null, discount_value: it.discount_value || 0, discount_amount: Math.round((it.quantity * it.price - computeItemTotal(it)) * 100) / 100, sort_order: i })));
        if (itErr) { await supabase.from('cash_challans').delete().eq('id', newChallan.id); throw new Error(itErr.message); }
        // Record initial payment for new challan
        if (amountPaid > 0) {
          await supabase.from('cash_challan_payments').insert({ challan_id: newChallan.id, amount: amountPaid, payment_mode: paymentMode || 'Cash', payment_date: paymentDate || new Date().toISOString().slice(0, 10), paid_by: user?.id });
        }
        await ccAuditLog('CREATE', newChallan.id, `${isReturn ? 'Return' : 'Challan'} #${newChallan.challan_number} created for ${customerName.trim()} — ₹${grandTotal}`);
      }
    } catch (e: any) {
      setFormError(`Save failed — ${friendlyError(e)}`);
      return;
    }
    const wasNew = !editing;
    closeModal();
    fetchChallans();
    // Show ERP reminder unless user suppressed it this week
    if (wasNew) {
      const suppressed = localStorage.getItem('ccErpReminderHidden');
      const aWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      if (!suppressed || Number(suppressed) < aWeekAgo) setShowErpReminder(true);
    }
  };

  // ── Void challan ───────────────────────────────────────────────────────────
  const voidChallan = async (id: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: before } = await supabase.from('cash_challans').select('challan_number, customer_name, total, amount_paid, status, payment_mode').eq('id', id).maybeSingle();
    if (!before) return;
    const { error: voidErr } = await supabase.from('cash_challans').update({ status: 'voided', voided_by: user?.id, voided_at: new Date().toISOString() }).eq('id', id);
    if (voidErr) { addToast(friendlyError(voidErr), 'error'); return; }
    if (Number(before.amount_paid || 0) > 0) {
      await supabase.from('cash_challan_payments').insert({
        challan_id: id, amount: Number(before.amount_paid), payment_mode: before.payment_mode || 'Cash',
        payment_date: new Date().toISOString().slice(0, 10), paid_by: user?.id,
        notes: `Reversal — challan #${before.challan_number} voided`, is_reversal: true,
      });
    }
    await ccAuditLog('VOID', id, `Challan #${before.challan_number} (${before.customer_name}) voided — was ₹${before.total}`, { status: { from: before.status, to: 'voided' }, amount_paid: { from: before.amount_paid, to: 0 } });
    fetchChallans();
  };

  // ── Audit trail for a challan ──────────────────────────────────────────────
  const loadAuditTrail = async (challanNumber: number) => {
    const { data } = await supabase.from('audit_log').select('id, action, module, record_id, details, user_id, user_email, created_at, changes').eq('module', 'cash_challan').ilike('details', `%#${challanNumber} %`).order('created_at', { ascending: false });
    setAuditTrail(data || []);
  };

  // ── WhatsApp payment reminder ──────────────────────────────────────────────
  const sendReminder = async (c: Challan) => {
    const outstanding = Number(c.total) - Number(c.amount_paid || 0);
    if (outstanding <= 0) { addToast('Cannot remind — challan is fully paid', 'error'); return; }
    // Try to get saved phone
    const { data: cust } = await supabase.from('cash_challan_customers').select('phone').eq('name', c.customer_name).maybeSingle();
    const phone = cust?.phone;
    if (phone) {
      const msg = encodeURIComponent(`Hi ${c.customer_name},\nGentle reminder — your Cash Challan #${c.challan_number} dated ${new Date(c.created_at).toLocaleDateString('en-IN')} for ₹${Number(c.total).toLocaleString('en-IN')} is pending.\nOutstanding: ₹${outstanding.toLocaleString('en-IN')}\nPlease arrange payment at your earliest convenience.\n— Arya Designs`);
      window.open(`https://wa.me/91${phone.replace(/\D/g, '')}?text=${msg}`, '_blank');
    } else {
      setReminderChallan(c);
      setReminderPhone('');
    }
  };

  const saveReminderPhone = async () => {
    if (!reminderChallan || !reminderPhone.trim()) return;
    await supabase.from('cash_challan_customers').update({ phone: reminderPhone.trim() }).eq('name', reminderChallan.customer_name);
    const c = reminderChallan;
    const outstanding = Number(c.total) - Number(c.amount_paid || 0);
    const msg = encodeURIComponent(`Hi ${c.customer_name},\nGentle reminder — your Cash Challan #${c.challan_number} dated ${new Date(c.created_at).toLocaleDateString('en-IN')} for ₹${Number(c.total).toLocaleString('en-IN')} is pending.\nOutstanding: ₹${outstanding.toLocaleString('en-IN')}\nPlease arrange payment at your earliest convenience.\n— Arya Designs`);
    window.open(`https://wa.me/91${reminderPhone.trim().replace(/\D/g, '')}?text=${msg}`, '_blank');
    setReminderChallan(null);
  };

  // ── Export customer ledger PDF ─────────────────────────────────────────────
  const escHtml = (s: unknown) => String(s ?? '').replace(/[<>"'&]/g, c => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '&': '&amp;' }[c] || c));
  const exportLedgerPDF = (customerName: string) => {
    if (ledgerChallans.length === 0) return;
    const safeName = escHtml(customerName);
    const cust = ledgerCustomers.find(c => c.name === customerName);
    const netTotal = ledgerChallans.reduce((s, c) => s + (c.is_return ? -1 : 1) * Number(c.total), 0);
    const totalPaid = ledgerChallans.reduce((s, c) => s + (c.is_return ? -1 : 1) * Number(c.amount_paid || 0), 0);
    const outstanding = Math.round((netTotal - totalPaid) * 100) / 100;
    const totalBilled = ledgerChallans.filter(c => !c.is_return).reduce((s, c) => s + Number(c.total), 0);
    const totalReturns = ledgerChallans.filter(c => c.is_return).reduce((s, c) => s + Number(c.total), 0);
    const rows = ledgerChallans.map(c => {
      const isRet = c.is_return;
      const sign = isRet ? -1 : 1;
      return `<tr>
        <td>#${escHtml(c.challan_number)}</td>
        <td>${new Date(c.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
        <td>${isRet ? '<span style="color:#e53e3e">Return</span>' : 'Sale'}</td>
        <td style="text-align:right">${isRet ? '−' : ''}₹${Number(c.total).toLocaleString('en-IN')}</td>
        <td style="text-align:right">₹${(sign * Number(c.amount_paid || 0)).toLocaleString('en-IN')}</td>
        <td style="text-align:right">₹${(sign * (Number(c.total) - Number(c.amount_paid || 0))).toLocaleString('en-IN')}</td>
        <td><span style="padding:1px 6px;border-radius:3px;font-size:10px;font-weight:600;text-transform:uppercase;background:${c.status === 'paid' ? '#d4edda' : c.status === 'partial' ? '#fff3cd' : '#f8d7da'};color:${c.status === 'paid' ? '#155724' : c.status === 'partial' ? '#856404' : '#721c24'}">${escHtml(c.status)}</span></td>
      </tr>`;
    }).join('');
    const html = `<!DOCTYPE html><html><head><title>Ledger - ${safeName}</title>
      <style>
        body{font-family:'Inter',sans-serif;padding:24px;color:#1a202c;font-size:12px;margin:0}
        h2{margin:0 0 4px;font-size:18px} .sub{color:#718096;font-size:11px;margin-bottom:16px}
        .stats{display:flex;gap:12px;margin-bottom:16px}
        .stat{flex:1;border:1px solid #e2e8f0;border-radius:8px;padding:10px;text-align:center}
        .stat .label{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#a0aec0;font-weight:600;margin-bottom:4px}
        .stat .val{font-size:18px;font-weight:800}
        table{width:100%;border-collapse:collapse;margin-bottom:16px}
        th{text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#a0aec0;padding:8px 10px;border-bottom:2px solid #e2e8f0;font-weight:600}
        td{padding:8px 10px;border-bottom:1px solid #edf2f7;font-size:11px}
        .totals{margin-top:8px;border-top:2px solid #2d3748;padding-top:8px}
        .totals div{display:flex;justify-content:space-between;padding:3px 0;font-size:12px}
        .totals .final{font-weight:800;font-size:14px;color:${outstanding > 0 ? '#e53e3e' : '#38a169'}}
        .footer{margin-top:20px;text-align:center;font-size:9px;color:#a0aec0}
        @media print{body{padding:12px}@page{margin:12mm}}
      </style></head><body>
      <h2>Customer Ledger</h2>
      <div class="sub">${safeName} | Generated: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
      <div class="stats">
        <div class="stat"><div class="label">Total Billed</div><div class="val" style="color:#6366f1">₹${totalBilled.toLocaleString('en-IN')}</div></div>
        <div class="stat"><div class="label">Paid</div><div class="val" style="color:#38a169">₹${(cust?.paid || totalPaid).toLocaleString('en-IN')}</div></div>
        <div class="stat"><div class="label">Outstanding</div><div class="val" style="color:${outstanding > 0 ? '#e53e3e' : '#38a169'}">₹${outstanding.toLocaleString('en-IN')}</div></div>
      </div>
      <table><thead><tr><th>Challan</th><th>Date</th><th>Type</th><th style="text-align:right">Amount</th><th style="text-align:right">Paid</th><th style="text-align:right">Balance</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <div class="totals">
        <div><span>Total Billed</span><span>₹${totalBilled.toLocaleString('en-IN')}</span></div>
        ${totalReturns > 0 ? `<div><span>Returns</span><span style="color:#e53e3e">−₹${totalReturns.toLocaleString('en-IN')}</span></div>` : ''}
        <div><span>Total Paid</span><span style="color:#38a169">₹${totalPaid.toLocaleString('en-IN')}</span></div>
        <div class="final"><span>Outstanding</span><span>₹${outstanding.toLocaleString('en-IN')}</span></div>
      </div>
      <div class="footer">DailyOffice — Your Workspace, Simplified</div>
    </body></html>`;
    setLedgerPdfTitle(customerName);
    setLedgerPdfHtml(html);
  };

  // ── Open edit ──────────────────────────────────────────────────────────────
  const openEdit = async (c: Challan) => {
    if (c.status === 'voided') { addToast('Cannot edit a voided challan', 'error'); return; }
    const [{ data: citems }, { data: cust }] = await Promise.all([
      supabase.from('cash_challan_items').select('*').eq('challan_id', c.id).order('sort_order'),
      c.customer_id ? supabase.from('cash_challan_customers').select('phone').eq('id', c.customer_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    setEditing(c);
    setCustomerName(c.customer_name);
    setSelectedCustomerId(c.customer_id);
    setCustomerPhone(cust?.phone || '');
    setIsReturn(!!c.is_return);
    setItems((citems || []).map(i => ({ sku: i.sku || '', description: i.description, quantity: i.quantity, price: Number(i.price), total: Number(i.total), discount_type: i.discount_type || 'flat', discount_value: Number(i.discount_value || 0), discount_amount: Number(i.discount_amount || 0) })));
    setShippingCharges(Number(c.shipping_charges || 0));
    setNotes(c.notes || '');
    setTags((c.tags || []).join(', '));
    setPaymentMode(c.payment_mode || '');
    setPaymentDate(c.payment_date || '');
    setAmountPaid(Number(c.amount_paid));
    // Refunds are instant — returns always render as 'paid' (=Refunded),
    // regardless of any legacy 'unpaid' row created under the old dropdown.
    setChallanStatus(c.is_return ? 'paid' : c.status);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false); setEditing(null); setCustomerName(''); setSelectedCustomerId(null); setCustomerPhone(''); setIsReturn(false); setReturnSource(null); setReturnSearchQ(''); setReturnResults([]);
    setItems([{ sku: '', description: '', quantity: 1, price: 0, total: 0, discount_type: 'flat', discount_value: 0, discount_amount: 0 }]);
    setShippingCharges(0); setNotes(''); setTags('');
    setPaymentMode(''); setPaymentDate(''); setAmountPaid(0); setChallanStatus('unpaid');
    setCustomerSuggestions([]);
  };

  // ── Print ──────────────────────────────────────────────────────────────────
  const printChallan = async (c: Challan) => {
    const { data: citems } = await supabase.from('cash_challan_items').select('*').eq('challan_id', c.id).order('sort_order');
    const w = window.open('', '_blank');
    if (!w) return;

    // Build one copy's inner HTML. We render it twice — top half = Office copy
    // (signed by customer, kept on file), bottom half = Customer copy. A
    // dashed cut line between them lets the user tear along the middle.
    const statusLabel = c.is_return ? 'Refunded' : c.status.charAt(0).toUpperCase() + c.status.slice(1);
    const statusColor = c.status === 'paid' ? '#155724' : c.status === 'partial' ? '#856404' : c.status === 'draft' ? '#0c5460' : '#721c24';
    const statusBg = c.status === 'paid' ? '#d4edda' : c.status === 'partial' ? '#fff3cd' : c.status === 'draft' ? '#d1ecf1' : '#f8d7da';
    const dateStr = new Date(c.created_at).toLocaleDateString('en-IN');
    const docType = c.is_return ? 'Return Challan' : 'Cash Challan';

    const itemRows = (citems || []).map((it, i) => {
      const da = Number(it.discount_amount || 0);
      return `<tr><td>${i + 1}</td><td>${escHtml(it.sku || '-')}</td><td class="right">${Number(it.quantity)}</td><td class="right">${Number(it.price).toFixed(2)}</td><td class="right">${da > 0 ? '-' + da.toFixed(2) : '-'}</td><td class="right">${Number(it.total).toFixed(2)}</td></tr>`;
    }).join('');

    let paymentLine = '';
    if (c.status === 'voided' && Number(c.amount_paid) > 0) paymentLine = `<span style="font-size:10px;color:${statusColor}">Was ₹${Number(c.amount_paid).toFixed(2)} — reversed. Net: ₹0</span>`;
    else if (Number(c.amount_paid) > 0) paymentLine = `<span style="font-size:10px;color:${statusColor}">${c.is_return ? 'Refunded' : 'Paid'}: ₹${Number(c.amount_paid).toFixed(2)}${c.payment_mode ? ' (' + escHtml(c.payment_mode) + ')' : ''}${c.payment_date ? ' on ' + new Date(c.payment_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}</span>`;
    let dueLine = '';
    if (c.status !== 'paid' && c.status !== 'draft' && !c.is_return) {
      const due = Number(c.total) - Number(c.amount_paid || 0);
      dueLine = `<span style="font-size:10px;color:#721c24;font-weight:600">Due: ₹${due.toFixed(2)}</span>`;
    }

    const copy = (label: string, includeSignature: boolean) => `
      <section class="copy">
        <div class="copy-tag">${label}</div>
        <div class="header"><h2 style="margin:0;font-size:15px">Arya Designs</h2><p style="color:#666;font-size:10px;margin:2px 0">${docType} #${escHtml(c.challan_number)} | ${dateStr}</p></div>
        <p style="margin:2px 0;font-size:11px"><strong>Customer:</strong> ${escHtml(c.customer_name)}</p>
        <table>
          <thead><tr><th>#</th><th>SKU</th><th class="right">Qty</th><th class="right">Price</th><th class="right">Disc.</th><th class="right">Total</th></tr></thead>
          <tbody>${itemRows}</tbody>
        </table>
        <div class="totals">
          <p>Subtotal: <strong>${Number(c.subtotal).toFixed(2)}</strong></p>
          ${Number(c.discount_amount) > 0 ? `<p>Discount: -${Number(c.discount_amount).toFixed(2)}</p>` : ''}
          ${Number(c.shipping_charges) > 0 ? `<p>Shipping/Porter: +${Number(c.shipping_charges).toFixed(2)}</p>` : ''}
          ${Number(c.round_off) !== 0 ? `<p>Round Off: ${Number(c.round_off).toFixed(2)}</p>` : ''}
          <p class="grand">Total: ₹${Number(c.total).toFixed(2)}</p>
        </div>
        <div class="status-row" style="background:${statusBg}">
          <span style="font-weight:700;color:${statusColor};font-size:11px">Status: ${escHtml(statusLabel)}</span>
          ${paymentLine}
          ${dueLine}
        </div>
        ${c.notes ? `<p style="font-size:10px;color:#666;margin:6px 0"><strong>Notes:</strong> ${escHtml(c.notes)}</p>` : ''}
        ${includeSignature ? `<div class="signature"><div class="sig-box"><div class="sig-line"></div><div class="sig-label">Customer Signature</div></div><div class="sig-box"><div class="sig-line"></div><div class="sig-label">Authorised Signatory</div></div></div>` : ''}
        <p class="footer">Powered by DailyOffice</p>
      </section>
    `;

    w.document.write(`<!doctype html><html><head><title>${escHtml(docType)} #${escHtml(c.challan_number)}</title>
      <style>
        @page { size: A4; margin: 10mm; }
        body { font-family: Arial, sans-serif; margin: 0; padding: 0; color: #222; }
        .sheet { max-width: 190mm; margin: 0 auto; }
        .copy { padding: 0 4mm; page-break-inside: avoid; }
        .copy-tag { display: inline-block; background: #333; color: #fff; font-size: 9px; font-weight: 700; padding: 2px 8px; letter-spacing: 1px; text-transform: uppercase; border-radius: 3px; margin-bottom: 4px; }
        .header { text-align: center; margin-bottom: 6px; }
        table { width: 100%; border-collapse: collapse; margin: 6px 0; }
        th, td { border: 1px solid #ddd; padding: 3px 5px; text-align: left; font-size: 10px; }
        th { background: #f5f5f5; font-weight: 600; }
        .right { text-align: right; }
        .totals { text-align: right; font-size: 10px; }
        .totals p { margin: 1px 0; }
        .totals .grand { font-size: 13px; font-weight: 700; margin-top: 3px; }
        .status-row { margin: 6px 0; padding: 5px 10px; border-radius: 4px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px; }
        .signature { display: flex; justify-content: space-between; margin-top: 10px; gap: 20px; }
        .sig-box { flex: 1; }
        .sig-line { border-bottom: 1px solid #333; height: 20px; }
        .sig-label { font-size: 9px; color: #666; margin-top: 2px; text-align: center; }
        .footer { text-align: center; font-size: 8px; color: #aaa; margin: 6px 0 0; }
        .cut-line { text-align: center; font-size: 9px; color: #999; letter-spacing: 3px; border-top: 1px dashed #aaa; margin: 8mm 0 6mm; padding-top: 2px; }
        .cut-line::before { content: "✂"; display: inline-block; transform: translateY(-8px); background: #fff; padding: 0 6px; }
        @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      </style>
    </head><body><div class="sheet">
      ${copy('Office Copy — Customer Signed', true)}
      <div class="cut-line"> - - - - - - - - - - - - - - Cut Here - - - - - - - - - - - - - - </div>
      ${copy('Customer Copy', false)}
    </div></body></html>`);
    w.document.close();
    w.print();
  };

  // ── Export challans as CSV with item-level detail ─────────────────────────
  const exportChallansCSV = async () => {
    if (!dateFrom || !dateTo) { addToast('Select a date range in Filters before exporting', 'error'); setShowFilters(true); return; }
    let q = supabase.from('cash_challans').select('challan_number, customer_name, status, subtotal, discount_amount, shipping_charges, round_off, total, amount_paid, payment_mode, payment_date, is_return, notes, tags, created_at, cash_challan_items(sku, description, quantity, price, discount_type, discount_value, discount_amount, total)').neq('status', 'voided');
    if (search) { const s = search.replace(/[%_,().]/g, ''); const num = parseInt(s); if (num && !isNaN(num)) q = q.eq('challan_number', num); else if (s.trim()) q = q.ilike('customer_name', `%${s}%`); }
    if (statusFilter) q = q.eq('status', statusFilter);
    if (tagFilter) q = q.contains('tags', [tagFilter]);
    if (dateFrom) q = q.gte('created_at', dateFrom + 'T00:00:00');
    if (dateTo) q = q.lte('created_at', dateTo + 'T23:59:59');
    q = q.order('created_at', { ascending: false }).limit(5000);
    const { data } = await q;
    if (!data || data.length === 0) { addToast('No challans to export', 'error'); return; }
    const esc = (v: string) => `"${(v || '').replace(/"/g, '""')}"`;
    const header = 'Challan #,Date,Customer,Type,Status,SKU,Description,Qty,Price,Disc Type,Disc Value,Disc Amount,Item Total,Subtotal,Total Discount,Shipping,Round Off,Grand Total,Amount Paid,Payment Mode,Payment Date,Notes,Tags';
    const rows: string[] = [];
    for (const c of data as any[]) {
      const items = c.cash_challan_items || [];
      const base = [c.challan_number, new Date(c.created_at).toLocaleDateString('en-IN'), esc(c.customer_name), c.is_return ? 'Return' : 'Sale', c.status];
      const tail = [c.subtotal, c.discount_amount, c.shipping_charges, c.round_off, c.total, c.amount_paid, esc(c.payment_mode || ''), c.payment_date || '', esc(c.notes || ''), esc((c.tags || []).join(', '))];
      if (items.length === 0) { rows.push([...base, '', '', '', '', '', '', '', ...tail].join(',')); }
      else { for (const it of items) { rows.push([...base, esc(it.sku || ''), esc(it.description || ''), it.quantity, it.price, it.discount_type || '', it.discount_value || 0, it.discount_amount || 0, it.total, ...tail].join(',')); } }
    }
    const csv = header + '\n' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `CashChallans_${dateFrom || 'all'}_${dateTo || 'all'}_${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };

  // ── Bulk pay / unpay ─────────────────────────────────────────────────────
  const selectedChallans = challans.filter(c => selectedIds.has(c.id));
  const bulkPayable = selectedChallans.filter(c => !c.is_return && (c.status === 'unpaid' || c.status === 'partial'));
  const bulkUnpayable = selectedChallans.filter(c => !c.is_return && c.status === 'paid');
  const bulkReturns = selectedChallans.filter(c => c.is_return);
  const bulkSalesOutstanding = bulkPayable.reduce((s, c) => s + (Number(c.total) - Number(c.amount_paid || 0)), 0);
  const bulkReturnsTotal = bulkReturns.reduce((s, c) => s + Number(c.total), 0);
  const bulkNetTotal = bulkSalesOutstanding - bulkReturnsTotal;

  const toggleSelect = (id: string) => setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selectAll = () => setSelectedIds(new Set(challans.filter(c => c.status !== 'voided' && c.status !== 'draft').map(c => c.id)));
  const clearSelection = () => { setSelectedIds(new Set()); };
  const exitBulkMode = () => { setBulkMode(false); clearSelection(); };

  const executeBulkPay = async () => {
    if (!bulkPayMode) return;
    const today = new Date().toISOString().slice(0, 10);
    const { data: { user } } = await supabase.auth.getUser();
    const ids = bulkPayable.map(c => c.id);
    if (ids.length === 0) { setShowBulkPay(false); return; }
    const batchId = `BP-${Date.now().toString(36).toUpperCase()}`;
    const isRefund = bulkNetTotal < 0;
    const received = Number(bulkReceivedAmount) || Math.abs(bulkNetTotal);
    const receiptNote = isRefund
      ? `Batch ${batchId} — settled ₹${bulkSalesOutstanding.toLocaleString('en-IN')} outstanding against ₹${bulkReturnsTotal.toLocaleString('en-IN')} returns. Refunded ₹${received.toLocaleString('en-IN')} to customer via ${bulkPayMode}`
      : `Batch ${batchId} — received ₹${received.toLocaleString('en-IN')} against ₹${bulkNetTotal.toLocaleString('en-IN')} outstanding${received !== bulkNetTotal ? ` (${received > bulkNetTotal ? 'excess' : 'short'} ₹${Math.abs(received - bulkNetTotal).toLocaleString('en-IN')})` : ''}`;
    for (const c of bulkPayable) {
      const outstanding = Number(c.total) - Number(c.amount_paid || 0);
      await supabase.from('cash_challans').update({
        status: 'paid', amount_paid: Number(c.total), payment_mode: bulkPayMode,
        payment_date: today, modified_by: user?.id, updated_at: new Date().toISOString(),
      }).eq('id', c.id).in('status', ['unpaid', 'partial']);
      if (outstanding > 0) {
        await supabase.from('cash_challan_payments').insert({
          challan_id: c.id, amount: outstanding, payment_mode: bulkPayMode,
          payment_date: today, paid_by: user?.id, notes: receiptNote, batch_id: batchId,
        });
      }
    }
    for (const c of bulkPayable) await ccAuditLog(isRefund ? 'SETTLE_REFUND' : 'BULK_PAY', c.id, `${isRefund ? 'Settled against returns' : 'Bulk paid'} (${batchId}) — ₹${(Number(c.total) - Number(c.amount_paid || 0)).toLocaleString('en-IN')} via ${bulkPayMode}`, { status: { from: c.status, to: 'paid' }, amount_paid: { from: c.amount_paid, to: c.total }, ...(isRefund ? { refunded: { from: 0, to: received } } : { received_amount: { from: Math.abs(bulkNetTotal), to: received } }) });
    setLastBatch({ id: batchId, count: ids.length, mode: bulkPayMode });
    setShowBulkPay(false); setBulkPayMode(''); setBulkReceivedAmount(''); exitBulkMode(); fetchChallans();
    addToast(isRefund ? `Settled ${ids.length} challans, refunded ₹${received.toLocaleString('en-IN')} (${batchId})` : `${ids.length} challans marked as paid (${batchId})`, 'success');
  };

  const undoBatch = async (batchId: string) => {
    const { data: batchPayments } = await supabase.from('cash_challan_payments').select('challan_id, amount, payment_mode').eq('batch_id', batchId).eq('is_reversal', false);
    if (!batchPayments || batchPayments.length === 0) { addToast('No payments found for this batch', 'error'); return; }
    const today = new Date().toISOString().slice(0, 10);
    const { data: { user } } = await supabase.auth.getUser();
    const undoBatchId = `BU-${Date.now().toString(36).toUpperCase()}`;
    for (const p of batchPayments) {
      await supabase.from('cash_challans').update({ status: 'unpaid', amount_paid: 0, payment_mode: null, payment_date: null, modified_by: user?.id, updated_at: new Date().toISOString() }).eq('id', p.challan_id).eq('status', 'paid');
      await supabase.from('cash_challan_payments').insert({ challan_id: p.challan_id, amount: Number(p.amount), payment_mode: p.payment_mode, payment_date: today, paid_by: user?.id, notes: `Undo ${batchId}`, is_reversal: true, batch_id: undoBatchId });
      await ccAuditLog('BATCH_UNDO', p.challan_id, `Undo batch ${batchId} (reversal ${undoBatchId})`, { status: { from: 'paid', to: 'unpaid' }, amount_paid: { from: p.amount, to: 0 } });
    }
    setLastBatch(null);
    fetchChallans();
    addToast(`Batch ${batchId} reversed — ${batchPayments.length} challans unpaid`, 'success');
  };

  const executeBulkUnpay = async () => {
    const today = new Date().toISOString().slice(0, 10);
    const { data: { user } } = await supabase.auth.getUser();
    const ids = bulkUnpayable.map(c => c.id);
    if (ids.length === 0) { setShowBulkUnpay(false); return; }
    const undoBatchId = `BU-${Date.now().toString(36).toUpperCase()}`;
    for (const c of bulkUnpayable) {
      await supabase.from('cash_challans').update({
        status: 'unpaid', amount_paid: 0, payment_mode: null, payment_date: null,
        modified_by: user?.id, updated_at: new Date().toISOString(),
      }).eq('id', c.id).eq('status', 'paid');
      await supabase.from('cash_challan_payments').insert({
        challan_id: c.id, amount: Number(c.amount_paid || c.total), payment_mode: c.payment_mode || 'Cash',
        payment_date: today, paid_by: user?.id, notes: 'Bulk unpay reversal', is_reversal: true, batch_id: undoBatchId,
      });
    }
    for (const c of bulkUnpayable) await ccAuditLog('BULK_UNPAY', c.id, `Bulk unpaid (${undoBatchId}) — was ₹${Number(c.amount_paid || c.total).toLocaleString('en-IN')}`, { status: { from: 'paid', to: 'unpaid' }, amount_paid: { from: c.amount_paid, to: 0 } });
    setShowBulkUnpay(false); exitBulkMode(); fetchChallans();
    addToast(`${ids.length} challans reverted to unpaid`, 'success');
  };

  const totalPages = Math.ceil(totalCount / pageSize);
  const allTags = [...new Set(challans.flatMap(c => c.tags || []))];

  // Ledger PDF modal — must be ABOVE all early returns so it renders
  // when showLedger is true. It's position:fixed so it overlays any view.
  const pdfModal = ledgerPdfHtml ? (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setLedgerPdfHtml(null)}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: 'min(900px, 100%)', maxHeight: '92vh', display: 'flex', flexDirection: 'column' as const, overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,.6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#111', fontFamily: T.sora }}>Ledger — {ledgerPdfTitle}</div>
            <div style={{ fontSize: 11, color: '#6B7890' }}>Preview. Click Print to save as PDF.</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => { ledgerPdfIframeRef.current?.contentWindow?.print(); }} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: `linear-gradient(135deg, ${T.ac}, ${T.ac2})`, color: '#fff', boxShadow: '0 2px 10px rgba(99,102,241,.3)' }}>Print / Save as PDF</button>
            <button onClick={() => setLedgerPdfHtml(null)} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', color: '#374151', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>Close</button>
          </div>
        </div>
        <iframe ref={ledgerPdfIframeRef} title="Ledger PDF preview" srcDoc={ledgerPdfHtml} style={{ flex: 1, width: '100%', minHeight: 460, border: 'none', background: '#fff' }} />
      </div>
    </div>
  ) : null;

  // ── Cash Book Screen ───────────────────────────────────────────────────────
  if (showCashBook) return (
    <div>{pdfModal}<CashBook /></div>
  );

  // ── Analytics Screen ───────────────────────────────────────────────────────
  if (showAnalytics) return (
    <>{pdfModal}<ChallanAnalytics
      analytics={analytics}
      from={analyticsFrom}
      to={analyticsTo}
      onFromChange={setAnalyticsFrom}
      onToChange={setAnalyticsTo}
      onApply={fetchAnalytics}
    /></>
  );

  // ── Ledger (list + detail) — extracted to components/challan/ChallanLedger.tsx ──
  if (showLedger) return (
    <>{pdfModal}<ChallanLedger
      detailName={ledgerDetail}
      customers={ledgerCustomers}
      detailChallans={ledgerChallans as any}
      search={ledgerSearch}
      onSearchChange={setLedgerSearch}
      onSearchSubmit={searchLedgerCustomer}
      onOpenCustomer={fetchLedgerDetail}
      onOpenChallan={openEdit}
      onExportPdf={exportLedgerPDF}
      onLoadMore={() => { const newLimit = ledgerFetchLimit + 500; setLedgerFetchLimit(newLimit); fetchLedger(newLimit); }}
      statusColors={STATUS_COLORS}
      dateFrom={ledgerFrom}
      dateTo={ledgerTo}
      onDateFromChange={(v) => { setLedgerFrom(v); }}
      onDateToChange={(v) => { setLedgerTo(v); }}
      onDateApply={(from?: string, to?: string) => {
        const f = from ?? ledgerFrom;
        const t = to ?? ledgerTo;
        if (from !== undefined) setLedgerFrom(from);
        if (to !== undefined) setLedgerTo(to);
        if (ledgerDetail) fetchLedgerDetailWithRange(ledgerDetail, f, t);
      }}
    /></>
  );

  // ── Create/Edit Modal — extracted to components/challan/ChallanForm.tsx ──
  if (showModal) return (
    <ChallanForm
      editing={editing}
      isReturn={isReturn}
      setIsReturn={(v) => { setIsReturn(v); if (v) setChallanStatus('paid'); }}
      returnSource={returnSource}
      returnSearchQ={returnSearchQ}
      setReturnSearchQ={setReturnSearchQ}
      returnResults={returnResults}
      searchReturnSource={searchReturnSource}
      selectReturnSource={selectReturnSource}
      onClearReturnSource={() => { setReturnSource(null); setCustomerName(''); setSelectedCustomerId(null); setItems([{ sku: '', description: '', quantity: 1, price: 0, total: 0, discount_type: 'flat', discount_value: 0, discount_amount: 0 }]); }}
      customerName={customerName}
      setCustomerName={setCustomerName}
      customerPhone={customerPhone}
      setCustomerPhone={setCustomerPhone}
      selectedCustomerId={selectedCustomerId}
      setSelectedCustomerId={setSelectedCustomerId}
      customerSuggestions={customerSuggestions}
      setCustomerSuggestions={setCustomerSuggestions}
      searchCustomers={searchCustomers}
      items={items}
      setItems={setItems}
      itemValidationError={itemValidationError}
      shippingCharges={shippingCharges}
      setShippingCharges={setShippingCharges}
      tags={tags}
      setTags={setTags}
      notes={notes}
      setNotes={setNotes}
      paymentMode={paymentMode}
      setPaymentMode={setPaymentMode}
      paymentDate={paymentDate}
      setPaymentDate={setPaymentDate}
      amountPaid={amountPaid}
      setAmountPaid={setAmountPaid}
      challanStatus={challanStatus}
      setChallanStatus={setChallanStatus}
      subtotal={subtotal}
      totalDiscount={totalDiscount}
      roundOff={roundOff}
      grandTotal={grandTotal}
      auditTrail={auditTrail}
      setAuditTrail={setAuditTrail}
      loadAuditTrail={loadAuditTrail}
      onClose={closeModal}
      onSave={saveChallan}
      formError={formError}
    />
  );

  // ── List View ──────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: T.sans, color: T.tx, padding: '14px 16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600, fontFamily: T.sora }}>Cash Challan</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => { setShowCashBook(true); window.history.pushState({ view: 'cashbook' }, ''); }} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(34,197,94,.2)', background: 'rgba(34,197,94,.08)', color: T.gr, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>Cash Book</button>
          <button onClick={() => { fetchLedger(); setShowLedger(true); window.history.pushState({ view: 'ledger' }, ''); }} style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${T.bd2}`, background: 'rgba(255,255,255,0.03)', color: T.tx3, fontSize: 10, fontWeight: 500, cursor: 'pointer' }}>Ledger</button>
          <button onClick={() => { fetchAnalytics(); setShowAnalytics(true); window.history.pushState({ view: 'analytics' }, ''); }} style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${T.bd2}`, background: 'rgba(255,255,255,0.03)', color: T.tx3, fontSize: 10, fontWeight: 500, cursor: 'pointer' }}>Analytics</button>
          <button onClick={() => setShowModal(true)} style={{ padding: '4px 12px', borderRadius: 6, border: 'none', background: `linear-gradient(135deg, ${T.ac}dd, ${T.ac2}cc)`, color: '#fff', fontSize: 10, fontWeight: 600, cursor: 'pointer', boxShadow: '0 2px 8px rgba(99,102,241,.25)' }}>+ New</button>
        </div>
      </div>

      {/* Row 1: Search + Actions */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
        <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Search name or #..." style={{ flex: 1, minWidth: 120, background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd2}`, borderRadius: 6, color: T.tx, fontSize: 11, padding: '7px 10px', outline: 'none' }} />
        <button onClick={() => setShowFilters(f => !f)} style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${showFilters || statusFilter || tagFilter || dateFrom || dateTo ? T.ac + '44' : T.bd2}`, background: showFilters ? 'rgba(99,102,241,.08)' : 'rgba(255,255,255,0.03)', color: showFilters || statusFilter || tagFilter || dateFrom || dateTo ? T.ac2 : T.tx3, fontSize: 10, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
          <svg viewBox="0 0 24 24" style={{ width: 12, height: 12, fill: 'none', stroke: 'currentColor', strokeWidth: 2 }}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
          Filters{(statusFilter || tagFilter || dateFrom || dateTo) ? ` (${[statusFilter, tagFilter, dateFrom, dateTo].filter(Boolean).length})` : ''}
        </button>
        <button onClick={exportChallansCSV} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid rgba(34,197,94,.2)', background: 'rgba(34,197,94,.06)', color: T.gr, fontSize: 10, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>Export</button>
        <button onClick={() => { if (bulkMode) exitBulkMode(); else setBulkMode(true); }} style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${bulkMode ? T.ac + '44' : T.bd2}`, background: bulkMode ? 'rgba(99,102,241,.1)' : 'rgba(255,255,255,0.03)', color: bulkMode ? T.ac2 : T.tx3, fontSize: 10, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>{bulkMode ? 'Cancel' : '☑ Select'}</button>
      </div>

      {/* Row 2: Collapsible filters */}
      {showFilters && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center', padding: '8px 10px', background: 'rgba(255,255,255,0.015)', border: `1px solid ${T.bd}`, borderRadius: 6 }}>
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(0); }} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd2}`, borderRadius: 5, color: T.tx, fontSize: 10, padding: '5px 8px', outline: 'none' }}>
            <option value="">All Status</option><option value="draft">Draft</option><option value="paid">Paid</option><option value="unpaid">Unpaid</option><option value="partial">Partial</option><option value="voided">Voided</option>
          </select>
          {allTags.length > 0 && <select value={tagFilter} onChange={e => { setTagFilter(e.target.value); setPage(0); }} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd2}`, borderRadius: 5, color: T.tx, fontSize: 10, padding: '5px 8px', outline: 'none' }}>
            <option value="">All Tags</option>{allTags.map(t => <option key={t} value={t}>{t}</option>)}
          </select>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 9, color: T.tx3, fontWeight: 600 }}>From</span>
            <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(0); }} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd2}`, borderRadius: 5, color: T.tx, fontSize: 10, padding: '4px 6px', outline: 'none' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 9, color: T.tx3, fontWeight: 600 }}>To</span>
            <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(0); }} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd2}`, borderRadius: 5, color: T.tx, fontSize: 10, padding: '4px 6px', outline: 'none' }} />
          </div>
          <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(0); }} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd2}`, borderRadius: 5, color: T.tx, fontSize: 10, padding: '5px 6px', outline: 'none', width: 48 }}>
            <option value={25}>25</option><option value={50}>50</option><option value={100}>100</option>
          </select>
          {(statusFilter || tagFilter || dateFrom || dateTo) && <button onClick={() => { setStatusFilter(''); setTagFilter(''); setDateFrom(''); setDateTo(''); setPage(0); }} style={{ padding: '4px 8px', borderRadius: 5, border: `1px solid ${T.bd2}`, background: 'rgba(255,255,255,0.03)', color: T.tx3, fontSize: 9, cursor: 'pointer' }}>Clear all</button>}
        </div>
      )}

      {/* Bulk mode toolbar */}
      {bulkMode && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap', padding: '6px 10px', background: 'rgba(99,102,241,.04)', border: `1px solid rgba(99,102,241,.12)`, borderRadius: 6 }}>
          <span style={{ fontSize: 10, color: T.tx2, fontWeight: 600 }}>{selectedIds.size} selected</span>
          <button onClick={selectAll} style={{ padding: '3px 8px', borderRadius: 4, border: `1px solid ${T.bd2}`, background: 'rgba(255,255,255,0.03)', color: T.tx3, fontSize: 9, cursor: 'pointer' }}>Select All</button>
          <button onClick={clearSelection} style={{ padding: '3px 8px', borderRadius: 4, border: `1px solid ${T.bd2}`, background: 'rgba(255,255,255,0.03)', color: T.tx3, fontSize: 9, cursor: 'pointer' }}>Clear</button>
          <div style={{ flex: 1 }} />
          {bulkPayable.length > 0 && <button onClick={() => { setBulkPayMode(''); setBulkReceivedAmount(''); setShowBulkPay(true); }} style={{ padding: '4px 12px', borderRadius: 5, border: 'none', background: T.gr, color: '#fff', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>Bulk Pay ({bulkPayable.length})</button>}
          {bulkUnpayable.length > 0 && <button onClick={() => setShowBulkUnpay(true)} style={{ padding: '4px 12px', borderRadius: 5, border: '1px solid rgba(245,158,11,.3)', background: 'rgba(245,158,11,.08)', color: T.yl, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>Bulk Unpay ({bulkUnpayable.length})</button>}
        </div>
      )}

      {lastBatch && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', marginBottom: 8, background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.15)', borderRadius: 6 }}>
          <span style={{ fontSize: 10, color: T.gr, fontWeight: 600, flex: 1 }}>{lastBatch.id}: {lastBatch.count} challans paid via {lastBatch.mode}</span>
          <button disabled={undoingBatch} onClick={async () => { setUndoingBatch(true); await undoBatch(lastBatch.id); setUndoingBatch(false); }} style={{ padding: '4px 10px', borderRadius: 5, border: '1px solid rgba(239,68,68,.3)', background: 'rgba(239,68,68,.08)', color: T.re, fontSize: 10, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>{undoingBatch ? 'Undoing...' : 'Undo Batch'}</button>
          <span onClick={() => setLastBatch(null)} style={{ cursor: 'pointer', color: T.tx3, fontSize: 14 }}>&times;</span>
        </div>
      )}
      <div style={{ fontSize: 9, color: T.tx3, marginBottom: 6 }}>{totalCount} records</div>

      {/* Table */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, overflow: 'hidden' }}>
        {loading && <div style={{ padding: 20, textAlign: 'center', color: T.tx3, fontSize: 11 }}>Loading...</div>}
        {!loading && challans.length === 0 && <div style={{ padding: 14 }}><Empty icon="🧾" title="No challans yet" message="Create your first challan — invoice customers, record payments, and track outstanding amounts all from one place." cta="+ New Challan" onCta={() => setShowModal(true)} /></div>}
        {challans.map(c => {
          const sc = STATUS_COLORS[c.status] || STATUS_COLORS.unpaid;
          const skus = (c.cash_challan_items || []).map((i) => i.sku).filter(Boolean).join(', ');
          const pendingDays = (!c.is_return && (c.status === 'unpaid' || c.status === 'partial')) ? Math.floor((Date.now() - new Date(c.created_at).getTime()) / 86400000) : 0;
          const isRet = !!c.is_return;
          const isSelected = selectedIds.has(c.id);
          const canSelect = c.status !== 'voided' && c.status !== 'draft';
          const rowBg = isSelected ? 'rgba(99,102,241,.08)' : isRet ? 'rgba(239,68,68,.04)' : undefined;
          return (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderBottom: `1px solid ${T.bd}`, cursor: 'pointer', background: rowBg, transition: 'background .15s' }} onClick={() => bulkMode ? (canSelect && toggleSelect(c.id)) : setViewingChallan(c)} onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = isRet ? 'rgba(239,68,68,.08)' : 'rgba(255,255,255,.02)'; }} onMouseLeave={e => { e.currentTarget.style.background = (isSelected ? 'rgba(99,102,241,.08)' : isRet ? 'rgba(239,68,68,.04)' : '') }}>
              {bulkMode && <div onClick={e => { e.stopPropagation(); if (canSelect) toggleSelect(c.id); }} style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${canSelect ? (isSelected ? T.ac : T.bd2) : T.bd}`, background: isSelected ? T.ac : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: canSelect ? 'pointer' : 'not-allowed', opacity: canSelect ? 1 : 0.3 }}>
                {isSelected && <svg viewBox="0 0 24 24" style={{ width: 12, height: 12, fill: 'none', stroke: '#fff', strokeWidth: 3 }}><polyline points="20 6 9 17 4 12" /></svg>}
              </div>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 10, fontFamily: T.mono, color: T.tx3 }}>#{c.challan_number}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: T.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.customer_name}</span>
                  {isRet && <span style={{ fontSize: 7, padding: '1px 5px', borderRadius: 3, background: 'rgba(239,68,68,.12)', color: T.re, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>↩ Return</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 9, color: T.tx3 }}>{new Date(c.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                  <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 3, background: sc.bg, color: sc.color, fontWeight: 600, textTransform: 'uppercase' }}>{c.status}</span>
                  {pendingDays > 0 && <span style={{ fontSize: 8, color: T.re, fontWeight: 600 }}>({pendingDays}d pending)</span>}
                  {(c.tags || []).map(t => <span key={t} style={{ fontSize: 7, padding: '1px 4px', borderRadius: 3, background: 'rgba(99,102,241,.08)', color: T.ac2 }}>{t}</span>)}
                </div>
                {skus && <div style={{ fontSize: 9, fontFamily: T.mono, color: T.tx3, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{skus}</div>}
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, fontFamily: T.mono, color: isRet ? T.re : T.tx }}>{isRet ? '−' : ''}₹{Number(c.total).toLocaleString('en-IN')}</div>
                {(c.status === 'paid' || c.status === 'partial') && Number(c.amount_paid || 0) > 0 && (() => {
                  const paid = Number(c.amount_paid);
                  const due = Math.max(0, Number(c.total) - paid);
                  return (
                    <div style={{ fontSize: 9, fontFamily: T.mono, marginTop: 2, color: c.status === 'paid' ? T.gr : T.yl }}>
                      ₹{paid.toLocaleString('en-IN')} paid{c.status === 'partial' && due > 0 ? ` · ₹${due.toLocaleString('en-IN')} due` : ''}
                    </div>
                  );
                })()}
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <button onClick={e => { e.stopPropagation(); printChallan(c); }} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 2, opacity: 0.5 }}>
                  <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'none', stroke: T.tx2, strokeWidth: 2 }}><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z" /></svg>
                </button>
                {(c.status === 'unpaid' || c.status === 'partial') && <button onClick={e => { e.stopPropagation(); sendReminder(c); }} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 2, opacity: 0.6 }} title="Send WhatsApp reminder">
                  <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'none', stroke: T.yl, strokeWidth: 2 }}><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" /></svg>
                </button>}
                {!isRet && c.status !== 'voided' && c.status !== 'draft' && <button onClick={e => { e.stopPropagation(); setIsReturn(true); setChallanStatus('paid'); selectReturnSource(c); setShowModal(true); }} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 2, opacity: 0.6 }} title="Create return for this challan">
                  <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'none', stroke: T.re, strokeWidth: 2 }}><path d="M9 14L4 9l5-5M4 9h11a5 5 0 015 5v0a5 5 0 01-5 5H8" /></svg>
                </button>}
                {c.status !== 'voided' && <button onClick={e => { e.stopPropagation(); setConfirmAction({ type: 'void', id: c.id, challanNumber: c.challan_number }); }} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 2, opacity: 0.4 }} title="Void">
                  <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'none', stroke: T.re, strokeWidth: 2 }}><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Audit Trail Modal */}
      {auditTrail && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(8px)', padding: 16 }}>
          <div style={{ background: 'rgba(14,18,30,.96)', border: `1px solid ${T.bd2}`, borderRadius: 14, padding: '18px 16px', maxWidth: 420, width: '100%', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: T.tx, fontFamily: T.sora }}>Audit Trail</span>
              <button onClick={() => setAuditTrail(null)} style={{ padding: '3px 10px', borderRadius: 5, border: `1px solid ${T.bd2}`, background: 'rgba(255,255,255,0.03)', color: T.tx3, fontSize: 10, cursor: 'pointer' }}>Close</button>
            </div>
            {auditTrail.length === 0 && <div style={{ padding: 16, textAlign: 'center', color: T.tx3, fontSize: 11 }}>No history for this challan.</div>}
            {auditTrail.map(a => (
              <div key={a.id} style={{ padding: '8px 10px', borderBottom: `1px solid ${T.bd}`, fontSize: 11 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                  <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 3, background: a.action === 'VOID' ? 'rgba(239,68,68,.12)' : a.action === 'CREATE' ? 'rgba(34,197,94,.12)' : 'rgba(99,102,241,.12)', color: a.action === 'VOID' ? T.re : a.action === 'CREATE' ? T.gr : T.ac2, fontWeight: 700 }}>{a.action}</span>
                  <span style={{ fontSize: 9, color: T.tx3, fontFamily: T.mono }}>{a.created_at ? new Date(a.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                </div>
                <div style={{ color: T.tx2, fontSize: 11 }}>{a.details}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bulk Pay Modal */}
      {showBulkPay && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(8px)', padding: 16 }} onClick={() => setShowBulkPay(false)}>
          <div style={{ background: 'rgba(14,18,30,.96)', border: `1px solid ${T.bd2}`, borderRadius: 14, padding: '20px 18px', maxWidth: 420, width: '100%' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.tx, fontFamily: T.sora, marginBottom: 12 }}>{bulkNetTotal < 0 ? 'Settle & Refund' : 'Bulk Pay'}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12, fontSize: 11 }}>
              <div style={{ background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.15)', borderRadius: 6, padding: '8px 10px' }}>
                <div style={{ fontSize: 8, color: T.gr, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600, marginBottom: 2 }}>Outstanding ({bulkPayable.length})</div>
                <div style={{ fontSize: 15, fontWeight: 700, fontFamily: T.mono, color: T.gr }}>₹{bulkSalesOutstanding.toLocaleString('en-IN')}</div>
              </div>
              <div style={{ background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.15)', borderRadius: 6, padding: '8px 10px' }}>
                <div style={{ fontSize: 8, color: T.re, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600, marginBottom: 2 }}>Returns ({bulkReturns.length})</div>
                <div style={{ fontSize: 15, fontWeight: 700, fontFamily: T.mono, color: T.re }}>₹{bulkReturnsTotal.toLocaleString('en-IN')}</div>
              </div>
            </div>
            <div style={{ background: bulkNetTotal >= 0 ? 'rgba(99,102,241,.06)' : 'rgba(239,68,68,.06)', border: `1px solid ${bulkNetTotal >= 0 ? 'rgba(99,102,241,.15)' : 'rgba(239,68,68,.15)'}`, borderRadius: 8, padding: '10px 14px', marginBottom: 14, textAlign: 'center' }}>
              <div style={{ fontSize: 8, color: bulkNetTotal >= 0 ? T.ac2 : T.re, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600, marginBottom: 2 }}>{bulkNetTotal >= 0 ? 'Net Amount' : 'You Owe Customer'}</div>
              <div style={{ fontSize: 20, fontWeight: 800, fontFamily: T.sora, color: bulkNetTotal >= 0 ? T.gr : T.re }}>₹{Math.abs(bulkNetTotal).toLocaleString('en-IN')}</div>
              {bulkNetTotal < 0 && <div style={{ fontSize: 9, color: T.tx3, marginTop: 4 }}>Returns exceed outstanding. Sales will be settled against returns, refund the difference.</div>}
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', fontSize: 9, fontWeight: 600, color: T.tx3, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>{bulkNetTotal < 0 ? 'Amount Refunded to Customer' : 'Amount Received from Customer'}</label>
              <input type="number" value={bulkReceivedAmount} onChange={e => setBulkReceivedAmount(e.target.value)} placeholder={String(Math.abs(bulkNetTotal))} style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd2}`, borderRadius: 6, color: T.tx, fontFamily: T.mono, fontSize: 14, padding: '8px 10px', outline: 'none', boxSizing: 'border-box' }} />
              {(() => { const recv = Number(bulkReceivedAmount) || 0; const expected = Math.abs(bulkNetTotal); const diff = recv - expected; if (!bulkReceivedAmount || diff === 0) return null; return <div style={{ marginTop: 4, fontSize: 10, color: T.yl, fontWeight: 600 }}>₹{Math.abs(diff).toLocaleString('en-IN')} {diff > 0 ? 'more than expected' : 'less than expected'}</div>; })()}
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 9, fontWeight: 600, color: T.tx3, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>{bulkNetTotal < 0 ? 'Refund Mode' : 'Payment Mode'}</label>
              <select value={bulkPayMode} onChange={e => setBulkPayMode(e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd2}`, borderRadius: 6, color: T.tx, fontSize: 12, padding: '8px 10px', outline: 'none' }}>
                <option value="">Select...</option>{PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowBulkPay(false)} style={{ flex: 1, padding: '9px 0', borderRadius: 6, border: `1px solid ${T.bd2}`, background: 'rgba(255,255,255,0.03)', color: T.tx3, fontSize: 11, fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
              <button onClick={executeBulkPay} disabled={!bulkPayMode || bulkPayable.length === 0} style={{ flex: 1, padding: '9px 0', borderRadius: 6, border: 'none', background: bulkPayMode ? (bulkNetTotal < 0 ? T.re : T.gr) : 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: bulkPayMode ? 'pointer' : 'default', opacity: bulkPayMode ? 1 : 0.4 }}>{bulkNetTotal < 0 ? 'Settle & Refund' : 'Confirm Pay'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Unpay Modal */}
      {showBulkUnpay && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(8px)', padding: 16 }} onClick={() => setShowBulkUnpay(false)}>
          <div style={{ background: 'rgba(14,18,30,.96)', border: `1px solid ${T.bd2}`, borderRadius: 14, padding: '20px 18px', maxWidth: 400, width: '100%' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.tx, fontFamily: T.sora, marginBottom: 8 }}>Bulk Unpay</div>
            <div style={{ fontSize: 11, color: T.tx3, marginBottom: 12 }}>This will revert <strong style={{ color: T.yl }}>{bulkUnpayable.length}</strong> challan{bulkUnpayable.length !== 1 ? 's' : ''} to unpaid and clear their payment info. Returns cannot be unpaid.</div>
            <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 6, maxHeight: 160, overflowY: 'auto', marginBottom: 14 }}>
              {bulkUnpayable.map(c => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderBottom: `1px solid ${T.bd}`, fontSize: 10 }}>
                  <span style={{ color: T.tx }}>#{c.challan_number} · {c.customer_name}</span>
                  <span style={{ fontFamily: T.mono, color: T.tx2 }}>₹{Number(c.total).toLocaleString('en-IN')}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowBulkUnpay(false)} style={{ flex: 1, padding: '9px 0', borderRadius: 6, border: `1px solid ${T.bd2}`, background: 'rgba(255,255,255,0.03)', color: T.tx3, fontSize: 11, fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
              <button onClick={executeBulkUnpay} style={{ flex: 1, padding: '9px 0', borderRadius: 6, border: 'none', background: T.yl, color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Confirm Unpay</button>
            </div>
          </div>
        </div>
      )}

      {/* Challan Detail View — read-only, opens before edit */}
      {viewingChallan && <ChallanDetail
        challan={viewingChallan}
        onClose={() => setViewingChallan(null)}
        onEdit={() => { const c = viewingChallan; setViewingChallan(null); openEdit(c); }}
        onPrint={() => printChallan(viewingChallan)}
        onRemind={() => { const c = viewingChallan; setViewingChallan(null); sendReminder(c); }}
        onReturn={() => { const c = viewingChallan; setViewingChallan(null); setIsReturn(true); setChallanStatus('paid'); selectReturnSource(c); setShowModal(true); }}
        onVoid={() => { const c = viewingChallan; setViewingChallan(null); setConfirmAction({ type: 'void', id: c.id, challanNumber: c.challan_number }); }}
      />}

      {/* WhatsApp Phone Prompt Modal */}
      {reminderChallan && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(8px)', padding: 16 }}>
          <div style={{ background: 'rgba(14,18,30,.96)', border: `1px solid ${T.bd2}`, borderRadius: 14, padding: '20px 18px', maxWidth: 360, width: '100%' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.tx, fontFamily: T.sora, marginBottom: 4 }}>Add Customer Phone</div>
            <div style={{ fontSize: 11, color: T.tx3, marginBottom: 12 }}>No phone saved for <strong style={{ color: T.tx }}>{reminderChallan.customer_name}</strong>. Enter a 10-digit mobile to send reminder:</div>
            <input type="tel" value={reminderPhone} onChange={e => setReminderPhone(e.target.value)} placeholder="9876543210" autoFocus style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd2}`, borderRadius: 6, color: T.tx, fontFamily: T.mono, fontSize: 14, padding: '8px 10px', outline: 'none', boxSizing: 'border-box', marginBottom: 12 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setReminderChallan(null)} style={{ flex: 1, padding: '8px 0', borderRadius: 6, border: '1px solid rgba(99,102,241,0.15)', fontSize: 11, fontWeight: 500, background: 'rgba(99,102,241,0.06)', color: T.ac2, cursor: 'pointer' }}>Cancel</button>
              <button onClick={saveReminderPhone} disabled={!reminderPhone.trim()} style={{ flex: 1, padding: '8px 0', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 600, background: reminderPhone.trim() ? `linear-gradient(135deg, ${T.gr}, ${T.gr}cc)` : 'rgba(255,255,255,.05)', color: '#fff', cursor: reminderPhone.trim() ? 'pointer' : 'not-allowed' }}>Send</button>
            </div>
          </div>
        </div>
      )}

      {/* ERP Reminder Modal */}
      {showErpReminder && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(8px)', padding: 16 }}>
          <div style={{ background: 'rgba(14,18,30,.96)', border: `1px solid ${T.bd2}`, borderRadius: 14, padding: '24px 22px', textAlign: 'center', maxWidth: 380, width: '100%' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>📋</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.tx, fontFamily: T.sora, marginBottom: 8 }}>Hi {userName}!</div>
            <div style={{ fontSize: 12, color: T.tx2, lineHeight: 1.5, marginBottom: 18 }}>Reminder to manually <strong style={{ color: T.yl }}>reduce these inventory items in ERP</strong>. Cash Challan does not sync inventory automatically.</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { localStorage.setItem('ccErpReminderHidden', String(Date.now())); setShowErpReminder(false); }} style={{ flex: 1, padding: '10px', borderRadius: 8, border: `1px solid ${T.bd2}`, fontSize: 11, fontWeight: 500, background: 'rgba(255,255,255,0.03)', color: T.tx3, cursor: 'pointer' }}>Don't show for a week</button>
              <button onClick={() => setShowErpReminder(false)} style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700, background: `linear-gradient(135deg, ${T.ac}, ${T.ac2})`, color: '#fff', cursor: 'pointer' }}>Got It</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Action Modal */}
      {confirmAction && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(8px)', padding: 16 }}>
          <div style={{ background: 'rgba(14,18,30,.96)', border: `1px solid ${T.bd2}`, borderRadius: 14, padding: '20px 18px', textAlign: 'center', maxWidth: 340, width: '100%' }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>⚠️</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.tx, fontFamily: T.sora, marginBottom: 4 }}>{confirmAction.type === 'void' ? 'Void Challan?' : 'Delete Challan?'}</div>
            <div style={{ fontSize: 11, color: T.tx3, marginBottom: 14 }}>{confirmAction.type === 'void' ? `Challan #${confirmAction.challanNumber} will be marked voided. This cannot be undone.` : `Challan #${confirmAction.challanNumber} will be permanently deleted.`}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setConfirmAction(null)} style={{ flex: 1, padding: '8px 0', borderRadius: 6, border: '1px solid rgba(99,102,241,0.15)', fontSize: 11, fontWeight: 500, background: 'rgba(99,102,241,0.06)', color: T.ac2, cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => { if (confirmAction.type === 'void') voidChallan(confirmAction.id); setConfirmAction(null); }} style={{ flex: 1, padding: '8px 0', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 600, background: `linear-gradient(135deg, ${T.re}, ${T.re}cc)`, color: '#fff', cursor: 'pointer' }}>{confirmAction.type === 'void' ? 'Void' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: 9, color: T.tx3 }}>Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, totalCount)} of {totalCount}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button onClick={() => setPage(0)} disabled={page === 0} style={{ padding: '3px 7px', borderRadius: 4, border: `1px solid ${T.bd2}`, background: page === 0 ? 'transparent' : 'rgba(255,255,255,0.03)', color: page === 0 ? T.tx3 : T.tx, fontSize: 9, cursor: page === 0 ? 'default' : 'pointer', opacity: page === 0 ? 0.3 : 1 }}>«</button>
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={{ padding: '3px 7px', borderRadius: 4, border: `1px solid ${T.bd2}`, background: page === 0 ? 'transparent' : 'rgba(255,255,255,0.03)', color: page === 0 ? T.tx3 : T.tx, fontSize: 9, cursor: page === 0 ? 'default' : 'pointer', opacity: page === 0 ? 0.3 : 1 }}>‹</button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              let p: number;
              if (totalPages <= 5) p = i;
              else if (page < 3) p = i;
              else if (page > totalPages - 4) p = totalPages - 5 + i;
              else p = page - 2 + i;
              return <button key={p} onClick={() => setPage(p)} style={{ padding: '3px 8px', borderRadius: 4, border: p === page ? `1px solid ${T.ac}44` : `1px solid ${T.bd2}`, background: p === page ? `${T.ac}22` : 'rgba(255,255,255,0.03)', color: p === page ? T.ac2 : T.tx3, fontSize: 9, fontWeight: p === page ? 700 : 400, cursor: 'pointer' }}>{p + 1}</button>;
            })}
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} style={{ padding: '3px 7px', borderRadius: 4, border: `1px solid ${T.bd2}`, background: page >= totalPages - 1 ? 'transparent' : 'rgba(255,255,255,0.03)', color: page >= totalPages - 1 ? T.tx3 : T.tx, fontSize: 9, cursor: page >= totalPages - 1 ? 'default' : 'pointer', opacity: page >= totalPages - 1 ? 0.3 : 1 }}>›</button>
            <button onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1} style={{ padding: '3px 7px', borderRadius: 4, border: `1px solid ${T.bd2}`, background: page >= totalPages - 1 ? 'transparent' : 'rgba(255,255,255,0.03)', color: page >= totalPages - 1 ? T.tx3 : T.tx, fontSize: 9, cursor: page >= totalPages - 1 ? 'default' : 'pointer', opacity: page >= totalPages - 1 ? 0.3 : 1 }}>»</button>
          </div>
        </div>
      )}
    </div>
  );
}
