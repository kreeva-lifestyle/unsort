/* eslint-disable */
import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://ulphprdnswznfztawbvg.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVscGhwcmRuc3d6bmZ6dGF3YnZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNjE4NzYsImV4cCI6MjA4OTkzNzg3Nn0.RRNY3KQhYnkJzSfh-GRoTCgdhDQNhE7kJJrpTq2n_K0'
);

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
  const [challanStatus, setChallanStatus] = useState('unpaid');

  // Analytics
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [analytics, setAnalytics] = useState<{ totalRevenue: number; count: number; byMode: Record<string, number> }>({ totalRevenue: 0, count: 0, byMode: {} });

  // Ledger
  const [showLedger, setShowLedger] = useState(false);
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
    let query = supabase.from('cash_challans').select('*', { count: 'exact' });
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

  // ── Customer auto-suggest ──────────────────────────────────────────────────
  const searchCustomers = useCallback(async (q: string) => {
    if (q.length < 2) { setCustomerSuggestions([]); return; }
    const { data } = await supabase.from('cash_challan_customers').select('*').ilike('name', `%${q}%`).limit(5);
    setCustomerSuggestions(data || []);
  }, []);

  // ── Fetch analytics ────────────────────────────────────────────────────────
  const fetchAnalytics = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase.from('cash_challans').select('total, payment_mode, status').gte('created_at', today + 'T00:00:00').neq('status', 'voided');
    const totalRevenue = (data || []).reduce((s: number, r: any) => s + Number(r.total), 0);
    const byMode: Record<string, number> = {};
    (data || []).forEach((r: any) => { const m = r.payment_mode || 'Unset'; byMode[m] = (byMode[m] || 0) + Number(r.total); });
    setAnalytics({ totalRevenue, count: (data || []).length, byMode });
  }, []);

  // ── Fetch ledger ───────────────────────────────────────────────────────────
  const fetchLedger = useCallback(async () => {
    const { data } = await supabase.from('cash_challans').select('customer_name, total, amount_paid, status').neq('status', 'voided');
    const map: Record<string, { total: number; paid: number; count: number }> = {};
    (data || []).forEach((r: any) => {
      const name = r.customer_name;
      if (!map[name]) map[name] = { total: 0, paid: 0, count: 0 };
      map[name].total += Number(r.total);
      map[name].paid += Number(r.amount_paid);
      map[name].count++;
    });
    const list = Object.entries(map).map(([name, v]) => ({ name, total: v.total, paid: v.paid, outstanding: v.total - v.paid, count: v.count }));
    list.sort((a, b) => b.outstanding - a.outstanding);
    setLedgerCustomers(list);
  }, []);

  const fetchLedgerDetail = useCallback(async (name: string) => {
    setLedgerDetail(name);
    const { data } = await supabase.from('cash_challans').select('*').eq('customer_name', name).order('created_at', { ascending: false });
    setLedgerChallans(data || []);
  }, []);

  // ── Save challan ───────────────────────────────────────────────────────────
  const saveChallan = async () => {
    if (!customerName.trim() || items.length === 0) return;
    const { data: { user } } = await supabase.auth.getUser();

    // Upsert customer
    let custId = selectedCustomerId;
    if (!custId) {
      const { data: existing } = await supabase.from('cash_challan_customers').select('id').eq('name', customerName.trim()).maybeSingle();
      if (existing) { custId = existing.id; }
      else { const { data: newCust } = await supabase.from('cash_challan_customers').insert({ name: customerName.trim() }).select('id').single(); custId = newCust?.id || null; }
    }

    const challanData = {
      customer_id: custId, customer_name: customerName.trim(), status: challanStatus,
      subtotal, discount_type: discountType, discount_value: discountValue,
      discount_amount: discountAmount, shipping_charges: shippingCharges, round_off: roundOff, total: grandTotal,
      amount_paid: amountPaid, payment_mode: paymentMode || null,
      payment_date: paymentDate || null, notes, tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      modified_by: user?.id,
    };

    if (editing) {
      await supabase.from('cash_challans').update({ ...challanData, updated_at: new Date().toISOString() }).eq('id', editing.id);
      await supabase.from('cash_challan_items').delete().eq('challan_id', editing.id);
      await supabase.from('cash_challan_items').insert(items.map((it, i) => ({ challan_id: editing.id, sku: it.sku, description: it.description, quantity: it.quantity, price: it.price, total: it.quantity * it.price, sort_order: i })));
    } else {
      const { data: newChallan } = await supabase.from('cash_challans').insert({ ...challanData, created_by: user?.id }).select('id').single();
      if (newChallan) {
        await supabase.from('cash_challan_items').insert(items.map((it, i) => ({ challan_id: newChallan.id, sku: it.sku, description: it.description, quantity: it.quantity, price: it.price, total: it.quantity * it.price, sort_order: i })));
      }
    }
    closeModal();
    fetchChallans();
  };

  // ── Void challan ───────────────────────────────────────────────────────────
  const voidChallan = async (id: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('cash_challans').update({ status: 'voided', voided_by: user?.id, voided_at: new Date().toISOString() }).eq('id', id);
    fetchChallans();
  };

  // ── Open edit ──────────────────────────────────────────────────────────────
  const openEdit = async (c: Challan) => {
    const { data: citems } = await supabase.from('cash_challan_items').select('*').eq('challan_id', c.id).order('sort_order');
    setEditing(c);
    setCustomerName(c.customer_name);
    setSelectedCustomerId(c.customer_id);
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
    setShowModal(false); setEditing(null); setCustomerName(''); setSelectedCustomerId(null);
    setItems([{ sku: '', description: '', quantity: 1, price: 0, total: 0 }]);
    setDiscountType('flat'); setDiscountValue(0); setShippingCharges(0); setNotes(''); setTags('');
    setPaymentMode(''); setPaymentDate(''); setAmountPaid(0); setChallanStatus('unpaid');
    setCustomerSuggestions([]);
  };

  // ── Print ──────────────────────────────────────────────────────────────────
  const printChallan = async (c: Challan) => {
    const { data: citems } = await supabase.from('cash_challan_items').select('*').eq('challan_id', c.id).order('sort_order');
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><title>Cash Challan #${c.challan_number}</title><style>body{font-family:Arial,sans-serif;padding:20px;max-width:600px;margin:auto}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;font-size:12px}th{background:#f5f5f5;font-weight:600}.right{text-align:right}.header{text-align:center;margin-bottom:16px}.status{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600}</style></head><body>`);
    w.document.write(`<div class="header"><h2 style="margin:0">Arya Designs</h2><p style="color:#666;font-size:11px;margin:4px 0">Cash Challan #${c.challan_number} | ${new Date(c.created_at).toLocaleDateString('en-IN')}</p></div>`);
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

  // ── Analytics Screen ───────────────────────────────────────────────────────
  if (showAnalytics) return (
    <div style={{ fontFamily: T.sans, color: T.tx, padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 600, fontFamily: T.sora }}>Daily Analytics</span>
        <button onClick={() => setShowAnalytics(false)} style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${T.bd2}`, background: 'rgba(255,255,255,0.03)', color: T.tx3, fontSize: 10, cursor: 'pointer' }}>Back</button>
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
          <button onClick={() => setLedgerDetail(null)} style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${T.bd2}`, background: 'rgba(255,255,255,0.03)', color: T.tx3, fontSize: 10, cursor: 'pointer' }}>Back</button>
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
            return (
              <div key={c.id} onClick={() => openEdit(c)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderBottom: `1px solid ${T.bd}`, cursor: 'pointer' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 10, fontFamily: T.mono, color: T.tx3 }}>#{c.challan_number}</span>
                    <span style={{ fontSize: 9, color: T.tx3 }}>{new Date(c.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}</span>
                    <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 3, background: sc.bg, color: sc.color, fontWeight: 600, textTransform: 'uppercase' }}>{c.status}</span>
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, fontFamily: T.mono, color: T.tx }}>₹{Number(c.total).toLocaleString('en-IN')}</div>
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
    const filtered = ledgerSearch ? ledgerCustomers.filter(c => c.name.toLowerCase().includes(ledgerSearch.toLowerCase())) : ledgerCustomers;
    const totalOutstanding = filtered.reduce((s, c) => s + c.outstanding, 0);
    return (
      <div style={{ fontFamily: T.sans, color: T.tx, padding: '14px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600, fontFamily: T.sora }}>Customer Ledger</span>
          <button onClick={() => { setShowLedger(false); setLedgerSearch(''); }} style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${T.bd2}`, background: 'rgba(255,255,255,0.03)', color: T.tx3, fontSize: 10, cursor: 'pointer' }}>Back</button>
        </div>
        <input type="text" value={ledgerSearch} onChange={e => setLedgerSearch(e.target.value)} placeholder="Search customer..."
          style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd2}`, borderRadius: 6, color: T.tx, fontSize: 11, padding: '7px 10px', outline: 'none', boxSizing: 'border-box', marginBottom: 8 }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 9, color: T.tx3 }}>{filtered.length} customers</span>
          <span style={{ fontSize: 10, color: totalOutstanding > 0 ? T.re : T.gr, fontWeight: 600 }}>Total Outstanding: ₹{totalOutstanding.toLocaleString('en-IN')}</span>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, overflow: 'hidden' }}>
          {filtered.map(c => (
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
          {filtered.length === 0 && <div style={{ padding: 16, textAlign: 'center', color: T.tx3, fontSize: 11 }}>No customers found.</div>}
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
          <span style={{ fontSize: 14, fontWeight: 700, fontFamily: T.sora }}>{editing ? `Edit #${editing.challan_number}` : 'New Cash Challan'}</span>
          <button onClick={closeModal} style={{ padding: '5px 12px', borderRadius: 6, border: `1px solid ${T.bd2}`, background: 'rgba(255,255,255,0.03)', color: T.tx3, fontSize: 10, cursor: 'pointer' }}>Cancel</button>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
          {/* Customer */}
          <div style={{ marginBottom: 12, position: 'relative' }}>
            <label style={lbl}>Customer Name</label>
            <input type="text" value={customerName} onChange={e => { setCustomerName(e.target.value); setSelectedCustomerId(null); clearTimeout(searchTimeout.current); searchTimeout.current = setTimeout(() => searchCustomers(e.target.value), 300); }}
              placeholder="Type customer name..." style={inp} />
            {customerSuggestions.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: 'rgba(14,18,30,.98)', border: `1px solid ${T.bd2}`, borderRadius: 6, maxHeight: 120, overflowY: 'auto' }}>
                {customerSuggestions.map(c => (
                  <div key={c.id} onClick={() => { setCustomerName(c.name); setSelectedCustomerId(c.id); setCustomerSuggestions([]); }}
                    style={{ padding: '8px 10px', fontSize: 11, color: T.tx, cursor: 'pointer', borderBottom: `1px solid ${T.bd}` }}>{c.name} {c.phone && <span style={{ color: T.tx3 }}>({c.phone})</span>}</div>
                ))}
              </div>
            )}
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
                <option value="unpaid">Unpaid</option><option value="paid">Paid</option><option value="partial">Partial</option>
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

        <button onClick={saveChallan} style={{ width: '100%', padding: '12px', borderRadius: 10, border: 'none', fontSize: 13, fontWeight: 700, background: `linear-gradient(135deg, ${T.ac}, ${T.ac2})`, color: '#fff', cursor: 'pointer', boxShadow: '0 4px 16px rgba(99,102,241,.3)' }}>{editing ? 'Update Challan' : 'Create Challan'}</button>
      </div>
    </div>
  );

  // ── List View ──────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: T.sans, color: T.tx, padding: '14px 16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600, fontFamily: T.sora }}>Cash Challan</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => { fetchLedger(); setShowLedger(true); }} style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${T.bd2}`, background: 'rgba(255,255,255,0.03)', color: T.tx3, fontSize: 10, fontWeight: 500, cursor: 'pointer' }}>Ledger</button>
          <button onClick={() => { fetchAnalytics(); setShowAnalytics(true); }} style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${T.bd2}`, background: 'rgba(255,255,255,0.03)', color: T.tx3, fontSize: 10, fontWeight: 500, cursor: 'pointer' }}>Analytics</button>
          <button onClick={() => setShowModal(true)} style={{ padding: '4px 12px', borderRadius: 6, border: 'none', background: `linear-gradient(135deg, ${T.ac}dd, ${T.ac2}cc)`, color: '#fff', fontSize: 10, fontWeight: 600, cursor: 'pointer', boxShadow: '0 2px 8px rgba(99,102,241,.25)' }}>+ New</button>
        </div>
      </div>

      {/* Search + Filters */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Search name or #..." style={{ flex: 1, minWidth: 120, background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd2}`, borderRadius: 6, color: T.tx, fontSize: 11, padding: '6px 10px', outline: 'none' }} />
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(0); }} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd2}`, borderRadius: 6, color: T.tx, fontSize: 10, padding: '6px 8px', outline: 'none' }}>
          <option value="">All Status</option><option value="paid">Paid</option><option value="unpaid">Unpaid</option><option value="partial">Partial</option><option value="voided">Voided</option>
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
          return (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderBottom: `1px solid ${T.bd}`, cursor: 'pointer' }} onClick={() => openEdit(c)}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 10, fontFamily: T.mono, color: T.tx3 }}>#{c.challan_number}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: T.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.customer_name}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 9, color: T.tx3 }}>{new Date(c.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                  <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 3, background: sc.bg, color: sc.color, fontWeight: 600, textTransform: 'uppercase' }}>{c.status}</span>
                  {(c.tags || []).map(t => <span key={t} style={{ fontSize: 7, padding: '1px 4px', borderRadius: 3, background: 'rgba(99,102,241,.08)', color: T.ac2 }}>{t}</span>)}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, fontFamily: T.mono, color: T.tx }}>₹{Number(c.total).toLocaleString('en-IN')}</div>
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <button onClick={e => { e.stopPropagation(); printChallan(c); }} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 2, opacity: 0.5 }}>
                  <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'none', stroke: T.tx2, strokeWidth: 2 }}><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z" /></svg>
                </button>
                <button onClick={e => { e.stopPropagation(); shareChallan(c); }} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 2, opacity: 0.5 }}>
                  <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'none', stroke: T.gr, strokeWidth: 2 }}><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" /></svg>
                </button>
                {c.status !== 'voided' && <button onClick={e => { e.stopPropagation(); if (confirm('Void this challan?')) voidChallan(c.id); }} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 2, opacity: 0.4 }}>
                  <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'none', stroke: T.re, strokeWidth: 2 }}><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 10 }}>
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={{ padding: '4px 10px', borderRadius: 5, border: `1px solid ${T.bd2}`, background: 'rgba(255,255,255,0.03)', color: page === 0 ? T.tx3 : T.tx, fontSize: 10, cursor: page === 0 ? 'default' : 'pointer', opacity: page === 0 ? 0.4 : 1 }}>Prev</button>
          <span style={{ fontSize: 10, color: T.tx3 }}>{page + 1} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} style={{ padding: '4px 10px', borderRadius: 5, border: `1px solid ${T.bd2}`, background: 'rgba(255,255,255,0.03)', color: page >= totalPages - 1 ? T.tx3 : T.tx, fontSize: 10, cursor: page >= totalPages - 1 ? 'default' : 'pointer', opacity: page >= totalPages - 1 ? 0.4 : 1 }}>Next</button>
        </div>
      )}
    </div>
  );
}
