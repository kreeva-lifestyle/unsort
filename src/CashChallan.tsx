import { useState, useEffect, useCallback, useRef } from 'react';
import CashBook from './CashBook';
import { supabase } from './lib/supabase';
import { useNotifications } from './hooks/useNotifications';
import ChallanAnalytics from './components/challan/ChallanAnalytics';
import ChallanLedger from './components/challan/ChallanLedger';
import ChallanForm from './components/challan/ChallanForm';
import ChallanDetail from './components/challan/ChallanDetail';
import ChallanList from './components/challan/ChallanList';
import ChallanBulkActions from './components/challan/ChallanBulkActions';
import { friendlyError } from './lib/friendlyError';
import { useDebouncedFetch } from './hooks/useDebouncedFetch';
import type {
  CashChallan,
  CashChallanItem as DbCashChallanItem,
  CashChallanCustomer,
  AuditLog,
} from './types/database';

const ccAuditLog = async (action: string, recordId: string, details: string, changes?: Record<string, { from: unknown; to: unknown }>) => {
  const { data: { user } } = await supabase.auth.getUser();
  let userName = user?.email || null;
  if (user) { const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle(); userName = prof?.full_name || userName; }
  await supabase.from('audit_log').insert({ action, module: 'cash_challan', record_id: recordId, details, user_id: user?.id ?? null, user_email: userName, changes: changes || null });
};

import { T, S } from './lib/theme';

