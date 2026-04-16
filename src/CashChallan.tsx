import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import CashBook from './CashBook';

const supabase = createClient(
  'https://ulphprdnswznfztawbvg.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVscGhwcmRuc3d6bmZ6dGF3YnZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNjE4NzYsImV4cCI6MjA4OTkzNzg3Nn0.RRNY3KQhYnkJzSfh-GRoTCgdhDQNhE7kJJrpTq2n_K0'
);

const ccAudit = (action: string, details: string) => {
  supabase.auth.getUser().then(({ data }) => {
    supabase.from('audit_log').insert({ action, module: 'cash_challan', details, user_id: data.user?.id });
  });
};

const T = {
  bg: '#060810',
  bd: 'rgba(255,255,255,0.05)', bd2: 'rgba(255,255,255,0.08)',
  tx: '#E2E8F0', tx2: '#8896B0', tx3: '#4A5568',
  ac: '#6366F1', ac2: '#818CF8',
  gr: '#22C55E', re: '#EF4444', yl: '#F59E0B', bl: '#38BDF8',
  mono: "'JetBrains Mono', monospace", sans: "'Inter', -apple-system, sans-serif",
  sora: "'Sora', 'Inter', sans-serif",
};

interface ChallanItem { id?: string; sku: string; description: string; quantity: number; price: number; total: number; }
interface Challan {
  id: string; challan_number: number; customer_id: string | null; customer_name: string;
  status: string; subtotal: number; discount_type: string | null; discount_value: number;
  discount_amount: number; round_off: number; total: number; amount_paid: number;
  payment_mode: string | null; payment_date: string | null; notes: string; tags: string[];
  created_by: string; modified_by: string; voided_by: string | null; voided_at: string | null;
  created_at: string; updated_at: string; items?: ChallanItem[];
}
interface Customer { id: string; name: string; phone: string; address: string; }

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  draft: { bg: 'rgba(56,189,248,.10)', color: T.bl },
  paid: { bg: 'rgba(34,197,94,.10)', color: T.gr },
  unpaid: { bg: 'rgba(239,68,68,.10)', color: T.re },
  partial: { bg: 'rgba(245,158,11,.10)', color: T.yl },
  voided: { bg: 'rgba(255,255,255,.05)', color: T.tx3 },
};

const PAYMENT_MODES = ['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Card', 'Other'];

