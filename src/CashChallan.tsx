import { useState, useEffect, useRef, useCallback } from 'react';
import CashBook from './CashBook';
import { supabase } from './lib/supabase';
import { useNotifications } from './hooks/useNotifications';
import ChallanAnalytics from './components/challan/ChallanAnalytics';
import Empty from './components/ui/Empty';
import type {
  CashChallan,
  CashChallanItem as DbCashChallanItem,
  CashChallanCustomer,
  AuditLog,
  AuditLogInsert,
} from './types/database';

const ccAudit = (action: string, details: string) => {
  supabase.auth.getUser().then(({ data }) => {
    const entry: AuditLogInsert = { action, module: 'cash_challan', details, user_id: data.user?.id ?? null };
    supabase.from('audit_log').insert(entry);
  });
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

const PAYMENT_MODES = ['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Card', 'Other'];

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
  const [challanStatus, setChallanStatus] = useState('draft');
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
  const [userName, setUserName] = useState('there');
  const [confirmAction, setConfirmAction] = useState<{ type: 'void' | 'delete'; id: string; challanNumber?: number } | null>(null);
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

  const searchTimeout = useRef<any>(null);

  // ── Computed values (per-item discount) ─────────────────────────────────
  const computeItemTotal = (it: ChallanItem) => {
    const lineTotal = it.quantity * it.price;
    const disc = it.discount_type === 'percentage'
      ? Math.min(lineTotal * (it.discount_value || 0) / 100, lineTotal)
      : Math.min(it.discount_value || 0, lineTotal);
    return Math.round((lineTotal - Math.max(0, disc)) * 100) / 100;
  };
  const subtotal = Math.round(items.reduce((s, i) => s + computeItemTotal(i), 0) * 100) / 100;
  const totalDiscount = Math.round(items.reduce((s, i) => s + (i.quantity * i.price - computeItemTotal(i)), 0) * 100) / 100;
  const clampedShipping = Math.max(0, shippingCharges);
  const afterDiscount = Math.round((subtotal + clampedShipping) * 100) / 100;
  const roundOff = Math.round((Math.round(afterDiscount) - afterDiscount) * 100) / 100;
  const grandTotal = Math.round(afterDiscount);

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
    query = query.order('created_at', { ascending: false }).range(page * pageSize, (page + 1) * pageSize - 1);
    const { data, count } = await query;
    setChallans((data as Challan[] | null) || []);
    setTotalCount(count || 0);
    setLoading(false);
  }, [search, statusFilter, tagFilter, page, pageSize]);

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
  useEffect(() => {
    const channel = supabase.channel('cash_challans_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_challans' }, () => fetchChallans())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_challan_items' }, () => fetchChallans())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_challan_customers' }, () => {})
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchChallans]);
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
    const { data } = await supabase.from('cash_challan_customers').select('*').ilike('name', `%${q.replace(/[%_]/g, '\\$&')}%`).limit(5);
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
    const [{ data }, { count: voidedCount }, { data: prevData }] = await Promise.all([
      supabase.from('cash_challans').select('total, payment_mode, status, is_return').gte('created_at', fromDt.toISOString()).lte('created_at', toDt.toISOString()).neq('status', 'voided'),
      supabase.from('cash_challans').select('id', { count: 'estimated', head: true }).gte('created_at', fromDt.toISOString()).lte('created_at', toDt.toISOString()).eq('status', 'voided'),
      supabase.from('cash_challans').select('total, is_return').gte('created_at', prevFromDt.toISOString()).lte('created_at', prevToDt.toISOString()).neq('status', 'voided'),
    ]);
    const rows = (data as AnalyticsRow[] | null) || [];
    const totalRevenue = rows.reduce((s, r) => s + (r.is_return ? -1 : 1) * Number(r.total), 0);
    const byMode: Record<string, number> = {};
    rows.forEach((r) => { const m = r.payment_mode || 'Unset'; byMode[m] = (byMode[m] || 0) + (r.is_return ? -1 : 1) * Number(r.total); });
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

  const fetchLedgerDetail = useCallback(async (name: string) => {
    setLedgerDetail(name);
    window.history.pushState({ view: 'ledger-detail' }, '');
    const { data } = await supabase.from('cash_challans').select('*').ilike('customer_name', name.replace(/[%_]/g, '\\$&')).neq('status', 'voided').order('created_at', { ascending: false }).limit(500);
    setLedgerChallans((data as Challan[] | null) || []);
  }, []);

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
    const negDiscItem = items.find(it => (it.discount_value || 0) < 0);
    if (negDiscItem) { setFormError(`Item "${negDiscItem.sku}" has negative discount`); return; }
    const overDiscItem = items.find(it => it.discount_type === 'percentage' && (it.discount_value || 0) > 100);
    if (overDiscItem) { setFormError(`Item "${overDiscItem.sku}" discount cannot exceed 100%`); return; }
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
    if (challanStatus === 'paid' && amountPaid < grandTotal) { setFormError(`Status is "Paid" but amount paid (₹${amountPaid}) is less than total (₹${grandTotal})`); return; }
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
      customer_id: custId, customer_name: customerName.trim(), status: challanStatus,
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
        ccAudit('UPDATE', `Challan #${editing.challan_number} updated for ${customerName.trim()} - ₹${grandTotal}`);
      } else {
        const { data: newChallan, error: crErr } = await supabase.from('cash_challans').insert({ ...challanData, created_by: user?.id, source_challan_id: isReturn && returnSource ? returnSource.id : null }).select('id, challan_number').single();
        if (crErr || !newChallan) throw new Error(crErr?.message || 'Failed to create challan');
        const { error: itErr } = await supabase.from('cash_challan_items').insert(items.map((it, i) => ({ challan_id: newChallan.id, sku: it.sku, description: it.description, quantity: it.quantity, price: it.price, total: computeItemTotal(it), discount_type: it.discount_type || null, discount_value: it.discount_value || 0, discount_amount: Math.round((it.quantity * it.price - computeItemTotal(it)) * 100) / 100, sort_order: i })));
        if (itErr) { await supabase.from('cash_challans').delete().eq('id', newChallan.id); throw new Error(itErr.message); }
        ccAudit('CREATE', `${isReturn ? 'Return' : 'Challan'} #${newChallan.challan_number} created for ${customerName.trim()} - ₹${grandTotal}`);
      }
    } catch (e: any) {
      setFormError(`Save failed: ${e.message || 'Unknown error'}. Please try again.`);
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
    const { data: before } = await supabase.from('cash_challans').select('challan_number, customer_name, total').eq('id', id).maybeSingle();
    await supabase.from('cash_challans').update({ status: 'voided', voided_by: user?.id, voided_at: new Date().toISOString() }).eq('id', id);
    if (before) ccAudit('VOID', `Challan #${before.challan_number} (${before.customer_name}) voided - was ₹${before.total}`);
    fetchChallans();
  };

  // ── Audit trail for a challan ──────────────────────────────────────────────
  const loadAuditTrail = async (challanNumber: number) => {
    const { data } = await supabase.from('audit_log').select('*').eq('module', 'cash_challan').ilike('details', `%#${challanNumber} %`).order('created_at', { ascending: false });
    setAuditTrail(data || []);
  };

  // ── WhatsApp payment reminder ──────────────────────────────────────────────
  const sendReminder = async (c: Challan) => {
    const outstanding = Number(c.total) - Number(c.amount_paid || 0);
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
    const w = window.open('', '_blank', 'width=800,height=600');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>Ledger - ${safeName}</title>
      <style>
        body{font-family:'Inter',sans-serif;padding:24px;color:#1a202c;font-size:12px}
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
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
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
    setChallanStatus(c.status);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false); setEditing(null); setCustomerName(''); setSelectedCustomerId(null); setCustomerPhone(''); setIsReturn(false); setReturnSource(null); setReturnSearchQ(''); setReturnResults([]);
    setItems([{ sku: '', description: '', quantity: 1, price: 0, total: 0, discount_type: 'flat', discount_value: 0, discount_amount: 0 }]);
    setShippingCharges(0); setNotes(''); setTags('');
    setPaymentMode(''); setPaymentDate(''); setAmountPaid(0); setChallanStatus('draft');
    setCustomerSuggestions([]);
  };

  // ── Print ──────────────────────────────────────────────────────────────────
  const printChallan = async (c: Challan) => {
    const { data: citems } = await supabase.from('cash_challan_items').select('*').eq('challan_id', c.id).order('sort_order');
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><title>Cash Challan #${escHtml(c.challan_number)}</title><style>body{font-family:Arial,sans-serif;padding:20px;max-width:600px;margin:auto}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;font-size:12px}th{background:#f5f5f5;font-weight:600}.right{text-align:right}.header{text-align:center;margin-bottom:16px}.status{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600}</style></head><body>`);
    w.document.write(`<div class="header"><h2 style="margin:0">Arya Designs</h2><p style="color:#666;font-size:11px;margin:4px 0">${c.is_return ? 'Return Challan' : 'Cash Challan'} #${escHtml(c.challan_number)} | ${new Date(c.created_at).toLocaleDateString('en-IN')}</p></div>`);
    w.document.write(`<p><strong>Customer:</strong> ${escHtml(c.customer_name)}</p>`);
    w.document.write(`<table><thead><tr><th>#</th><th>SKU</th><th class="right">Qty</th><th class="right">Price</th><th class="right">Disc.</th><th class="right">Total</th></tr></thead><tbody>`);
    (citems || []).forEach((it, i) => { const da = Number(it.discount_amount || 0); w.document.write(`<tr><td>${i + 1}</td><td>${escHtml(it.sku || '-')}</td><td class="right">${Number(it.quantity)}</td><td class="right">${Number(it.price).toFixed(2)}</td><td class="right">${da > 0 ? '-' + da.toFixed(2) : '-'}</td><td class="right">${Number(it.total).toFixed(2)}</td></tr>`); });
    w.document.write(`</tbody></table>`);
    w.document.write(`<div style="text-align:right;font-size:12px"><p>Subtotal: <strong>${Number(c.subtotal).toFixed(2)}</strong></p>`);
    if (Number(c.discount_amount) > 0) w.document.write(`<p>Discount: -${Number(c.discount_amount).toFixed(2)}</p>`);
    if (Number(c.shipping_charges) > 0) w.document.write(`<p>Shipping/Porter: +${Number(c.shipping_charges).toFixed(2)}</p>`);
    if (Number(c.round_off) !== 0) w.document.write(`<p>Round Off: ${Number(c.round_off).toFixed(2)}</p>`);
    w.document.write(`<p style="font-size:16px;font-weight:700">Total: ₹${Number(c.total).toFixed(2)}</p></div>`);
    const statusLabel = c.is_return ? (c.status === 'paid' ? 'Refunded' : 'Pending Refund') : c.status.charAt(0).toUpperCase() + c.status.slice(1);
    const statusColor = c.status === 'paid' ? '#155724' : c.status === 'partial' ? '#856404' : c.status === 'draft' ? '#0c5460' : '#721c24';
    const statusBg = c.status === 'paid' ? '#d4edda' : c.status === 'partial' ? '#fff3cd' : c.status === 'draft' ? '#d1ecf1' : '#f8d7da';
    w.document.write(`<div style="margin:12px 0;padding:10px 14px;border-radius:6px;background:${statusBg};display:flex;justify-content:space-between;align-items:center"><span style="font-weight:700;color:${statusColor};font-size:13px">Status: ${escHtml(statusLabel)}</span>`);
    if (Number(c.amount_paid) > 0) w.document.write(`<span style="font-size:12px;color:${statusColor}">${c.is_return ? 'Refunded' : 'Paid'}: ₹${Number(c.amount_paid).toFixed(2)}${c.payment_mode ? ' (' + escHtml(c.payment_mode) + ')' : ''}</span>`);
    if (c.status !== 'paid' && c.status !== 'draft' && !c.is_return) { const due = Number(c.total) - Number(c.amount_paid || 0); w.document.write(`<span style="font-size:12px;color:#721c24;font-weight:600">Due: ₹${due.toFixed(2)}</span>`); }
    w.document.write(`</div>`);
    if (c.notes) w.document.write(`<p style="font-size:11px;color:#666;margin-top:12px"><strong>Notes:</strong> ${escHtml(c.notes)}</p>`);
    w.document.write(`<hr><p style="text-align:center;font-size:10px;color:#999">Powered by DailyOffice</p></body></html>`);
    w.document.close();
    w.print();
  };

  // ── WhatsApp share ─────────────────────────────────────────────────────────
  const shareChallan = (c: Challan) => {
    const text = `*Cash Challan #${c.challan_number}*\nCustomer: ${c.customer_name}\nDate: ${new Date(c.created_at).toLocaleDateString('en-IN')}\nTotal: ₹${Number(c.total).toFixed(2)}\nStatus: ${c.status.toUpperCase()}\n${(c.amount_paid ?? 0) > 0 ? `Paid: ₹${Number(c.amount_paid).toFixed(2)}` : ''}\n\n_Powered by DailyOffice_`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const totalPages = Math.ceil(totalCount / pageSize);
  const allTags = [...new Set(challans.flatMap(c => c.tags || []))];

  // ── Cash Book Screen ───────────────────────────────────────────────────────
  if (showCashBook) return (
    <div>
      <CashBook />
    </div>
  );

  // ── Analytics Screen ───────────────────────────────────────────────────────
  if (showAnalytics) return (
    <ChallanAnalytics
      analytics={analytics}
      from={analyticsFrom}
      to={analyticsTo}
      onFromChange={setAnalyticsFrom}
      onToChange={setAnalyticsTo}
      onApply={fetchAnalytics}
    />
  );

  // ── Ledger Detail Screen ────────────────────────────────────────────────────
  if (showLedger && ledgerDetail) {
    const cust = ledgerCustomers.find(c => c.name === ledgerDetail);
    return (
      <div style={{ fontFamily: T.sans, color: T.tx, padding: '14px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <span style={{ fontSize: 14, fontWeight: 700, fontFamily: T.sora }}>{ledgerDetail}</span>
            {cust && <div style={{ fontSize: 10, color: T.tx3, marginTop: 2 }}>{cust.count} challans | Outstanding: <span style={{ color: cust.outstanding > 0 ? T.re : T.gr, fontWeight: 600 }}>₹{cust.outstanding.toLocaleString('en-IN')}</span></div>}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => exportLedgerPDF(ledgerDetail)} style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${T.bd2}`, background: 'rgba(255,255,255,0.03)', color: T.tx3, fontSize: 10, cursor: 'pointer', fontFamily: T.sans }}>Export PDF</button>
          </div>
        </div>
        {cust && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
            <div style={{ background: 'rgba(99,102,241,.06)', border: '1px solid rgba(99,102,241,.12)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 7, color: T.ac2, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600, marginBottom: 2 }}>Total Billed</div>
              <div style={{ fontSize: 16, fontWeight: 800, fontFamily: T.sora, color: T.ac2 }}>₹{cust.total.toLocaleString('en-IN')}</div>
            </div>
            <div style={{ background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.12)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 7, color: T.gr, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600, marginBottom: 2 }}>Paid</div>
              <div style={{ fontSize: 16, fontWeight: 800, fontFamily: T.sora, color: T.gr }}>₹{cust.paid.toLocaleString('en-IN')}</div>
            </div>
            <div style={{ background: cust.outstanding > 0 ? 'rgba(239,68,68,.06)' : 'rgba(34,197,94,.06)', border: `1px solid ${cust.outstanding > 0 ? 'rgba(239,68,68,.12)' : 'rgba(34,197,94,.12)'}`, borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 7, color: cust.outstanding > 0 ? T.re : T.gr, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600, marginBottom: 2 }}>Outstanding</div>
              <div style={{ fontSize: 16, fontWeight: 800, fontFamily: T.sora, color: cust.outstanding > 0 ? T.re : T.gr }}>₹{cust.outstanding.toLocaleString('en-IN')}</div>
            </div>
          </div>
        )}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, overflow: 'hidden' }}>
          {ledgerChallans.map(c => {
            const sc = STATUS_COLORS[c.status] || STATUS_COLORS.unpaid;
            const isRet = !!c.is_return;
            return (
              <div key={c.id} onClick={() => openEdit(c)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderBottom: `1px solid ${T.bd}`, cursor: 'pointer' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, fontFamily: T.mono, color: T.tx3 }}>#{c.challan_number}</span>
                    <span style={{ fontSize: 9, color: T.tx3 }}>{new Date(c.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}</span>
                    <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 3, background: sc.bg, color: sc.color, fontWeight: 600, textTransform: 'uppercase' }}>{c.status}</span>
                    {isRet && <span style={{ fontSize: 7, padding: '1px 5px', borderRadius: 3, background: 'rgba(239,68,68,.12)', color: T.re, fontWeight: 700, textTransform: 'uppercase' }}>↩ Return</span>}
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, fontFamily: T.mono, color: isRet ? T.re : T.tx }}>{isRet ? '−' : ''}₹{Number(c.total).toLocaleString('en-IN')}</div>
              </div>
            );
          })}
          {ledgerChallans.length === 0 && <div style={{ padding: 16, textAlign: 'center', color: T.tx3, fontSize: 11 }}>No challans found.</div>}
        </div>
      </div>
    );
  }

  // ── Ledger List Screen ─────────────────────────────────────────────────────
  if (showLedger) {
    const totalOutstanding = ledgerCustomers.reduce((s, c) => s + c.outstanding, 0);
    return (
      <div style={{ fontFamily: T.sans, color: T.tx, padding: '14px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600, fontFamily: T.sora }}>Customer Ledger</span>
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <input type="text" value={ledgerSearch} onChange={e => setLedgerSearch(e.target.value)} placeholder="Enter customer name..."
            style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd2}`, borderRadius: 6, color: T.tx, fontSize: 11, padding: '7px 10px', outline: 'none', boxSizing: 'border-box' }} />
          <button onClick={() => searchLedgerCustomer(ledgerSearch)} style={{ padding: '7px 12px', borderRadius: 6, border: 'none', background: `linear-gradient(135deg, ${T.ac}dd, ${T.ac2}cc)`, color: '#fff', fontSize: 10, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>Search</button>
        </div>
        <div style={{ fontSize: 8, color: T.tx3, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>{ledgerSearch ? 'Search Results' : 'Recent Customers'}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 9, color: T.tx3 }}>{ledgerCustomers.length} customers</span>
          <span style={{ fontSize: 10, color: totalOutstanding > 0 ? T.re : T.gr, fontWeight: 600 }}>Total Outstanding: ₹{totalOutstanding.toLocaleString('en-IN')}</span>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, overflow: 'hidden' }}>
          {ledgerCustomers.map(c => (
            <div key={c.name} onClick={() => fetchLedgerDetail(c.name)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: `1px solid ${T.bd}`, cursor: 'pointer' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.tx, marginBottom: 2 }}>{c.name}</div>
                <div style={{ fontSize: 9, color: T.tx3 }}>{c.count} challans | Billed: ₹{c.total.toLocaleString('en-IN')} | Paid: ₹{c.paid.toLocaleString('en-IN')}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, fontFamily: T.mono, color: c.outstanding > 0 ? T.re : T.gr }}>₹{c.outstanding.toLocaleString('en-IN')}</div>
                <div style={{ fontSize: 8, color: T.tx3, textTransform: 'uppercase' }}>{c.outstanding > 0 ? 'Due' : 'Clear'}</div>
              </div>
            </div>
          ))}
          {ledgerCustomers.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: T.tx3, fontSize: 12 }}>No customers found. Search by name or click "Load More" below.</div>}
          <button onClick={() => { const newLimit = ledgerFetchLimit + 500; setLedgerFetchLimit(newLimit); fetchLedger(newLimit); }} style={{ width: '100%', padding: '8px', border: 'none', background: 'rgba(99,102,241,.06)', color: T.ac2, fontSize: 10, fontWeight: 600, cursor: 'pointer', borderRadius: '0 0 8px 8px' }}>Load More Customers</button>
        </div>
      </div>
    );
  }

  // ── Shared label style ──────────────────────────────────────────────────────
  const lbl: React.CSSProperties = { display: 'block', fontSize: 9, fontWeight: 600, color: T.tx3, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 };
  const inp: React.CSSProperties = { width: '100%', background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.bd}`, borderRadius: 6, color: T.tx, fontFamily: T.sans, fontSize: 12, padding: '8px 10px', outline: 'none', boxSizing: 'border-box' };

  // ── Create/Edit Modal ──────────────────────────────────────────────────────
  if (showModal) return (
    <div style={{ fontFamily: T.sans, color: T.tx, padding: '14px 16px', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 520 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 700, fontFamily: T.sora }}>{editing ? `Edit #${editing.challan_number}` : (isReturn ? 'New Return' : 'New Cash Challan')}</span>
            {editing && <button onClick={() => loadAuditTrail(editing.challan_number)} style={{ padding: '3px 8px', borderRadius: 5, border: `1px solid ${T.bd2}`, background: 'rgba(255,255,255,0.03)', color: T.tx3, fontSize: 9, cursor: 'pointer' }}>View History</button>}
          </div>
          <button onClick={closeModal} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(99,102,241,0.15)', background: 'rgba(99,102,241,0.06)', color: T.ac2, fontSize: 10, cursor: 'pointer' }}>Cancel</button>
        </div>

        {/* Sale / Return Toggle */}
        <div style={{ display: 'flex', gap: 3, marginBottom: 10, background: 'rgba(255,255,255,0.02)', borderRadius: 6, padding: 2, width: 'fit-content', border: `1px solid ${T.bd}` }}>
          {([{ v: false, label: 'Sale', color: T.gr }, { v: true, label: '↩ Return', color: T.re }] as const).map(opt => (
            <div key={String(opt.v)} onClick={() => !editing && setIsReturn(opt.v)} style={{ padding: '5px 14px', borderRadius: 4, fontSize: 10, fontWeight: isReturn === opt.v ? 600 : 400, cursor: editing ? 'not-allowed' : 'pointer', opacity: editing ? 0.6 : 1, background: isReturn === opt.v ? opt.color + '33' : 'transparent', color: isReturn === opt.v ? opt.color : T.tx3, border: isReturn === opt.v ? `1px solid ${opt.color}44` : 'none' }}>{opt.label}</div>
          ))}
        </div>

        {/* Return: Select source invoice */}
        {isReturn && !editing && !returnSource && (
          <div style={{ background: 'rgba(239,68,68,.04)', border: '1px solid rgba(239,68,68,.15)', borderRadius: 10, padding: 14, marginBottom: 12 }}>
            <label style={{ ...lbl, color: T.re }}>Select Original Invoice *</label>
            <input type="text" value={returnSearchQ} onChange={e => { setReturnSearchQ(e.target.value); searchReturnSource(e.target.value); }}
              placeholder="Search by challan # or customer name..." style={inp} autoFocus />
            {returnResults.length > 0 && <div style={{ marginTop: 6, border: `1px solid ${T.bd}`, borderRadius: 6, maxHeight: 200, overflowY: 'auto' }}>
              {returnResults.map(c => (
                <div key={c.id} onClick={() => selectReturnSource(c)} style={{ padding: '8px 12px', borderBottom: `1px solid ${T.bd}`, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <div>
                    <span style={{ fontFamily: T.mono, fontSize: 11, color: T.ac2 }}>#{c.challan_number}</span>
                    <span style={{ marginLeft: 8, fontSize: 11, color: T.tx }}>{c.customer_name}</span>
                  </div>
                  <span style={{ fontFamily: T.mono, fontSize: 12, fontWeight: 600, color: T.tx }}>₹{Number(c.total).toLocaleString('en-IN')}</span>
                </div>
              ))}
            </div>}
          </div>
        )}
        {isReturn && returnSource && !editing && (
          <div style={{ background: 'rgba(239,68,68,.04)', border: '1px solid rgba(239,68,68,.15)', borderRadius: 10, padding: '8px 14px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: 9, color: T.re, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>Return against</span>
              <div style={{ fontSize: 12, color: T.tx, fontWeight: 600 }}>#{returnSource.challan_number} — {returnSource.customer_name} — ₹{Number(returnSource.total).toLocaleString('en-IN')}</div>
            </div>
            <span onClick={() => { setReturnSource(null); setCustomerName(''); setSelectedCustomerId(null); setItems([{ sku: '', description: '', quantity: 1, price: 0, total: 0, discount_type: 'flat', discount_value: 0, discount_amount: 0 }]); }} style={{ fontSize: 10, color: T.re, cursor: 'pointer', fontWeight: 600 }}>Change</span>
          </div>
        )}

        <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
          {/* Customer */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginBottom: 12 }}>
            <div style={{ position: 'relative' }}>
              <label style={lbl}>Customer Name *</label>
              <input type="text" value={customerName} onChange={e => { setCustomerName(e.target.value); setSelectedCustomerId(null); clearTimeout(searchTimeout.current); searchTimeout.current = setTimeout(() => searchCustomers(e.target.value), 300); }}
                placeholder="Type customer name..." style={inp} />
              {customerSuggestions.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: 'rgba(14,18,30,.98)', border: `1px solid ${T.bd2}`, borderRadius: 6, maxHeight: 120, overflowY: 'auto' }}>
                  {customerSuggestions.map(c => (
                    <div key={c.id} onClick={() => { setCustomerName(c.name); setSelectedCustomerId(c.id); setCustomerPhone(c.phone || ''); setCustomerSuggestions([]); }}
                      style={{ padding: '8px 10px', fontSize: 11, color: T.tx, cursor: 'pointer', borderBottom: `1px solid ${T.bd}` }}>{c.name} {c.phone && <span style={{ color: T.tx3 }}>({c.phone})</span>}</div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label style={lbl}>Phone (for WhatsApp){selectedCustomerId && customerPhone && <span style={{ marginLeft: 6, fontSize: 8, color: T.gr, textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>✓ Auto-filled</span>}</label>
              <input type="tel" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="9876543210" style={{ ...inp, fontFamily: T.mono }} />
            </div>
          </div>

          {/* Line Items */}
          <div data-items style={{ background: 'rgba(0,0,0,.15)', border: `1px solid ${T.bd}`, borderRadius: 8, marginBottom: 12, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 50px 70px 90px 24px', gap: 4, padding: '6px 8px', borderBottom: `1px solid ${T.bd}`, background: 'rgba(255,255,255,0.015)' }}>
              <span style={{ fontSize: 8, color: T.tx3, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>SKU</span>
              <span style={{ fontSize: 8, color: T.tx3, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, textAlign: 'center' }}>Qty</span>
              <span style={{ fontSize: 8, color: T.tx3, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, textAlign: 'right' }}>Price</span>
              <span title="Per-item discount: ₹ flat or % of line total" style={{ fontSize: 8, color: T.tx3, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, textAlign: 'right', cursor: 'help' }}>Discount</span>
              <span></span>
            </div>
            {items.map((it, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 50px 70px 90px 24px', gap: 4, padding: '5px 8px', borderBottom: `1px solid ${T.bd}`, alignItems: 'center' }}>
                <input data-sku value={it.sku} onChange={e => { const n = [...items]; n[i].sku = e.target.value; setItems(n); }} placeholder="SKU / Item name" disabled={!!(isReturn && returnSource)} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd}`, borderRadius: 4, color: T.tx, fontSize: 11, padding: '6px', outline: 'none', fontFamily: T.mono, opacity: isReturn && returnSource ? 0.6 : 1 }} />
                <input type="number" value={it.quantity || ''} onChange={e => { const n = [...items]; n[i].quantity = Number(e.target.value); setItems(n); }} placeholder="1" style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd}`, borderRadius: 4, color: T.tx, fontSize: 11, padding: '6px', outline: 'none', textAlign: 'center' }} />
                <input type="number" value={it.price || ''} onChange={e => { const n = [...items]; n[i].price = Number(e.target.value); setItems(n); }} placeholder="0" disabled={!!(isReturn && returnSource)} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd}`, borderRadius: 4, color: T.tx, fontSize: 11, padding: '6px', outline: 'none', textAlign: 'right', fontFamily: T.mono, opacity: isReturn && returnSource ? 0.6 : 1 }} />
                <div style={{ display: 'flex', gap: 2, alignItems: 'center', opacity: isReturn && returnSource ? 0.6 : 1 }}>
                  <select value={it.discount_type || 'flat'} onChange={e => { const n = [...items]; n[i].discount_type = e.target.value; setItems(n); }} disabled={!!(isReturn && returnSource)} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd}`, borderRadius: 4, color: T.tx3, fontSize: 9, padding: '5px 2px', outline: 'none', width: 32 }}>
                    <option value="flat">₹</option><option value="percentage">%</option>
                  </select>
                  <input
                    type="number"
                    value={it.discount_value || ''}
                    onChange={e => { const n = [...items]; n[i].discount_value = Number(e.target.value); setItems(n); }}
                    onKeyDown={e => {
                      // Enter on last row's last field appends a new row (audit P1)
                      if (e.key === 'Enter' && i === items.length - 1 && !(isReturn && returnSource)) {
                        e.preventDefault();
                        setItems([...items, { sku: '', description: '', quantity: 1, price: 0, total: 0, discount_type: 'flat', discount_value: 0, discount_amount: 0 }]);
                        // Focus the new row's SKU input after render
                        setTimeout(() => {
                          const inputs = (e.currentTarget.closest('[data-items]') as HTMLElement | null)?.querySelectorAll<HTMLInputElement>('input[data-sku]');
                          inputs?.[inputs.length - 1]?.focus();
                        }, 0);
                      }
                    }}
                    placeholder="0"
                    disabled={!!(isReturn && returnSource)}
                    style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd}`, borderRadius: 4, color: T.tx, fontSize: 11, padding: '6px', outline: 'none', textAlign: 'right', fontFamily: T.mono, flex: 1, minWidth: 0 }}
                  />
                </div>
                <button onClick={() => { if (items.length > 1) setItems(items.filter((_, j) => j !== i)); }} style={{ border: 'none', background: 'none', color: T.re, cursor: 'pointer', fontSize: 14, padding: 0, opacity: 0.6 }}>×</button>
              </div>
            ))}
            {!(isReturn && returnSource) && <button onClick={() => setItems([...items, { sku: '', description: '', quantity: 1, price: 0, total: 0, discount_type: 'flat', discount_value: 0, discount_amount: 0 }])} style={{ width: '100%', padding: '7px', border: 'none', background: 'rgba(99,102,241,.06)', color: T.ac2, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>+ Add Item (or press Enter on last row)</button>}
          </div>

          {/* Shipping + Tags + Notes */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
            <div>
              <label style={lbl}>Shipping/Porter</label>
              <input type="number" value={shippingCharges || ''} onChange={e => setShippingCharges(Number(e.target.value))} placeholder="0" style={{ ...inp, fontFamily: T.mono, fontSize: 11 }} />
            </div>
            <div>
              <label style={lbl}>Tags <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: 7 }}>comma separated</span></label>
              <input value={tags} onChange={e => setTags(e.target.value)} placeholder="vip, urgent" style={{ ...inp, fontSize: 11 }} />
            </div>
            <div>
              <label style={lbl}>Notes</label>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" style={{ ...inp, fontSize: 11 }} />
            </div>
          </div>

          {/* Status + Payment */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
            <div>
              <label style={lbl}>Status</label>
              <select value={challanStatus} onChange={e => setChallanStatus(e.target.value)} style={{ ...inp, fontSize: 11 }}>
                {isReturn ? (<>
                  {(!editing || editing.status === 'draft') && <option value="draft">Draft</option>}
                  <option value="unpaid">Pending Refund</option>
                  <option value="paid">Refunded</option>
                </>) : (<>
                  {(!editing || editing.status === 'draft') && <option value="draft">Draft</option>}
                  <option value="unpaid">Unpaid</option>
                  <option value="paid">Paid</option>
                  <option value="partial">Partial</option>
                </>)}
              </select>
            </div>
            <div>
              <label style={lbl}>{isReturn ? 'Refund Mode' : 'Payment Mode'}</label>
              <select value={paymentMode} onChange={e => setPaymentMode(e.target.value)} style={{ ...inp, fontSize: 11 }}>
                <option value="">Select...</option>{PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>{isReturn ? 'Refund Amount' : 'Amount Paid'}</label>
              <input type="number" value={amountPaid || ''} onChange={e => setAmountPaid(Number(e.target.value))} placeholder="0" style={{ ...inp, fontFamily: T.mono, fontSize: 11 }} />
            </div>
            <div>
              <label style={lbl}>{isReturn ? 'Refund Date' : 'Payment Date'}</label>
              <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} style={{ ...inp, fontSize: 11 }} />
            </div>
          </div>
        </div>

        {/* Totals card */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: '12px 16px', marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.tx2, marginBottom: 4 }}><span>Subtotal</span><span style={{ fontFamily: T.mono }}>₹{subtotal.toFixed(2)}</span></div>
          {totalDiscount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.re, marginBottom: 4 }}><span>Item Discounts</span><span style={{ fontFamily: T.mono }}>-₹{totalDiscount.toFixed(2)}</span></div>}
          {shippingCharges > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.bl, marginBottom: 4 }}><span>Shipping/Porter</span><span style={{ fontFamily: T.mono }}>+₹{shippingCharges.toFixed(2)}</span></div>}
          {roundOff !== 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.tx3, marginBottom: 4 }}><span>Round Off</span><span style={{ fontFamily: T.mono }}>{roundOff > 0 ? '+' : ''}₹{roundOff.toFixed(2)}</span></div>}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 800, color: T.gr, fontFamily: T.sora, borderTop: `1px solid ${T.bd}`, paddingTop: 8, marginTop: 4 }}><span>Total</span><span>₹{grandTotal.toLocaleString('en-IN')}</span></div>
        </div>

        {formError && <div style={{ background: 'rgba(239,68,68,.15)', borderLeft: `4px solid ${T.re}`, borderRadius: 6, padding: '10px 14px', fontSize: 11, color: T.tx, marginBottom: 8 }}>{formError}</div>}
        <button onClick={saveChallan} style={{ width: '100%', padding: '12px', borderRadius: 10, border: 'none', fontSize: 13, fontWeight: 700, background: `linear-gradient(135deg, ${T.ac}, ${T.ac2})`, color: '#fff', cursor: 'pointer', boxShadow: '0 4px 16px rgba(99,102,241,.3)' }}>{editing ? (isReturn ? 'Update Return' : 'Update Challan') : (isReturn ? 'Create Return' : 'Create Challan')}</button>
      </div>

      {/* Audit Trail Modal (also accessible from edit form) */}
      {auditTrail && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(8px)', padding: 16 }}>
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
    </div>
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

      {/* Search + Filters */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Search name or #..." style={{ flex: 1, minWidth: 120, background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd2}`, borderRadius: 6, color: T.tx, fontSize: 11, padding: '6px 10px', outline: 'none' }} />
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(0); }} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd2}`, borderRadius: 6, color: T.tx, fontSize: 10, padding: '6px 8px', outline: 'none' }}>
          <option value="">All Status</option><option value="draft">Draft</option><option value="paid">Paid</option><option value="unpaid">Unpaid</option><option value="partial">Partial</option><option value="voided">Voided</option>
        </select>
        {allTags.length > 0 && <select value={tagFilter} onChange={e => { setTagFilter(e.target.value); setPage(0); }} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd2}`, borderRadius: 6, color: T.tx, fontSize: 10, padding: '6px 8px', outline: 'none' }}>
          <option value="">All Tags</option>{allTags.map(t => <option key={t} value={t}>{t}</option>)}
        </select>}
        <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(0); }} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd2}`, borderRadius: 6, color: T.tx, fontSize: 10, padding: '6px 6px', outline: 'none', width: 50 }}>
          <option value={25}>25</option><option value={50}>50</option><option value={100}>100</option>
        </select>
      </div>

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
          return (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderBottom: `1px solid ${T.bd}`, cursor: 'pointer', background: isRet ? 'rgba(239,68,68,.04)' : undefined, transition: 'background .15s' }} onClick={() => openEdit(c)} onMouseEnter={e => e.currentTarget.style.background = isRet ? 'rgba(239,68,68,.08)' : 'rgba(255,255,255,.02)'} onMouseLeave={e => e.currentTarget.style.background = isRet ? 'rgba(239,68,68,.04)' : ''}>
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
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <button onClick={e => { e.stopPropagation(); printChallan(c); }} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 2, opacity: 0.5 }}>
                  <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'none', stroke: T.tx2, strokeWidth: 2 }}><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z" /></svg>
                </button>
                <button onClick={e => { e.stopPropagation(); shareChallan(c); }} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 2, opacity: 0.5 }} title="Share">
                  <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'none', stroke: T.gr, strokeWidth: 2 }}><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" /></svg>
                </button>
                {(c.status === 'unpaid' || c.status === 'partial') && <button onClick={e => { e.stopPropagation(); sendReminder(c); }} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 2, opacity: 0.6 }} title="Send WhatsApp reminder">
                  <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'none', stroke: T.yl, strokeWidth: 2 }}><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" /></svg>
                </button>}
                {!isRet && c.status !== 'voided' && c.status !== 'draft' && <button onClick={e => { e.stopPropagation(); setIsReturn(true); selectReturnSource(c); setShowModal(true); }} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 2, opacity: 0.6 }} title="Create return for this challan">
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