const waPhone = (raw: string) => { const d = raw.replace(/\D/g, ''); return '91' + (d.startsWith('91') && d.length > 10 ? d.slice(2) : d); };

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
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkPayMode, setBulkPayMode] = useState('');
  const [bulkReceivedAmount, setBulkReceivedAmount] = useState('');
  const [lastBatch, setLastBatch] = useState<{ id: string; count: number; mode: string } | null>(null);
  const [undoingBatch, setUndoingBatch] = useState(false);

  // Draft auto-save
  const [draftRestored, setDraftRestored] = useState(false);
  const [draftRestoredAt, setDraftRestoredAt] = useState(0);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [currentUserId, setCurrentUserId] = useState('');

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
  const [saving, setSaving] = useState(false);
  const [reminderChallan, setReminderChallan] = useState<Challan | null>(null);
  const [reminderPhone, setReminderPhone] = useState('');

  // Analytics
  const [showErpReminder, setShowErpReminder] = useState(false);
  const [whatsAppShare, setWhatsAppShare] = useState<{ phone: string; url: string } | null>(null);
  // Ledger PDF preview — rendered in an in-app iframe (audit: no popup).
  const [ledgerPdfHtml, setLedgerPdfHtml] = useState<string | null>(null);
  const [ledgerPdfTitle, setLedgerPdfTitle] = useState('');
  const ledgerPdfIframeRef = useRef<HTMLIFrameElement | null>(null);
  const [userName, setUserName] = useState('there');
  const [confirmAction, setConfirmAction] = useState<{ type: 'void' | 'delete'; id: string; challanNumber?: number } | null>(null);
  const [printHtml, setPrintHtml] = useState<string | null>(null);
  const printIframeRef = useRef<HTMLIFrameElement | null>(null);
  const [viewingChallan, setViewingChallan] = useState<Challan | null>(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [analytics, setAnalytics] = useState<{ totalRevenue: number; count: number; byMode: Record<string, number>; returnsCount?: number; voidedCount?: number; prevRevenue?: number; prevCount?: number }>({ totalRevenue: 0, count: 0, byMode: {} });
  const [analyticsFrom, setAnalyticsFrom] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; });
  const [analyticsTo, setAnalyticsTo] = useState(() => new Date().toISOString().slice(0, 10));

  // Ledger
  const [showLedger, setShowLedger] = useState(false);
  const [showCashBook, setShowCashBook] = useState(false);
  const [ledgerCustomers, setLedgerCustomers] = useState<{ name: string; total: number; paid: number; outstanding: number; count: number; aging: { current: number; d30: number; d60: number; d90plus: number } }[]>([]);
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
      if (showModal) { closeModal(); return; }
      if (viewingChallan) { setViewingChallan(null); return; }
      if (ledgerDetail) { setLedgerDetail(null); return; }
      if (showLedger) { setShowLedger(false); setLedgerSearch(''); return; }
      if (showAnalytics) { setShowAnalytics(false); return; }
      if (showCashBook) { setShowCashBook(false); return; }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showModal, viewingChallan, ledgerDetail, showLedger, showAnalytics, showCashBook]);

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
        setCurrentUserId(user.id);
        const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
        setUserName(prof?.full_name || user.email?.split('@')[0] || 'there');
      }
    })();
  }, []);

  // ── Draft auto-save to localStorage ──────────────────────────────────────
  // Saves form state every 2s while the modal is open. Restores on re-open
  // if context matches (new→new, edit→same ID) and user matches. 16 edge
  // cases addressed — see plan file for full analysis.
  const DRAFT_KEY = 'ccDraft';
  const clearDraft = useCallback(() => { try { localStorage.removeItem(DRAFT_KEY); } catch {} setDraftRestored(false); }, []);

  // Auto-save while modal is open
  useEffect(() => {
    if (!showModal) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      if (!customerName && items.length <= 1 && !items[0]?.sku) return;
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({
          savedAt: Date.now(), userId: currentUserId, editingId: editing?.id || null,
          customerName, selectedCustomerId, customerPhone, items, shippingCharges,
          notes, tags, paymentMode, paymentDate, amountPaid, challanStatus, isReturn,
          returnSourceId: returnSource?.id || null, returnSourceNumber: returnSource?.challan_number || null,
        }));
      } catch {}
    }, 2000);
    return () => { if (draftTimerRef.current) clearTimeout(draftTimerRef.current); };
  }, [showModal, customerName, selectedCustomerId, customerPhone, items, shippingCharges, notes, tags, paymentMode, paymentDate, amountPaid, challanStatus, isReturn, currentUserId, editing, returnSource]);

  // Restore draft when modal opens for a NEW challan
  useEffect(() => {
    if (!showModal || editing) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (!d || typeof d !== 'object') { clearDraft(); return; }
      if (d.userId && d.userId !== currentUserId) { clearDraft(); return; }
      if (d.editingId) return; // draft is for an edit, not a new challan
      if (d.savedAt < Date.now() - 24 * 60 * 60 * 1000) { clearDraft(); return; }
      if (!d.customerName && (!d.items || d.items.length === 0)) { clearDraft(); return; }
      setCustomerName(d.customerName || '');
      setSelectedCustomerId(d.selectedCustomerId || null);
      setCustomerPhone(d.customerPhone || '');
      setItems(d.items || [{ sku: '', description: '', quantity: 1, price: 0, total: 0, discount_type: 'flat', discount_value: 0, discount_amount: 0 }]);
      setShippingCharges(d.shippingCharges || 0);
      setNotes(d.notes || '');
      setTags(d.tags || '');
      setPaymentMode(d.paymentMode || '');
      setPaymentDate(d.paymentDate || '');
      setAmountPaid(d.amountPaid || 0);
      setChallanStatus(d.challanStatus || 'unpaid');
      setIsReturn(!!d.isReturn);
      setDraftRestored(true);
      setDraftRestoredAt(d.savedAt);
    } catch { clearDraft(); }
  }, [showModal, editing, currentUserId, clearDraft]);

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
    const { data } = await supabase.from('cash_challans').select('customer_name, total, amount_paid, is_return, created_at, status').neq('status', 'voided').order('created_at', { ascending: false }).limit(limit);
    type LedgerRow = Pick<CashChallan, 'customer_name' | 'total' | 'amount_paid' | 'is_return' | 'created_at' | 'status'>;
    const now = Date.now();
    const daysSince = (d: string) => Math.floor((now - new Date(d).getTime()) / 86400000);
    const map: Record<string, { total: number; paid: number; count: number; latest: string; aging: { current: number; d30: number; d60: number; d90plus: number } }> = {};
    ((data as LedgerRow[] | null) || []).forEach((r) => {
      const name = r.customer_name;
      const sign = r.is_return ? -1 : 1;
      if (!map[name]) map[name] = { total: 0, paid: 0, count: 0, latest: r.created_at ?? '', aging: { current: 0, d30: 0, d60: 0, d90plus: 0 } };
      map[name].total += sign * Number(r.total);
      map[name].paid += sign * Number(r.amount_paid || 0);
      map[name].count++;
      const outstanding = Number(r.total) - Number(r.amount_paid || 0);
      if (!r.is_return && outstanding > 0 && r.status !== 'paid' && r.status !== 'draft') {
        const days = daysSince(r.created_at ?? '');
        if (days <= 30) map[name].aging.current += outstanding;
        else if (days <= 60) map[name].aging.d30 += outstanding;
        else if (days <= 90) map[name].aging.d60 += outstanding;
        else map[name].aging.d90plus += outstanding;
      }
    });
    const list = Object.entries(map).map(([name, v]) => ({ name, total: v.total, paid: v.paid, outstanding: v.total - v.paid, count: v.count, aging: v.aging }));
    list.sort((a, b) => (map[b.name].latest > map[a.name].latest ? 1 : -1));
    setLedgerCustomers(list.slice(0, 10));
  }, [ledgerFetchLimit]);

  const searchLedgerCustomer = useCallback(async (q: string) => {
    if (!q.trim()) { fetchLedger(); return; }
    const { data } = await supabase.from('cash_challans').select('customer_name, total, amount_paid, is_return, created_at, status').neq('status', 'voided').ilike('customer_name', `%${q.replace(/[%_]/g, '\\$&')}%`);
    type LedgerSearchRow = Pick<CashChallan, 'customer_name' | 'total' | 'amount_paid' | 'is_return' | 'created_at' | 'status'>;
    const now = Date.now();
    const daysSince = (d: string) => Math.floor((now - new Date(d).getTime()) / 86400000);
    const map: Record<string, { total: number; paid: number; count: number; aging: { current: number; d30: number; d60: number; d90plus: number } }> = {};
    ((data as LedgerSearchRow[] | null) || []).forEach((r) => {
      const name = r.customer_name;
      const sign = r.is_return ? -1 : 1;
      if (!map[name]) map[name] = { total: 0, paid: 0, count: 0, aging: { current: 0, d30: 0, d60: 0, d90plus: 0 } };
      map[name].total += sign * Number(r.total);
      map[name].paid += sign * Number(r.amount_paid || 0);
      map[name].count++;
      const outstanding = Number(r.total) - Number(r.amount_paid || 0);
      if (!r.is_return && outstanding > 0 && r.status !== 'paid' && r.status !== 'draft') {
        const days = daysSince(r.created_at ?? '');
        if (days <= 30) map[name].aging.current += outstanding;
        else if (days <= 60) map[name].aging.d30 += outstanding;
        else if (days <= 90) map[name].aging.d60 += outstanding;
        else map[name].aging.d90plus += outstanding;
      }
    });
    setLedgerCustomers(Object.entries(map).map(([name, v]) => ({ name, total: v.total, paid: v.paid, outstanding: v.total - v.paid, count: v.count, aging: v.aging })));
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
    if (saving) return;
    setFormError('');
    if (editing && (editing.status === 'voided' || editing.status === 'paid')) { setFormError('Cannot edit a paid or voided challan'); return; }
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
    setSaving(true);
    try {
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
          const msg = 'This challan was modified by another user. Please close and reopen to get latest data.';
          setFormError(msg);
          addToast(msg, 'error');
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
    const savedName = customerName.trim();
    const savedTotal = grandTotal;
    const savedPhone = customerPhone.trim();
    const savedItemCount = items.length;
    closeModal();
    fetchChallans();
    if (wasNew) {
      addToast('Challan created!', 'success');
      if (savedPhone) {
        const msg = encodeURIComponent(`Hi ${savedName},\nYour invoice of ₹${savedTotal.toLocaleString('en-IN')} (${savedItemCount} item${savedItemCount !== 1 ? 's' : ''}) has been generated.\n— Arya Designs`);
        setWhatsAppShare({ phone: savedPhone, url: `https://wa.me/${waPhone(savedPhone)}?text=${msg}` });
      }
      const suppressed = localStorage.getItem('ccErpReminderHidden');
      const aWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      if (!suppressed || Number(suppressed) < aWeekAgo) setShowErpReminder(true);
    }
    } finally { setSaving(false); }
  };

  // ── Void challan ───────────────────────────────────────────────────────────
  const voidChallan = async (id: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: before } = await supabase.from('cash_challans').select('challan_number, customer_name, total, amount_paid, status, payment_mode').eq('id', id).maybeSingle();
    if (!before) return;
    if (before.status === 'paid') { addToast('Cannot void a fully paid challan', 'error'); return; }
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
      window.location.href = `https://wa.me/${waPhone(phone)}?text=${msg}`;
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
    window.location.href = `https://wa.me/${waPhone(reminderPhone)}?text=${msg}`;
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
    if (c.status === 'paid') { addToast('Cannot edit a paid challan. Change status to unpaid first.', 'error'); return; }
    const [{ data: citems }, { data: cust }] = await Promise.all([
      supabase.from('cash_challan_items').select('sku, description, quantity, price, total, discount_type, discount_value, discount_amount').eq('challan_id', c.id).order('sort_order'),
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
    window.history.pushState({ view: 'challan-edit' }, '');
  };

  const closeModal = () => {
    clearDraft();
    if (draftTimerRef.current) { clearTimeout(draftTimerRef.current); draftTimerRef.current = null; }
    setShowModal(false); setEditing(null); setCustomerName(''); setSelectedCustomerId(null); setCustomerPhone(''); setIsReturn(false); setReturnSource(null); setReturnSearchQ(''); setReturnResults([]);
    setItems([{ sku: '', description: '', quantity: 1, price: 0, total: 0, discount_type: 'flat', discount_value: 0, discount_amount: 0 }]);
    setShippingCharges(0); setNotes(''); setTags('');
    setPaymentMode(''); setPaymentDate(''); setAmountPaid(0); setChallanStatus('unpaid');
    setCustomerSuggestions([]);
  };

  // ── Print ──────────────────────────────────────────────────────────────────
  const printChallan = async (c: Challan) => {
    const { data: citems } = await supabase.from('cash_challan_items').select('sku, quantity, price, total, discount_amount').eq('challan_id', c.id).order('sort_order');
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

    const htmlContent = `<!doctype html><html><head><meta charset="utf-8"><title>${escHtml(docType)} #${escHtml(c.challan_number)}</title>
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
    </div></body></html>`;
    setPrintHtml(htmlContent);
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
    addToast('Exported successfully', 'success');
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
    if (!bulkPayMode || bulkBusy) return;
    setBulkBusy(true);
    const today = new Date().toISOString().slice(0, 10);
    const { data: { user } } = await supabase.auth.getUser();
    const ids = bulkPayable.map(c => c.id);
    if (ids.length === 0) { setShowBulkPay(false); setBulkBusy(false); return; }
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
    setBulkBusy(false);
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
    if (bulkBusy) return;
    setBulkBusy(true);
    const today = new Date().toISOString().slice(0, 10);
    const { data: { user } } = await supabase.auth.getUser();
    const ids = bulkUnpayable.map(c => c.id);
    if (ids.length === 0) { setShowBulkUnpay(false); setBulkBusy(false); return; }
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
    setShowBulkUnpay(false); exitBulkMode(); fetchChallans(); setBulkBusy(false);
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
  if (showModal) return (<>
    {draftRestored && !editing && (
      <div style={{ margin: '0 16px 8px', padding: '8px 12px', borderRadius: 6, background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: T.gr, fontWeight: 600 }}>Draft restored (saved {Math.round((Date.now() - draftRestoredAt) / 60000)} min ago)</span>
        <button onClick={() => { clearDraft(); closeModal(); }} style={{ padding: '3px 8px', borderRadius: 4, border: `1px solid ${T.bd2}`, background: 'rgba(255,255,255,0.03)', color: T.tx3, fontSize: 9, cursor: 'pointer' }}>Discard</button>
      </div>
    )}
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
      saving={saving}
      formError={formError}
    />
  </>);

  // ── List View ──────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: T.sans, color: T.tx, padding: '14px 16px' }}>
      {/* Header */}
      <div className="challan-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600, fontFamily: T.sora }}>Cash Challan</span>
        <div className="challan-nav-btns" style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => { setShowCashBook(true); window.history.pushState({ view: 'cashbook' }, ''); }} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(34,197,94,.2)', background: 'rgba(34,197,94,.08)', color: T.gr, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>Cash Book</button>
          <button onClick={() => { fetchLedger(); setShowLedger(true); window.history.pushState({ view: 'ledger' }, ''); }} style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${T.bd2}`, background: 'rgba(255,255,255,0.03)', color: T.tx3, fontSize: 10, fontWeight: 500, cursor: 'pointer' }}>Ledger</button>
          <button onClick={() => { fetchAnalytics(); setShowAnalytics(true); window.history.pushState({ view: 'analytics' }, ''); }} style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${T.bd2}`, background: 'rgba(255,255,255,0.03)', color: T.tx3, fontSize: 10, fontWeight: 500, cursor: 'pointer' }}>Analytics</button>
          <button onClick={() => { setShowModal(true); window.history.pushState({ view: 'challan-new' }, ''); }} style={{ padding: '4px 12px', borderRadius: 6, border: 'none', background: `linear-gradient(135deg, ${T.ac}dd, ${T.ac2}cc)`, color: '#fff', fontSize: 10, fontWeight: 600, cursor: 'pointer', boxShadow: '0 2px 8px rgba(99,102,241,.25)' }}>+ New</button>
        </div>
      </div>

      <ChallanList
        challans={challans}
        loading={loading}
        totalCount={totalCount}
        statusColors={STATUS_COLORS}
        search={search}
        onSearchChange={setSearch}
        showFilters={showFilters}
        onToggleFilters={() => setShowFilters(f => !f)}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        tagFilter={tagFilter}
        onTagFilterChange={setTagFilter}
        allTags={allTags}
        dateFrom={dateFrom}
        onDateFromChange={setDateFrom}
        dateTo={dateTo}
        onDateToChange={setDateTo}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        onClearFilters={() => { setStatusFilter(''); setTagFilter(''); setDateFrom(''); setDateTo(''); setPage(0); }}
        onExport={exportChallansCSV}
        onResetPage={() => setPage(0)}
        bulkMode={bulkMode}
        onToggleBulkMode={() => { if (bulkMode) exitBulkMode(); else setBulkMode(true); }}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onOpenEmpty={() => setShowModal(true)}
        onOpenDetail={(c) => { setViewingChallan(c); window.history.pushState({ view: 'challan-detail' }, ''); }}
        onPrint={printChallan}
        onRemind={sendReminder}
        onCreateReturn={(c) => { setIsReturn(true); setChallanStatus('paid'); selectReturnSource(c); setShowModal(true); }}
        onVoid={(c) => setConfirmAction({ type: 'void', id: c.id, challanNumber: c.challan_number })}
      />

      <ChallanBulkActions
        bulkMode={bulkMode}
        selectedCount={selectedIds.size}
        payable={bulkPayable as Challan[]}
        unpayable={bulkUnpayable as Challan[]}
        returns={bulkReturns as Challan[]}
        outstanding={bulkSalesOutstanding}
        returnsTotal={bulkReturnsTotal}
        netTotal={bulkNetTotal}
        bulkBusy={bulkBusy}
        onSelectAll={selectAll}
        onClearSelection={clearSelection}
        lastBatch={lastBatch}
        undoingBatch={undoingBatch}
        onUndoBatch={async () => { if (!lastBatch) return; setUndoingBatch(true); await undoBatch(lastBatch.id); setUndoingBatch(false); }}
        onDismissBatch={() => setLastBatch(null)}
        showBulkPay={showBulkPay}
        onOpenBulkPay={() => { setBulkPayMode(''); setBulkReceivedAmount(''); setShowBulkPay(true); }}
        onCloseBulkPay={() => setShowBulkPay(false)}
        bulkPayMode={bulkPayMode}
        setBulkPayMode={setBulkPayMode}
        bulkReceivedAmount={bulkReceivedAmount}
        setBulkReceivedAmount={setBulkReceivedAmount}
        onConfirmBulkPay={executeBulkPay}
        showBulkUnpay={showBulkUnpay}
        onOpenBulkUnpay={() => setShowBulkUnpay(true)}
        onCloseBulkUnpay={() => setShowBulkUnpay(false)}
        onConfirmBulkUnpay={executeBulkUnpay}
      />

      {/* Audit Trail Modal */}
      {auditTrail && (
        <div style={{ ...S.modalOverlay }}>
          <div className="modal-inner" style={{ ...S.modalBox, maxWidth: 420, padding: '18px 16px' }}>
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
        <div style={S.modalOverlay}>
          <div className="modal-inner" style={{ ...S.modalBox, maxWidth: 360, padding: '20px 18px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.tx, fontFamily: T.sora, marginBottom: 4 }}>Add Customer Phone</div>
            <div style={{ fontSize: 11, color: T.tx3, marginBottom: 12 }}>No phone saved for <strong style={{ color: T.tx }}>{reminderChallan.customer_name}</strong>. Enter a 10-digit mobile to send reminder:</div>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.bd2}`, borderRight: 'none', borderRadius: '6px 0 0 6px', fontSize: 14, color: T.tx3, fontFamily: T.mono }}>+91</span>
              <input type="tel" value={reminderPhone} onChange={e => setReminderPhone(e.target.value)} placeholder="9876543210" autoFocus style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd2}`, borderRadius: '0 6px 6px 0', color: T.tx, fontFamily: T.mono, fontSize: 14, padding: '8px 10px', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setReminderChallan(null)} style={{ flex: 1, padding: '8px 0', borderRadius: 6, border: '1px solid rgba(99,102,241,0.15)', fontSize: 11, fontWeight: 500, background: 'rgba(99,102,241,0.06)', color: T.ac2, cursor: 'pointer' }}>Cancel</button>
              <button onClick={saveReminderPhone} disabled={!reminderPhone.trim()} style={{ flex: 1, padding: '8px 0', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 600, background: reminderPhone.trim() ? `linear-gradient(135deg, ${T.gr}, ${T.gr}cc)` : 'rgba(255,255,255,.05)', color: '#fff', cursor: reminderPhone.trim() ? 'pointer' : 'not-allowed' }}>Send</button>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Share Bar */}
      {whatsAppShare && (
        <div style={{ position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)', zIndex: 300, background: T.s, border: `1px solid ${T.bd2}`, borderRadius: 10, padding: '10px 14px', boxShadow: '0 8px 30px rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', gap: 12, animation: 'su .2s ease', minWidth: 280 }}>
          <span style={{ fontSize: 20 }}>📱</span>
          <span style={{ flex: 1, fontSize: 12, color: T.tx }}>Share on WhatsApp?</span>
          <button onClick={() => { window.location.href = whatsAppShare.url; setWhatsAppShare(null); }} style={{ ...S.btnPrimary, background: '#25D366', boxShadow: 'none', gap: 4, fontSize: 11 }}>Send</button>
          <span onClick={() => setWhatsAppShare(null)} style={{ cursor: 'pointer', color: T.tx3, fontSize: 14 }}>✕</span>
        </div>
      )}

      {/* ERP Reminder Modal */}
      {showErpReminder && (
        <div style={{ ...S.modalOverlay }}>
          <div className="modal-inner" style={{ ...S.modalBox, maxWidth: 380, padding: '24px 22px', textAlign: 'center' }}>
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
        <div style={{ ...S.modalOverlay }}>
          <div className="modal-inner" style={{ ...S.modalBox, maxWidth: 340, padding: '20px 18px', textAlign: 'center' }}>
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
        <div className="challan-pagination" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10, fontSize: 11 }}>
          <span style={{ fontSize: 10, color: T.tx3 }}>{totalCount} records</span>
          {totalPages > 1 && <>
            <span onClick={() => setPage(p => Math.max(0, p - 1))} style={{ ...S.btnGhost, ...S.btnSm, opacity: page === 0 ? 0.3 : 1, pointerEvents: page === 0 ? 'none' : 'auto' }}>Prev</span>
            <span style={{ fontSize: 10, color: T.tx3 }}>{page + 1} / {totalPages}</span>
            <span onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} style={{ ...S.btnGhost, ...S.btnSm, opacity: page >= totalPages - 1 ? 0.3 : 1, pointerEvents: page >= totalPages - 1 ? 'none' : 'auto' }}>Next</span>
          </>}
        </div>
      )}

      {/* Print Preview Modal */}
      {printHtml && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,.75)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setPrintHtml(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 10, width: '100%', maxWidth: 600, maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <iframe ref={printIframeRef} srcDoc={printHtml} style={{ flex: 1, border: 'none', width: '100%', minHeight: 400 }} />
            <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid #eee', justifyContent: 'flex-end' }}>
              <button onClick={() => setPrintHtml(null)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', color: '#333', fontSize: 13, cursor: 'pointer' }}>Close</button>
              <button onClick={() => { printIframeRef.current?.contentWindow?.print(); }} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#6366F1', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Print</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