export default function CashChallan() {
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
  const [items, setItems] = useState<ChallanItem[]>([{ sku: '', description: '', quantity: 1, price: 0, total: 0 }]);
  const [discountType, setDiscountType] = useState<string>('flat');
  const [discountValue, setDiscountValue] = useState(0);
  const [shippingCharges, setShippingCharges] = useState(0);
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState('');
  const [paymentMode, setPaymentMode] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [amountPaid, setAmountPaid] = useState(0);
  const [challanStatus, setChallanStatus] = useState('draft');
  const [customerPhone, setCustomerPhone] = useState('');
  const [isReturn, setIsReturn] = useState(false);
  const [auditTrail, setAuditTrail] = useState<any[] | null>(null);
  const [reminderChallan, setReminderChallan] = useState<any | null>(null);
  const [reminderPhone, setReminderPhone] = useState('');

  // Analytics
  const [showErpReminder, setShowErpReminder] = useState(false);
  const [userName, setUserName] = useState('there');
  const [confirmAction, setConfirmAction] = useState<{ type: 'void' | 'delete'; id: string; challanNumber?: number } | null>(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [analytics, setAnalytics] = useState<{ totalRevenue: number; count: number; byMode: Record<string, number> }>({ totalRevenue: 0, count: 0, byMode: {} });
  const [analyticsFrom, setAnalyticsFrom] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; });
  const [analyticsTo, setAnalyticsTo] = useState(() => new Date().toISOString().slice(0, 10));

  // Ledger
  const [showLedger, setShowLedger] = useState(false);
  const [showCashBook, setShowCashBook] = useState(false);
  const [ledgerCustomers, setLedgerCustomers] = useState<{ name: string; total: number; paid: number; outstanding: number; count: number }[]>([]);
  const [ledgerDetail, setLedgerDetail] = useState<string | null>(null);
  const [ledgerChallans, setLedgerChallans] = useState<Challan[]>([]);
  const [ledgerSearch, setLedgerSearch] = useState('');

  const searchTimeout = useRef<any>(null);

  // ── Computed values ────────────────────────────────────────────────────────
  const subtotal = items.reduce((s, i) => s + i.quantity * i.price, 0);
  const discountAmount = discountType === 'percentage' ? subtotal * discountValue / 100 : discountValue;
  const afterDiscount = subtotal - discountAmount + shippingCharges;
  const roundOff = Math.round(afterDiscount) - afterDiscount;
  const grandTotal = Math.round(afterDiscount);

  // ── Fetch challans ─────────────────────────────────────────────────────────
  const fetchChallans = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('cash_challans').select('*, cash_challan_items(sku)', { count: 'exact' });
    if (search) query = query.or(`customer_name.ilike.%${search}%,challan_number.eq.${isNaN(Number(search)) ? 0 : search}`);
    if (statusFilter) query = query.eq('status', statusFilter);
    if (tagFilter) query = query.contains('tags', [tagFilter]);
    query = query.order('created_at', { ascending: false }).range(page * pageSize, (page + 1) * pageSize - 1);
    const { data, count } = await query;
    setChallans(data || []);
    setTotalCount(count || 0);
    setLoading(false);
  }, [search, statusFilter, tagFilter, page, pageSize]);

  useEffect(() => { fetchChallans(); }, [fetchChallans]);

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

  // ── Customer auto-suggest ──────────────────────────────────────────────────
  const searchCustomers = useCallback(async (q: string) => {
    if (q.length < 2) { setCustomerSuggestions([]); return; }
    const { data } = await supabase.from('cash_challan_customers').select('*').ilike('name', `%${q}%`).limit(5);
    setCustomerSuggestions(data || []);
    // Auto-fill phone if exact match found (case-insensitive)
    const exact = (data || []).find((c: any) => c.name.toLowerCase() === q.trim().toLowerCase());
    if (exact) {
      setSelectedCustomerId(exact.id);
      if (exact.phone && !customerPhone) setCustomerPhone(exact.phone);
    }
  }, [customerPhone]);

  // ── Fetch analytics ────────────────────────────────────────────────────────
  const fetchAnalytics = useCallback(async () => {
    const { data } = await supabase.from('cash_challans').select('total, payment_mode, status, is_return')
      .gte('created_at', analyticsFrom + 'T00:00:00').lte('created_at', analyticsTo + 'T23:59:59').neq('status', 'voided');
    // Returns reduce revenue (negative)
    const totalRevenue = (data || []).reduce((s: number, r: any) => s + (r.is_return ? -1 : 1) * Number(r.total), 0);
    const byMode: Record<string, number> = {};
    (data || []).forEach((r: any) => { const m = r.payment_mode || 'Unset'; byMode[m] = (byMode[m] || 0) + (r.is_return ? -1 : 1) * Number(r.total); });
    const salesCount = (data || []).filter((r: any) => !r.is_return).length;
    const returnsCount = (data || []).filter((r: any) => r.is_return).length;
    setAnalytics({ totalRevenue, count: salesCount, byMode, returnsCount } as any);
  }, [analyticsFrom, analyticsTo]);

  // ── Fetch ledger (recent 10 customers) ──────────────────────────────────────
  const fetchLedger = useCallback(async () => {
    // Get last 10 distinct customers by most recent challan
    const { data } = await supabase.from('cash_challans').select('customer_name, total, amount_paid, is_return, created_at').neq('status', 'voided').order('created_at', { ascending: false }).limit(100);
    const map: Record<string, { total: number; paid: number; count: number; latest: string }> = {};
    (data || []).forEach((r: any) => {
      const name = r.customer_name;
      const sign = r.is_return ? -1 : 1;
      if (!map[name]) map[name] = { total: 0, paid: 0, count: 0, latest: r.created_at };
      map[name].total += sign * Number(r.total);
      map[name].paid += sign * Number(r.amount_paid || 0);
      map[name].count++;
    });
    const list = Object.entries(map).map(([name, v]) => ({ name, total: v.total, paid: v.paid, outstanding: v.total - v.paid, count: v.count }));
    list.sort((a, b) => (map[b.name].latest > map[a.name].latest ? 1 : -1));
    setLedgerCustomers(list.slice(0, 10));
  }, []);

  const searchLedgerCustomer = useCallback(async (q: string) => {
    if (!q.trim()) { fetchLedger(); return; }
    const { data } = await supabase.from('cash_challans').select('customer_name, total, amount_paid, is_return').neq('status', 'voided').ilike('customer_name', `%${q}%`);
    const map: Record<string, { total: number; paid: number; count: number }> = {};
    (data || []).forEach((r: any) => {
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
    const { data } = await supabase.from('cash_challans').select('*').eq('customer_name', name).order('created_at', { ascending: false });
    setLedgerChallans(data || []);
  }, []);

  // ── Save challan ───────────────────────────────────────────────────────────
  const [formError, setFormError] = useState('');
  const saveChallan = async () => {
    setFormError('');
    if (!customerName.trim()) { setFormError('Customer name is required'); return; }
    if (items.length === 0) { setFormError('Add at least one item'); return; }
    const invalidItem = items.find(it => !it.sku.trim() || it.quantity <= 0 || it.price <= 0);
    if (invalidItem) { setFormError('All items must have SKU, quantity > 0, and price > 0'); return; }
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
          const { data: raceCust } = await supabase.from('cash_challan_customers').select('id').ilike('name', trimmed).single();
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
      subtotal, discount_type: discountType, discount_value: discountValue,
      discount_amount: discountAmount, shipping_charges: shippingCharges, round_off: roundOff, total: grandTotal,
      amount_paid: amountPaid, payment_mode: paymentMode || null,
      payment_date: paymentDate || null, notes, tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      is_return: isReturn,
      modified_by: user?.id,
    };

    if (editing) {
      await supabase.from('cash_challans').update({ ...challanData, updated_at: new Date().toISOString() }).eq('id', editing.id);
      await supabase.from('cash_challan_items').delete().eq('challan_id', editing.id);
      await supabase.from('cash_challan_items').insert(items.map((it, i) => ({ challan_id: editing.id, sku: it.sku, description: it.description, quantity: it.quantity, price: it.price, total: it.quantity * it.price, sort_order: i })));
      ccAudit('UPDATE', `Challan #${editing.challan_number} updated for ${customerName.trim()} - ₹${grandTotal}`);
    } else {
      const { data: newChallan } = await supabase.from('cash_challans').insert({ ...challanData, created_by: user?.id }).select('id, challan_number').single();
      if (newChallan) {
        await supabase.from('cash_challan_items').insert(items.map((it, i) => ({ challan_id: newChallan.id, sku: it.sku, description: it.description, quantity: it.quantity, price: it.price, total: it.quantity * it.price, sort_order: i })));
        ccAudit('CREATE', `${isReturn ? 'Return' : 'Challan'} #${newChallan.challan_number} created for ${customerName.trim()} - ₹${grandTotal}`);
      }
    }
    const wasNew = !editing;
    closeModal();
    fetchChallans();
    if (wasNew) setShowErpReminder(true);
  };

  // ── Void challan ───────────────────────────────────────────────────────────
  const voidChallan = async (id: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: before } = await supabase.from('cash_challans').select('challan_number, customer_name, total').eq('id', id).single();
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
  const sendReminder = async (c: any) => {
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

  // ── Export customer ledger CSV ─────────────────────────────────────────────
  const exportLedgerCSV = (customerName: string) => {
    if (ledgerChallans.length === 0) return;
    const rows = ledgerChallans.map(c => {
      const sign = (c as any).is_return ? -1 : 1;
      return `${c.challan_number},${new Date(c.created_at).toLocaleDateString('en-IN')},${(c as any).is_return ? 'Return' : 'Sale'},${sign * Number(c.total)},${sign * Number(c.amount_paid || 0)},${sign * (Number(c.total) - Number(c.amount_paid || 0))},${c.status},"${(c.notes || '').replace(/"/g, '""')}"`;
    });
    const totalBilled = ledgerChallans.filter(c => !(c as any).is_return).reduce((s, c) => s + Number(c.total), 0);
    const totalReturns = ledgerChallans.filter(c => (c as any).is_return).reduce((s, c) => s + Number(c.total), 0);
    const totalPaid = ledgerChallans.reduce((s, c) => s + ((c as any).is_return ? -1 : 1) * Number(c.amount_paid || 0), 0);
    const outstanding = totalBilled - totalReturns - totalPaid;
    const csv = 'Challan #,Date,Type,Amount,Paid,Outstanding,Status,Notes\n' + rows.join('\n') +
      `\n,,,Total Billed,${totalBilled},,\n,,,Total Returns,-${totalReturns},,\n,,,Total Paid,${totalPaid},,\n,,,Outstanding,${outstanding},,`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `Ledger_${customerName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  // ── Open edit ──────────────────────────────────────────────────────────────
  const openEdit = async (c: Challan) => {
    const [{ data: citems }, { data: cust }] = await Promise.all([
      supabase.from('cash_challan_items').select('*').eq('challan_id', c.id).order('sort_order'),
      c.customer_id ? supabase.from('cash_challan_customers').select('phone').eq('id', c.customer_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    setEditing(c);
    setCustomerName(c.customer_name);
    setSelectedCustomerId(c.customer_id);
    setCustomerPhone(cust?.phone || '');
    setIsReturn(!!(c as any).is_return);
    setItems((citems || []).map(i => ({ sku: i.sku || '', description: i.description, quantity: i.quantity, price: Number(i.price), total: Number(i.total) })));
    setDiscountType(c.discount_type || 'flat');
    setDiscountValue(Number(c.discount_value));
    setShippingCharges(Number((c as any).shipping_charges || 0));
    setNotes(c.notes || '');
    setTags((c.tags || []).join(', '));
    setPaymentMode(c.payment_mode || '');
    setPaymentDate(c.payment_date || '');
    setAmountPaid(Number(c.amount_paid));
    setChallanStatus(c.status);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false); setEditing(null); setCustomerName(''); setSelectedCustomerId(null); setCustomerPhone(''); setIsReturn(false);
    setItems([{ sku: '', description: '', quantity: 1, price: 0, total: 0 }]);
    setDiscountType('flat'); setDiscountValue(0); setShippingCharges(0); setNotes(''); setTags('');
    setPaymentMode(''); setPaymentDate(''); setAmountPaid(0); setChallanStatus('draft');
    setCustomerSuggestions([]);
  };

  // ── Print ──────────────────────────────────────────────────────────────────
  const printChallan = async (c: Challan) => {
    const { data: citems } = await supabase.from('cash_challan_items').select('*').eq('challan_id', c.id).order('sort_order');
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><title>Cash Challan #${c.challan_number}</title><style>body{font-family:Arial,sans-serif;padding:20px;max-width:600px;margin:auto}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;font-size:12px}th{background:#f5f5f5;font-weight:600}.right{text-align:right}.header{text-align:center;margin-bottom:16px}.status{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600}</style></head><body>`);
    w.document.write(`<div class="header"><h2 style="margin:0">Arya Designs</h2><p style="color:#666;font-size:11px;margin:4px 0">${(c as any).is_return ? 'Return Challan' : 'Cash Challan'} #${c.challan_number} | ${new Date(c.created_at).toLocaleDateString('en-IN')}</p></div>`);
    w.document.write(`<p><strong>Customer:</strong> ${c.customer_name}</p>`);
    w.document.write(`<table><thead><tr><th>#</th><th>SKU</th><th class="right">Qty</th><th class="right">Price</th><th class="right">Total</th></tr></thead><tbody>`);
    (citems || []).forEach((it: any, i: number) => { w.document.write(`<tr><td>${i + 1}</td><td>${it.sku || '-'}</td><td class="right">${it.quantity}</td><td class="right">${Number(it.price).toFixed(2)}</td><td class="right">${Number(it.total).toFixed(2)}</td></tr>`); });
    w.document.write(`</tbody></table>`);
    w.document.write(`<div style="text-align:right;font-size:12px"><p>Subtotal: <strong>${Number(c.subtotal).toFixed(2)}</strong></p>`);
    if (Number(c.discount_amount) > 0) w.document.write(`<p>Discount: -${Number(c.discount_amount).toFixed(2)}</p>`);
    if (Number((c as any).shipping_charges) > 0) w.document.write(`<p>Shipping/Porter: +${Number((c as any).shipping_charges).toFixed(2)}</p>`);
    if (Number(c.round_off) !== 0) w.document.write(`<p>Round Off: ${Number(c.round_off).toFixed(2)}</p>`);
    w.document.write(`<p style="font-size:16px;font-weight:700">Total: ₹${Number(c.total).toFixed(2)}</p></div>`);
    if (c.notes) w.document.write(`<p style="font-size:11px;color:#666;margin-top:12px"><strong>Notes:</strong> ${c.notes}</p>`);
    w.document.write(`<hr><p style="text-align:center;font-size:10px;color:#999">Powered by DailyOffice</p></body></html>`);
    w.document.close();
    w.print();
  };

  // ── WhatsApp share ─────────────────────────────────────────────────────────
  const shareChallan = (c: Challan) => {
    const text = `*Cash Challan #${c.challan_number}*\nCustomer: ${c.customer_name}\nDate: ${new Date(c.created_at).toLocaleDateString('en-IN')}\nTotal: ₹${Number(c.total).toFixed(2)}\nStatus: ${c.status.toUpperCase()}\n${c.amount_paid > 0 ? `Paid: ₹${Number(c.amount_paid).toFixed(2)}` : ''}\n\n_Powered by DailyOffice_`;
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
    <div style={{ fontFamily: T.sans, color: T.tx, padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600, fontFamily: T.sora }}>Analytics</span>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12 }}>
        <input type="date" value={analyticsFrom} onChange={e => setAnalyticsFrom(e.target.value)} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd2}`, borderRadius: 6, color: T.tx, fontSize: 10, padding: '5px 8px', outline: 'none' }} />
        <span style={{ fontSize: 10, color: T.tx3 }}>to</span>
        <input type="date" value={analyticsTo} onChange={e => setAnalyticsTo(e.target.value)} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd2}`, borderRadius: 6, color: T.tx, fontSize: 10, padding: '5px 8px', outline: 'none' }} />
        <button onClick={fetchAnalytics} style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: `linear-gradient(135deg, ${T.ac}dd, ${T.ac2}cc)`, color: '#fff', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>Apply</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
        <div style={{ background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.15)', borderRadius: 10, padding: '12px', textAlign: 'center' }}>
          <div style={{ fontSize: 8, color: T.gr, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600, marginBottom: 3 }}>Revenue (excl. discount)</div>
          <div style={{ fontSize: 22, fontWeight: 800, fontFamily: T.sora, color: T.gr }}>₹{analytics.totalRevenue.toLocaleString('en-IN')}</div>
        </div>
        <div style={{ background: 'rgba(99,102,241,.06)', border: '1px solid rgba(99,102,241,.12)', borderRadius: 10, padding: '12px', textAlign: 'center' }}>
          <div style={{ fontSize: 8, color: T.ac2, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600, marginBottom: 3 }}>Challans Today</div>
          <div style={{ fontSize: 22, fontWeight: 800, fontFamily: T.sora, color: T.ac2 }}>{analytics.count}</div>
        </div>
      </div>
      <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '8px 12px', borderBottom: `1px solid ${T.bd}`, fontSize: 10, fontWeight: 600, color: T.tx3, textTransform: 'uppercase', letterSpacing: 1 }}>Payment Mode Breakup</div>
        {Object.entries(analytics.byMode).map(([mode, amount]) => (
          <div key={mode} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderBottom: `1px solid ${T.bd}` }}>
            <span style={{ fontSize: 12, color: T.tx }}>{mode}</span>
            <span style={{ fontSize: 12, fontFamily: T.mono, color: T.ac2, fontWeight: 600 }}>₹{Number(amount).toLocaleString('en-IN')}</span>
          </div>
        ))}
        {Object.keys(analytics.byMode).length === 0 && <div style={{ padding: 16, textAlign: 'center', color: T.tx3, fontSize: 11 }}>No data for today</div>}
      </div>
    </div>
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
            <button onClick={() => exportLedgerCSV(ledgerDetail)} style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${T.bd2}`, background: 'rgba(255,255,255,0.03)', color: T.tx3, fontSize: 10, cursor: 'pointer', fontFamily: T.sans }}>Export CSV</button>
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
            const isRet = !!(c as any).is_return;
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
          {ledgerCustomers.length === 0 && <div style={{ padding: 16, textAlign: 'center', color: T.tx3, fontSize: 11 }}>No customers found.</div>}
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
          <button onClick={closeModal} style={{ padding: '5px 12px', borderRadius: 6, border: `1px solid ${T.bd2}`, background: 'rgba(255,255,255,0.03)', color: T.tx3, fontSize: 10, cursor: 'pointer' }}>Cancel</button>
        </div>

        {/* Sale / Return Toggle */}
        <div style={{ display: 'flex', gap: 3, marginBottom: 10, background: 'rgba(255,255,255,0.02)', borderRadius: 6, padding: 2, width: 'fit-content', border: `1px solid ${T.bd}` }}>
          {([{ v: false, label: 'Sale', color: T.gr }, { v: true, label: '↩ Return', color: T.re }] as const).map(opt => (
            <div key={String(opt.v)} onClick={() => !editing && setIsReturn(opt.v)} style={{ padding: '5px 14px', borderRadius: 4, fontSize: 10, fontWeight: isReturn === opt.v ? 600 : 400, cursor: editing ? 'not-allowed' : 'pointer', opacity: editing ? 0.6 : 1, background: isReturn === opt.v ? opt.color + '33' : 'transparent', color: isReturn === opt.v ? opt.color : T.tx3, border: isReturn === opt.v ? `1px solid ${opt.color}44` : 'none' }}>{opt.label}</div>
          ))}
        </div>

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
          <label style={lbl}>Items</label>
          <div style={{ background: 'rgba(0,0,0,.15)', border: `1px solid ${T.bd}`, borderRadius: 8, marginBottom: 12, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 50px 70px 24px', gap: 4, padding: '5px 8px', borderBottom: `1px solid ${T.bd}`, background: 'rgba(255,255,255,0.015)' }}>
              <span style={{ fontSize: 8, color: T.tx3, fontWeight: 600, letterSpacing: .5 }}>SKU</span>
              <span style={{ fontSize: 8, color: T.tx3, fontWeight: 600, letterSpacing: .5, textAlign: 'center' }}>QTY</span>
              <span style={{ fontSize: 8, color: T.tx3, fontWeight: 600, letterSpacing: .5, textAlign: 'right' }}>PRICE</span>
              <span />
            </div>
            {items.map((it, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 50px 70px 24px', gap: 4, padding: '5px 8px', borderBottom: `1px solid ${T.bd}`, alignItems: 'center' }}>
                <input value={it.sku} onChange={e => { const n = [...items]; n[i].sku = e.target.value; setItems(n); }} placeholder="SKU / Item name" style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd}`, borderRadius: 4, color: T.tx, fontSize: 11, padding: '6px', outline: 'none', fontFamily: T.mono }} />
                <input type="number" value={it.quantity || ''} onChange={e => { const n = [...items]; n[i].quantity = Number(e.target.value); setItems(n); }} placeholder="1" style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd}`, borderRadius: 4, color: T.tx, fontSize: 11, padding: '6px', outline: 'none', textAlign: 'center' }} />
                <input type="number" value={it.price || ''} onChange={e => { const n = [...items]; n[i].price = Number(e.target.value); setItems(n); }} placeholder="0" style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd}`, borderRadius: 4, color: T.tx, fontSize: 11, padding: '6px', outline: 'none', textAlign: 'right', fontFamily: T.mono }} />
                <button onClick={() => { if (items.length > 1) setItems(items.filter((_, j) => j !== i)); }} style={{ border: 'none', background: 'none', color: T.re, cursor: 'pointer', fontSize: 14, padding: 0, opacity: 0.6 }}>×</button>
              </div>
            ))}
            <button onClick={() => setItems([...items, { sku: '', description: '', quantity: 1, price: 0, total: 0 }])} style={{ width: '100%', padding: '7px', border: 'none', background: 'rgba(99,102,241,.06)', color: T.ac2, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>+ Add Item</button>
          </div>

          {/* Discount + Shipping + Tags */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <label style={lbl}>Discount</label>
              <div style={{ display: 'flex', gap: 4 }}>
                <select value={discountType} onChange={e => setDiscountType(e.target.value)} style={{ ...inp, width: 'auto', padding: '6px 8px', fontSize: 11 }}>
                  <option value="flat">₹ Flat</option><option value="percentage">%</option>
                </select>
                <input type="number" value={discountValue || ''} onChange={e => setDiscountValue(Number(e.target.value))} placeholder="0" style={{ ...inp, flex: 1, fontFamily: T.mono, fontSize: 11 }} />
              </div>
            </div>
            <div>
              <label style={lbl}>Shipping/Porter</label>
              <input type="number" value={shippingCharges || ''} onChange={e => setShippingCharges(Number(e.target.value))} placeholder="0" style={{ ...inp, fontFamily: T.mono, fontSize: 11 }} />
            </div>
            <div>
              <label style={lbl}>Tags</label>
              <input value={tags} onChange={e => setTags(e.target.value)} placeholder="vip, urgent" style={{ ...inp, fontSize: 11 }} />
            </div>
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Optional notes..." style={{ ...inp, resize: 'vertical', fontSize: 11 }} />
          </div>

          {/* Payment row */}
          <div style={{ display: 'grid', gridTemplateColumns: (challanStatus === 'paid' || challanStatus === 'partial') ? '1fr 1fr 1fr 1fr' : '1fr 1fr 1fr', gap: 8 }}>
            <div>
              <label style={lbl}>Status</label>
              <select value={challanStatus} onChange={e => setChallanStatus(e.target.value)} style={{ ...inp, fontSize: 11 }}>
                <option value="draft">Draft</option><option value="unpaid">Unpaid</option><option value="paid">Paid</option><option value="partial">Partial</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Payment Mode</label>
              <select value={paymentMode} onChange={e => setPaymentMode(e.target.value)} style={{ ...inp, fontSize: 11 }}>
                <option value="">Select...</option>{PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Amount Paid</label>
              <input type="number" value={amountPaid || ''} onChange={e => setAmountPaid(Number(e.target.value))} placeholder="0" style={{ ...inp, fontFamily: T.mono, fontSize: 11 }} />
            </div>
            {(challanStatus === 'paid' || challanStatus === 'partial') && (
              <div>
                <label style={lbl}>Payment Date</label>
                <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} style={{ ...inp, fontSize: 11 }} />
              </div>
            )}
          </div>
        </div>

        {/* Totals card */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: '12px 16px', marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.tx2, marginBottom: 4 }}><span>Subtotal</span><span style={{ fontFamily: T.mono }}>₹{subtotal.toFixed(2)}</span></div>
          {discountAmount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.re, marginBottom: 4 }}><span>Discount ({discountType === 'percentage' ? `${discountValue}%` : 'Flat'})</span><span style={{ fontFamily: T.mono }}>-₹{discountAmount.toFixed(2)}</span></div>}
          {shippingCharges > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.bl, marginBottom: 4 }}><span>Shipping/Porter</span><span style={{ fontFamily: T.mono }}>+₹{shippingCharges.toFixed(2)}</span></div>}
          {roundOff !== 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.tx3, marginBottom: 4 }}><span>Round Off</span><span style={{ fontFamily: T.mono }}>{roundOff > 0 ? '+' : ''}₹{roundOff.toFixed(2)}</span></div>}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 800, color: T.gr, fontFamily: T.sora, borderTop: `1px solid ${T.bd}`, paddingTop: 8, marginTop: 4 }}><span>Total</span><span>₹{grandTotal.toLocaleString('en-IN')}</span></div>
        </div>

        {formError && <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '8px 12px', fontSize: 11, color: T.re, marginBottom: 8 }}>{formError}</div>}
        <button onClick={saveChallan} style={{ width: '100%', padding: '12px', borderRadius: 10, border: 'none', fontSize: 13, fontWeight: 700, background: `linear-gradient(135deg, ${T.ac}, ${T.ac2})`, color: '#fff', cursor: 'pointer', boxShadow: '0 4px 16px rgba(99,102,241,.3)' }}>{editing ? 'Update Challan' : 'Create Challan'}</button>
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
                  <span style={{ fontSize: 9, color: T.tx3, fontFamily: T.mono }}>{new Date(a.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
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
        {!loading && challans.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: T.tx3, fontSize: 11 }}>No challans found. Create your first one.</div>}
        {challans.map(c => {
          const sc = STATUS_COLORS[c.status] || STATUS_COLORS.unpaid;
          const skus = ((c as any).cash_challan_items || []).map((i: any) => i.sku).filter(Boolean).join(', ');
          const pendingDays = (!(c as any).is_return && (c.status === 'unpaid' || c.status === 'partial')) ? Math.floor((Date.now() - new Date(c.created_at).getTime()) / 86400000) : 0;
          const isRet = !!(c as any).is_return;
          return (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderBottom: `1px solid ${T.bd}`, cursor: 'pointer' }} onClick={() => openEdit(c)}>
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
                  <span style={{ fontSize: 9, color: T.tx3, fontFamily: T.mono }}>{new Date(a.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
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
              <button onClick={() => setReminderChallan(null)} style={{ flex: 1, padding: '8px 0', borderRadius: 6, border: `1px solid ${T.bd2}`, fontSize: 11, fontWeight: 500, background: 'rgba(255,255,255,0.03)', color: T.tx3, cursor: 'pointer' }}>Cancel</button>
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
            <button onClick={() => setShowErpReminder(false)} style={{ width: '100%', padding: '10px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700, background: `linear-gradient(135deg, ${T.ac}, ${T.ac2})`, color: '#fff', cursor: 'pointer' }}>Got It</button>
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
              <button onClick={() => setConfirmAction(null)} style={{ flex: 1, padding: '8px 0', borderRadius: 6, border: `1px solid ${T.bd2}`, fontSize: 11, fontWeight: 500, background: 'rgba(255,255,255,0.03)', color: T.tx3, cursor: 'pointer' }}>Cancel</button>
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
