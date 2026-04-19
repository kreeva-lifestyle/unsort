/* eslint-disable */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from './lib/supabase';

import { T } from './lib/theme';
import type {
  CashExpense,
  CashExpenseInsert,
  CashHandover,
  CashHandoverInsert,
  CashBookBalanceInsert,
  CashChallan,
  Profile,
} from './types/database';

const CATEGORIES = ['Office Supplies', 'Rent', 'Salaries', 'Travel', 'Utilities', 'Food', 'Transport', 'Misc'];

// In-memory / jsonb-embedded cash-flow snapshot. Stored in
// cash_handovers.breakdown as jsonb, read back and cast to this shape.
interface Breakdown { opening: number; cashSales: number; cashReturns: number; expenses: number; previousHandovers: number; available: number; periodFrom: string; periodTo: string; }

// View model: central CashHandover row but with the jsonb breakdown
// narrowed to the local Breakdown shape for typed access.
type Handover = Omit<CashHandover, 'breakdown'> & { breakdown: Breakdown | null };

// View model: narrowed cash_expenses projection used by the expenses tab.
type ExpenseRow = Pick<CashExpense, 'id' | 'date' | 'amount' | 'category' | 'description' | 'created_at'>;

// View model: narrowed cash_challans projection used by the sales tab.
type CashSaleRow = Pick<CashChallan, 'id' | 'challan_number' | 'customer_name' | 'total' | 'amount_paid' | 'status' | 'is_return' | 'payment_mode' | 'payment_date' | 'created_at'>;

export default function CashBook() {
  const today = new Date().toISOString().slice(0, 10);
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  // Single 'date' for new expense/handover input — defaults to today
  const [entryDate, setEntryDate] = useState(today);
  const [tab, setTab] = useState<'expenses' | 'sales' | 'handovers'>('expenses');
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [sales, setSales] = useState<CashSaleRow[]>([]);
  const [handovers, setHandovers] = useState<Handover[]>([]);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [editingOpening, setEditingOpening] = useState(false);
  const [openingInput, setOpeningInput] = useState('0');
  const [showAdd, setShowAdd] = useState(false);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [pendingExpDel, setPendingExpDel] = useState<{ id: string; timer: number } | null>(null);
  // Handover form
  const [showHandover, setShowHandover] = useState(false);
  const [handAmount, setHandAmount] = useState('');
  const [handToId, setHandToId] = useState('');
  const [handNotes, setHandNotes] = useState('');
  const [handReason, setHandReason] = useState('');
  const [handPeriodFrom, setHandPeriodFrom] = useState(today);
  const [handPeriodTo, setHandPeriodTo] = useState(today);
  const [handBreakdown, setHandBreakdown] = useState<Breakdown | null>(null);
  const [handError, setHandError] = useState('');
  const [viewingHandover, setViewingHandover] = useState<Handover | null>(null);
  // Users list (for recipient dropdown)
  const [users, setUsers] = useState<{ id: string; full_name: string; email: string; has_pin: boolean; phone: string | null }[]>([]);
  const [recentHandovers, setRecentHandovers] = useState<Handover[]>([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const [excludePaise, setExcludePaise] = useState(false);
  // Confirm handover with PIN
  const [confirmingHandover, setConfirmingHandover] = useState<Handover | null>(null);
  const [confirmPin, setConfirmPin] = useState('');
  const [confirmError, setConfirmError] = useState('');
  // PIN lockout — exponential backoff after wrong attempts (audit P1)
  const [pinAttempts, setPinAttempts] = useState(0);
  const [pinLockUntil, setPinLockUntil] = useState<number>(0);

  const fetchData = useCallback(async () => {
    // Opening balance — uses From date
    const { data: bal } = await supabase.from('cash_book_balances').select('opening_balance').eq('date', fromDate).maybeSingle();
    setOpeningBalance(Number(bal?.opening_balance || 0));
    setOpeningInput(String(bal?.opening_balance || 0));

    // Expenses in date range
    const { data: exp } = await supabase.from('cash_expenses').select('id, date, amount, category, description, created_at').gte('date', fromDate).lte('date', toDate).order('date', { ascending: false }).order('created_at', { ascending: false });
    setExpenses(exp || []);

    // Cash sales (challans paid in cash, created in date range)
    const { data: ch } = await supabase.from('cash_challans').select('id, challan_number, customer_name, total, amount_paid, status, is_return, payment_mode, payment_date, created_at')
      .eq('payment_mode', 'Cash').in('status', ['paid', 'partial']).gte('created_at', fromDate + 'T00:00:00').lte('created_at', toDate + 'T23:59:59').order('created_at', { ascending: false });
    setSales(ch || []);

    // Handovers in date range
    const { data: ho } = await supabase.from('cash_handovers').select('id, date, amount, from_user_name, to_user_name, status, confirmed_at, created_at, period_from, period_to, breakdown, reason, from_user_id, to_user_id, notes').gte('date', fromDate).lte('date', toDate).order('date', { ascending: false }).order('created_at', { ascending: false });
    setHandovers((ho as Handover[] | null) || []);
  }, [fromDate, toDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Load active users for handover recipient dropdown
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentUserId(user.id);
      const { data } = await supabase.from('profiles').select('id, full_name, email, phone').eq('is_active', true).order('full_name');
      type UserRow = Pick<Profile, 'id' | 'full_name' | 'email' | 'phone'>;
      setUsers((data as UserRow[] | null || []).map((u) => ({ id: u.id, full_name: u.full_name ?? '', email: u.email, has_pin: true, phone: u.phone })));
    })();
  }, []);

  // ── Realtime sync — multi-user safety ──────────────────────────────────────
  useEffect(() => {
    const channel = supabase.channel('cash_book_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_expenses' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_book_balances' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_challans' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_handovers' }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  const cashInSales = sales.filter(s => !s.is_return).reduce((s, r) => s + Number(r.amount_paid || 0), 0);
  const cashOutReturns = sales.filter(s => s.is_return).reduce((s, r) => s + Number(r.amount_paid || 0), 0);
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const totalHandovers = handovers.filter(h => h.status === 'confirmed').reduce((s, h) => s + Number(h.amount), 0);
  const closingBalance = openingBalance + cashInSales - cashOutReturns - totalExpenses - totalHandovers;

  const saveOpening = async () => {
    const val = Number(openingInput) || 0;
    const payload: CashBookBalanceInsert = { date: fromDate, opening_balance: val };
    await supabase.from('cash_book_balances').upsert(payload, { onConflict: 'date' });
    setEditingOpening(false);
    fetchData();
  };

  const addExpense = async () => {
    setFormError('');
    const amt = Number(amount);
    if (!amt || amt <= 0) { setFormError('Amount must be greater than 0'); return; }
    if (!category) { setFormError('Category is required'); return; }
    const { data: { user } } = await supabase.auth.getUser();
    const payload: CashExpenseInsert = { date: entryDate, amount: amt, category, description: description.trim() || null, paid_by: user?.id ?? null };
    const { error } = await supabase.from('cash_expenses').insert(payload);
    if (error) { setFormError('Save failed: ' + error.message); return; }
    setAmount(''); setDescription(''); setCategory(CATEGORIES[0]); setShowAdd(false);
    fetchData();
  };

  // Compute available cash for a date range (auto-calc for handover)
  const computeBreakdown = useCallback(async (from: string, to: string): Promise<Breakdown> => {
    const [{ data: bal }, { data: exp }, { data: ch }, { data: ho }] = await Promise.all([
      supabase.from('cash_book_balances').select('opening_balance').eq('date', from).maybeSingle(),
      supabase.from('cash_expenses').select('amount').gte('date', from).lte('date', to),
      supabase.from('cash_challans').select('amount_paid, is_return, status').eq('payment_mode', 'Cash').in('status', ['paid', 'partial']).gte('created_at', from + 'T00:00:00').lte('created_at', to + 'T23:59:59'),
      supabase.from('cash_handovers').select('amount, status, period_from, period_to, date').eq('status', 'confirmed'),
    ]);
    const opening = Number(bal?.opening_balance || 0);
    type ChRow = Pick<CashChallan, 'amount_paid' | 'is_return' | 'status'>;
    type ExpRow = Pick<CashExpense, 'amount'>;
    type HoRow = Pick<CashHandover, 'amount' | 'status' | 'period_from' | 'period_to' | 'date'>;
    const cashSales = ((ch as ChRow[] | null) || []).filter((r) => !r.is_return).reduce((s, r) => s + Number(r.amount_paid || 0), 0);
    const cashReturns = ((ch as ChRow[] | null) || []).filter((r) => r.is_return).reduce((s, r) => s + Number(r.amount_paid || 0), 0);
    const expensesTotal = ((exp as ExpRow[] | null) || []).reduce((s, r) => s + Number(r.amount), 0);
    // Previous handovers that overlap this range
    const previousHandovers = ((ho as HoRow[] | null) || []).filter((h) => {
      const hFrom = h.period_from || h.date;
      const hTo = h.period_to || h.date;
      return hFrom <= to && hTo >= from;
    }).reduce((s, h) => s + Number(h.amount), 0);
    const available = opening + cashSales - cashReturns - expensesTotal - previousHandovers;
    return { opening, cashSales, cashReturns, expenses: expensesTotal, previousHandovers, available, periodFrom: from, periodTo: to };
  }, []);

  // Recompute when range changes in modal + load recent handovers
  useEffect(() => {
    if (showHandover) {
      computeBreakdown(handPeriodFrom, handPeriodTo).then(b => {
        setHandBreakdown(b);
        if (!handAmount) setHandAmount(String(Math.max(0, b.available)));
      });
      // Load last 5 handovers
      supabase.from('cash_handovers').select('*').order('created_at', { ascending: false }).limit(5).then(({ data }) => setRecentHandovers((data as Handover[] | null) || []));
    }
  }, [showHandover, handPeriodFrom, handPeriodTo, computeBreakdown]);

  const createHandover = async () => {
    setHandError('');
    const amt = Number(handAmount);
    if (!amt || amt <= 0) { setHandError('Amount must be greater than 0'); return; }
    if (!handToId) { setHandError('Select a recipient'); return; }
    const recipient = users.find(u => u.id === handToId);
    if (!recipient) { setHandError('Recipient not found'); return; }
    if (handToId === currentUserId) { setHandError('Cannot hand over cash to yourself'); return; }
    if (!recipient.has_pin) { setHandError(`${recipient.full_name} has no PIN set. They must set it in Settings → Users first.`); return; }
    if (!handBreakdown) { setHandError('Breakdown not loaded — try again'); return; }
    if (amt > handBreakdown.available) { setHandError(`Cannot exceed available cash: ₹${handBreakdown.available.toLocaleString('en-IN')}`); return; }
    const amountDiffers = Math.abs(amt - handBreakdown.available) > 0.01;
    if (amountDiffers && !handReason.trim()) { setHandError('Amount differs from available cash. Add a reason in Notes/Reason field.'); return; }
    // Enforce: only one handover per day per recipient
    const todayDate = new Date().toISOString().slice(0, 10);
    const { data: existing } = await supabase.from('cash_handovers').select('id, status, amount').eq('to_user_id', recipient.id).eq('date', todayDate).neq('status', 'disputed').maybeSingle();
    if (existing) { setHandError(`A handover already exists for ${recipient.full_name} today (₹${Number(existing.amount).toLocaleString('en-IN')}, ${existing.status}). Only one handover per recipient per day.`); return; }
    const { data: { user } } = await supabase.auth.getUser();
    const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', user?.id).maybeSingle();
    const handoverPayload: CashHandoverInsert = {
      date: todayDate, amount: amt,
      from_user_id: user?.id ?? null, from_user_name: prof?.full_name || user?.email || 'Unknown',
      to_user_id: recipient.id, to_user_name: recipient.full_name,
      notes: handNotes.trim() || null, status: 'pending',
      period_from: handPeriodFrom, period_to: handPeriodTo,
      // handBreakdown is a local Breakdown view; it shape-matches Record<string, unknown>
      breakdown: handBreakdown as unknown as Record<string, unknown> | null,
      reason: amountDiffers ? handReason.trim() : null,
    };
    await supabase.from('cash_handovers').insert(handoverPayload);
    // WhatsApp notification to recipient
    if (recipient.phone) {
      const msg = encodeURIComponent(`Hi ${recipient.full_name},\n${prof?.full_name || 'Accountant'} has initiated a cash handover of ₹${amt.toLocaleString('en-IN')} for you (period ${handPeriodFrom} to ${handPeriodTo}).\nPlease open DailyOffice → Cash Book → Handovers and sign with your PIN to confirm receipt.\n— Arya Designs`);
      window.open(`https://wa.me/91${recipient.phone.replace(/\D/g, '')}?text=${msg}`, '_blank');
    }
    setHandAmount(''); setHandToId(''); setHandNotes(''); setHandReason(''); setHandBreakdown(null); setShowHandover(false);
    fetchData();
  };

  // Print receipt for a handover
  const esc = (s: unknown) => String(s ?? '').replace(/[<>"'&]/g, c => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '&': '&amp;' }[c] || c));
  const printHandoverReceipt = (h: Handover) => {
    const w = window.open('', '_blank');
    if (!w) return;
    const b = h.breakdown;
    w.document.write(`<html><head><title>Cash Handover Receipt</title><style>
      body{font-family:Arial,sans-serif;padding:24px;max-width:600px;margin:auto;color:#222}
      h2{margin:0;text-align:center}
      .header{text-align:center;margin-bottom:20px;border-bottom:2px solid #333;padding-bottom:14px}
      .meta{display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:13px;margin:14px 0}
      .meta div{padding:4px 0}
      .meta strong{color:#666;font-weight:600;display:block;font-size:11px;text-transform:uppercase;letter-spacing:1px}
      table{width:100%;border-collapse:collapse;margin:16px 0}
      th,td{padding:8px 12px;text-align:left;font-size:13px;border-bottom:1px solid #eee}
      th{background:#f8f8f8;font-weight:600}
      .right{text-align:right;font-family:monospace}
      .total-row{font-weight:700;font-size:14px;border-top:2px solid #333;background:#fffbe6}
      .status{display:inline-block;padding:3px 10px;border-radius:4px;font-size:11px;font-weight:700;text-transform:uppercase}
      .signed{background:#d4edda;color:#155724}
      .pending{background:#fff3cd;color:#856404}
      .reason{background:#fff3cd;border:1px solid #ffeaa7;padding:10px 12px;border-radius:6px;margin:14px 0;font-size:12px}
      .signature{margin-top:30px;display:grid;grid-template-columns:1fr 1fr;gap:30px}
      .sig-box{border-top:1px solid #333;padding-top:6px;text-align:center;font-size:11px;color:#666}
      .receipt-no{font-family:monospace;color:#666;font-size:12px}
    </style></head><body>`);
    const receiptDate = h.created_at ? new Date(h.created_at).toLocaleDateString('en-IN') : '—';
    w.document.write(`<div class="header"><h2>Arya Designs</h2><p style="margin:6px 0;color:#666;font-size:13px">CASH HANDOVER RECEIPT</p><p class="receipt-no">Receipt #${h.id.slice(0, 8).toUpperCase()} | ${receiptDate}</p></div>`);
    w.document.write(`<div class="meta">
      <div><strong>From (Accountant)</strong>${esc(h.from_user_name)}</div>
      <div><strong>To (Cashier)</strong>${esc(h.to_user_name)}</div>
      <div><strong>Period Covered</strong>${h.period_from ? new Date(h.period_from).toLocaleDateString('en-IN') : '-'} to ${h.period_to ? new Date(h.period_to).toLocaleDateString('en-IN') : '-'}</div>
      <div><strong>Status</strong><span class="status ${h.status === 'confirmed' ? 'signed' : 'pending'}">${h.status === 'confirmed' ? '✓ Signed' : 'Pending'}</span></div>
    </div>`);
    if (b) {
      w.document.write(`<table><thead><tr><th>Cash Flow</th><th class="right">Amount (₹)</th></tr></thead><tbody>
        <tr><td>Opening Balance</td><td class="right">${b.opening.toFixed(2)}</td></tr>
        <tr><td>+ Cash Sales</td><td class="right">+${b.cashSales.toFixed(2)}</td></tr>
        <tr><td>− Cash Returns</td><td class="right">−${b.cashReturns.toFixed(2)}</td></tr>
        <tr><td>− Cash Expenses</td><td class="right">−${b.expenses.toFixed(2)}</td></tr>
        <tr><td>− Previous Handovers</td><td class="right">−${b.previousHandovers.toFixed(2)}</td></tr>
        <tr class="total-row"><td>= Available Cash</td><td class="right">${b.available.toFixed(2)}</td></tr>
        <tr class="total-row"><td>HANDED OVER</td><td class="right">${Number(h.amount).toFixed(2)}</td></tr>
      </tbody></table>`);
    } else {
      w.document.write(`<p style="text-align:center;font-size:18px;font-weight:700;padding:14px;background:#fffbe6;border-radius:6px">Amount Handed: ₹${Number(h.amount).toFixed(2)}</p>`);
    }
    if (h.reason) w.document.write(`<div class="reason"><strong>Reason for amount difference:</strong><br/>${esc(h.reason)}</div>`);
    if (h.notes) w.document.write(`<p style="font-size:12px;color:#555"><strong>Notes:</strong> ${esc(h.notes)}</p>`);
    if (h.status === 'confirmed' && h.confirmed_at) {
      w.document.write(`<p style="text-align:center;color:#155724;font-size:12px;margin-top:20px">✓ Digitally signed by ${esc(h.to_user_name)} on ${new Date(h.confirmed_at).toLocaleString('en-IN')}</p>`);
    }
    w.document.write(`<div class="signature">
      <div class="sig-box">${esc(h.from_user_name)}<br/><span style="font-size:10px">Accountant Signature</span></div>
      <div class="sig-box">${esc(h.to_user_name)}<br/><span style="font-size:10px">Cashier Signature${h.status === 'confirmed' ? ' (Digitally Signed)' : ''}</span></div>
    </div>`);
    w.document.write(`<p style="text-align:center;color:#999;font-size:9px;margin-top:30px">Generated by DailyOffice · ${new Date().toLocaleString('en-IN')}</p>`);
    w.document.write(`</body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 400);
  };

  const confirmHandover = async () => {
    setConfirmError('');
    if (!confirmingHandover || !confirmPin.trim()) { setConfirmError('Enter PIN'); return; }
    // Lockout window check
    const now = Date.now();
    if (pinLockUntil > now) {
      const secs = Math.ceil((pinLockUntil - now) / 1000);
      setConfirmError(`Too many wrong attempts. Try again in ${secs}s.`);
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setConfirmError('Not logged in'); return; }
    // Verify the confirming user IS the intended recipient
    if (confirmingHandover.to_user_id && confirmingHandover.to_user_id !== user.id) {
      setConfirmError(`This handover is meant for ${confirmingHandover.to_user_name}. Only they can sign it.`);
      return;
    }
    const { data: myPin } = await supabase.rpc('get_own_pin');
    if (!myPin) { setConfirmError('You have no PIN set. Go to Settings → Users to set one.'); return; }
    if (myPin !== confirmPin.trim()) {
      // Exponential backoff: 5s * 2^attempts, capped at 5 min
      const nextAttempts = pinAttempts + 1;
      setPinAttempts(nextAttempts);
      if (nextAttempts >= 3) {
        const waitMs = Math.min(5000 * Math.pow(2, nextAttempts - 3), 5 * 60 * 1000);
        setPinLockUntil(now + waitMs);
        setConfirmError(`Incorrect PIN. Locked for ${Math.ceil(waitMs / 1000)}s (${nextAttempts} failed attempts).`);
      } else {
        setConfirmError(`Incorrect PIN. ${3 - nextAttempts} attempt${3 - nextAttempts === 1 ? '' : 's'} before lockout.`);
      }
      setConfirmPin('');
      return;
    }
    // Success — reset counters
    setPinAttempts(0); setPinLockUntil(0);
    await supabase.from('cash_handovers').update({
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
      to_user_id: user.id,
      to_user_name: confirmingHandover.to_user_name || user.email || 'User',
    }).eq('id', confirmingHandover.id);
    setConfirmingHandover(null); setConfirmPin('');
    fetchData();
  };

  const deleteExpense = async (id: string) => {
    setConfirmDelete(null);
    setExpenses(prev => prev.filter(e => e.id !== id));
    if (pendingExpDel) clearTimeout(pendingExpDel.timer);
    const timer = window.setTimeout(async () => { await supabase.from('cash_expenses').delete().eq('id', id); setPendingExpDel(null); fetchData(); }, 5000);
    setPendingExpDel({ id, timer });
  };
  const undoExpDel = () => { if (pendingExpDel) { clearTimeout(pendingExpDel.timer); setPendingExpDel(null); fetchData(); } };
  const dismissExpDel = () => { if (pendingExpDel) { clearTimeout(pendingExpDel.timer); supabase.from('cash_expenses').delete().eq('id', pendingExpDel.id).then(() => fetchData()); setPendingExpDel(null); } };

  const exportCSV = async () => {
    // Export expenses for selected date range
    const { data } = await supabase.from('cash_expenses').select('*').gte('date', fromDate).lte('date', toDate).order('date', { ascending: false });
    const rows = (data || []).map(e => `${e.date},${e.amount},${e.category},"${(e.description || '').replace(/"/g, '""')}"`);
    const csv = 'Date,Amount,Category,Description\n' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `CashBook_${fromDate}_to_${toDate}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div style={{ fontFamily: T.sans, color: T.tx, padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 700, fontFamily: T.sora }}>Cash Book</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd2}`, borderRadius: 6, color: T.tx, fontSize: 11, padding: '5px 8px', outline: 'none' }} />
          <span style={{ fontSize: 10, color: T.tx3 }}>to</span>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd2}`, borderRadius: 6, color: T.tx, fontSize: 11, padding: '5px 8px', outline: 'none' }} />
          <button onClick={exportCSV} style={{ padding: '5px 10px', borderRadius: 6, border: `1px solid ${T.bd2}`, background: 'rgba(255,255,255,0.03)', color: T.tx3, fontSize: 10, fontWeight: 500, cursor: 'pointer', fontFamily: T.sans }}>Export CSV</button>
        </div>
      </div>

      {/* Summary Card */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 12, padding: '14px 16px', marginBottom: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, fontSize: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: T.tx2 }}>
            Opening Balance ({new Date(fromDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })})
            {!editingOpening ? <button onClick={() => setEditingOpening(true)} style={{ padding: '2px 6px', borderRadius: 4, border: `1px solid ${T.bd2}`, background: 'transparent', color: T.tx3, fontSize: 8, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 0.5 }}>Edit</button> : null}
          </div>
          {editingOpening ? (
            <div style={{ display: 'flex', gap: 4 }}>
              <input type="number" value={openingInput} onChange={e => setOpeningInput(e.target.value)} style={{ width: 100, background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd2}`, borderRadius: 4, color: T.tx, fontSize: 11, padding: '3px 6px', outline: 'none', fontFamily: T.mono, textAlign: 'right' }} />
              <button onClick={saveOpening} style={{ padding: '3px 8px', borderRadius: 4, border: 'none', background: T.ac, color: '#fff', fontSize: 9, fontWeight: 600, cursor: 'pointer' }}>Save</button>
              <button onClick={() => { setEditingOpening(false); setOpeningInput(String(openingBalance)); }} style={{ padding: '3px 8px', borderRadius: 4, border: '1px solid rgba(99,102,241,0.15)', background: 'rgba(99,102,241,0.06)', color: T.ac2, fontSize: 9, fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
            </div>
          ) : (
            <span style={{ fontFamily: T.mono, color: T.tx, fontWeight: 600 }}>₹{openingBalance.toLocaleString('en-IN')}</span>
          )}
          <span style={{ color: T.gr }}>+ Cash Sales</span>
          <span style={{ fontFamily: T.mono, color: T.gr, fontWeight: 600 }}>+₹{cashInSales.toLocaleString('en-IN')}</span>
          {cashOutReturns > 0 && <>
            <span style={{ color: T.re }}>− Cash Returns</span>
            <span style={{ fontFamily: T.mono, color: T.re, fontWeight: 600 }}>−₹{cashOutReturns.toLocaleString('en-IN')}</span>
          </>}
          <span style={{ color: T.re }}>− Expenses</span>
          <span style={{ fontFamily: T.mono, color: T.re, fontWeight: 600 }}>−₹{totalExpenses.toLocaleString('en-IN')}</span>
          {totalHandovers > 0 && <>
            <span style={{ color: T.yl }}>− Cash Handovers (signed)</span>
            <span style={{ fontFamily: T.mono, color: T.yl, fontWeight: 600 }}>−₹{totalHandovers.toLocaleString('en-IN')}</span>
          </>}
          <div style={{ display: 'flex', alignItems: 'center', color: T.tx, fontWeight: 700, fontFamily: T.sora, fontSize: 14, borderTop: `1px solid ${T.bd}`, paddingTop: 8, marginTop: 4, gridColumn: '1 / 2' }}>= Closing Balance</div>
          <div style={{ fontFamily: T.mono, color: closingBalance >= 0 ? T.gr : T.re, fontWeight: 800, fontSize: 16, borderTop: `1px solid ${T.bd}`, paddingTop: 8, marginTop: 4 }}>₹{closingBalance.toLocaleString('en-IN')}</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 3, marginBottom: 10, background: 'rgba(255,255,255,0.02)', borderRadius: 6, padding: 2, width: 'fit-content', border: `1px solid ${T.bd}` }}>
        {([{ id: 'expenses', label: `Expenses (${expenses.length})` }, { id: 'sales', label: `Cash Sales (${sales.length})` }, { id: 'handovers', label: `Handovers (${handovers.length})` }] as const).map(t => (
          <div key={t.id} onClick={() => setTab(t.id)} style={{ padding: '5px 14px', borderRadius: 4, fontSize: 10, fontWeight: tab === t.id ? 600 : 400, cursor: 'pointer', background: tab === t.id ? `linear-gradient(135deg, ${T.ac}dd, ${T.ac2}cc)` : 'transparent', color: tab === t.id ? '#fff' : T.tx3 }}>{t.label}</div>
        ))}
      </div>

      {/* Expenses Tab */}
      {tab === 'expenses' && <>
        <button onClick={() => setShowAdd(true)} style={{ padding: '7px 14px', borderRadius: 6, border: 'none', background: `linear-gradient(135deg, ${T.ac}, ${T.ac2})`, color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', marginBottom: 10 }}>+ Add Expense</button>
        <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, overflow: 'hidden' }}>
          {expenses.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: T.tx3, fontSize: 11 }}>No expenses in this range.</div>}
          {expenses.map(e => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: `1px solid ${T.bd}` }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: T.tx }}>{e.category}</span>
                  <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 3, background: 'rgba(255,255,255,0.04)', color: T.tx3, fontFamily: T.mono }}>{new Date(e.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                </div>
                {e.description && <div style={{ fontSize: 10, color: T.tx3 }}>{e.description}</div>}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, fontFamily: T.mono, color: T.re }}>−₹{Number(e.amount).toLocaleString('en-IN')}</div>
              <button onClick={() => setConfirmDelete(e.id)} style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer', opacity: 0.4 }}>
                <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'none', stroke: T.re, strokeWidth: 2 }}><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
              </button>
            </div>
          ))}
        </div>
      </>}

      {/* Sales Tab */}
      {tab === 'sales' && (
        <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, overflow: 'hidden' }}>
          {sales.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: T.tx3, fontSize: 11 }}>No cash sales in this range.</div>}
          {sales.map(s => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: `1px solid ${T.bd}` }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 10, fontFamily: T.mono, color: T.tx3 }}>#{s.challan_number}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: T.tx }}>{s.customer_name}</span>
                  {s.is_return && <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 3, background: 'rgba(239,68,68,.12)', color: T.re, fontWeight: 600, textTransform: 'uppercase' }}>Return</span>}
                </div>
                <div style={{ fontSize: 9, color: T.tx3 }}>{s.status.toUpperCase()} · Paid ₹{Number(s.amount_paid).toLocaleString('en-IN')}</div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, fontFamily: T.mono, color: s.is_return ? T.re : T.gr }}>{s.is_return ? '−' : '+'}₹{Number(s.amount_paid).toLocaleString('en-IN')}</div>
            </div>
          ))}
        </div>
      )}

      {/* Handovers Tab */}
      {tab === 'handovers' && <>
        <button onClick={() => setShowHandover(true)} style={{ padding: '7px 14px', borderRadius: 6, border: 'none', background: `linear-gradient(135deg, ${T.yl}, ${T.yl}cc)`, color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', marginBottom: 10 }}>+ Initiate Handover</button>
        <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, overflow: 'hidden' }}>
          {handovers.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: T.tx3, fontSize: 11 }}>No handovers in this range.</div>}
          {handovers.map(h => (
            <div key={h.id} style={{ padding: '11px 12px', borderBottom: `1px solid ${T.bd}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: T.tx }}>{h.from_user_name} → {h.to_user_name}</span>
                  <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 3, background: 'rgba(255,255,255,0.04)', color: T.tx3, fontFamily: T.mono }}>{new Date(h.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                  <span style={{ fontSize: 8, padding: '1px 6px', borderRadius: 3, background: h.status === 'confirmed' ? 'rgba(34,197,94,.12)' : 'rgba(245,158,11,.12)', color: h.status === 'confirmed' ? T.gr : T.yl, fontWeight: 700, textTransform: 'uppercase' }}>{h.status === 'confirmed' ? '✓ Signed' : 'Pending'}</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, fontFamily: T.mono, color: T.tx }}>₹{Number(h.amount).toLocaleString('en-IN')}</span>
              </div>
              {h.notes && <div style={{ fontSize: 10, color: T.tx3, marginBottom: 4 }}>{h.notes}</div>}
              {h.reason && <div style={{ fontSize: 10, color: T.yl, marginBottom: 4 }}>⚠ {h.reason}</div>}
              {h.status === 'confirmed' && h.confirmed_at && <div style={{ fontSize: 9, color: T.gr, fontFamily: T.mono, marginBottom: 4 }}>Signed at {new Date(h.confirmed_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>}
              <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                {h.status === 'pending' && <button onClick={() => setConfirmingHandover(h)} style={{ padding: '4px 12px', borderRadius: 5, border: 'none', background: T.gr, color: '#fff', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>Sign &amp; Confirm</button>}
                <button onClick={() => setViewingHandover(h)} style={{ padding: '4px 10px', borderRadius: 5, border: `1px solid ${T.bd2}`, background: 'rgba(255,255,255,0.03)', color: T.tx3, fontSize: 10, fontWeight: 500, cursor: 'pointer' }}>View Summary</button>
                <button onClick={() => printHandoverReceipt(h)} style={{ padding: '4px 10px', borderRadius: 5, border: `1px solid ${T.bd2}`, background: 'rgba(255,255,255,0.03)', color: T.tx3, fontSize: 10, fontWeight: 500, cursor: 'pointer' }}>Print</button>
              </div>
            </div>
          ))}
        </div>
      </>}

      {/* Initiate Handover Modal */}
      {showHandover && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(8px)', padding: 16 }}>
          <div style={{ background: 'rgba(14,18,30,.96)', border: `1px solid ${T.bd2}`, borderRadius: 14, padding: '20px 18px', maxWidth: 460, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.tx, fontFamily: T.sora, marginBottom: 4 }}>Initiate Cash Handover</div>
            <div style={{ fontSize: 10, color: T.tx3, marginBottom: 12 }}>Auto-calculated from sales, expenses, and previous handovers</div>

            {/* Period Range */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: 9, fontWeight: 600, color: T.tx3, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Period From</label>
                <input type="date" value={handPeriodFrom} onChange={e => { setHandPeriodFrom(e.target.value); setHandAmount(''); }} style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd2}`, borderRadius: 6, color: T.tx, fontSize: 11, padding: '7px 10px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 9, fontWeight: 600, color: T.tx3, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Period To</label>
                <input type="date" value={handPeriodTo} onChange={e => { setHandPeriodTo(e.target.value); setHandAmount(''); }} style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd2}`, borderRadius: 6, color: T.tx, fontSize: 11, padding: '7px 10px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>

            {/* Breakdown Card */}
            {handBreakdown && (
              <div style={{ background: 'rgba(99,102,241,.06)', border: '1px solid rgba(99,102,241,.15)', borderRadius: 8, padding: '10px 12px', marginBottom: 10, fontSize: 11 }}>
                <div style={{ fontSize: 9, color: T.ac2, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>Cash Flow Summary</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 4, fontFamily: T.mono }}>
                  <span style={{ color: T.tx2 }}>Opening Balance</span><span style={{ color: T.tx2 }}>₹{handBreakdown.opening.toFixed(2)}</span>
                  <span style={{ color: T.gr }}>+ Cash Sales</span><span style={{ color: T.gr }}>+₹{handBreakdown.cashSales.toFixed(2)}</span>
                  {handBreakdown.cashReturns > 0 && <><span style={{ color: T.re }}>− Cash Returns</span><span style={{ color: T.re }}>−₹{handBreakdown.cashReturns.toFixed(2)}</span></>}
                  <span style={{ color: T.re }}>− Cash Expenses</span><span style={{ color: T.re }}>−₹{handBreakdown.expenses.toFixed(2)}</span>
                  {handBreakdown.previousHandovers > 0 && <><span style={{ color: T.yl }}>− Previous Handovers</span><span style={{ color: T.yl }}>−₹{handBreakdown.previousHandovers.toFixed(2)}</span></>}
                  <span style={{ fontWeight: 700, color: T.tx, borderTop: `1px solid ${T.bd}`, paddingTop: 4 }}>= Available Cash</span>
                  <span style={{ fontWeight: 700, color: handBreakdown.available >= 0 ? T.gr : T.re, borderTop: `1px solid ${T.bd}`, paddingTop: 4 }}>₹{handBreakdown.available.toFixed(2)}</span>
                </div>
              </div>
            )}

            {/* Recent Handovers */}
            {recentHandovers.length > 0 && (
              <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>
                <div style={{ fontSize: 9, color: T.tx3, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>Recent Handovers (last 5)</div>
                {recentHandovers.map(h => (
                  <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: `1px solid ${T.bd}`, fontSize: 10 }}>
                    <div>
                      <span style={{ color: T.tx2 }}>{new Date(h.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} · </span>
                      <span style={{ color: T.tx, fontWeight: 600 }}>{h.from_user_name} → {h.to_user_name}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontFamily: T.mono, color: T.tx, fontWeight: 600 }}>₹{Number(h.amount).toLocaleString('en-IN')}</span>
                      <span style={{ fontSize: 7, padding: '1px 4px', borderRadius: 3, background: h.status === 'confirmed' ? 'rgba(34,197,94,.12)' : 'rgba(245,158,11,.12)', color: h.status === 'confirmed' ? T.gr : T.yl, fontWeight: 700, textTransform: 'uppercase' }}>{h.status === 'confirmed' ? '✓' : 'Pending'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Recipient + Amount */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 8, marginBottom: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: 9, fontWeight: 600, color: T.tx3, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Recipient (Cashier)</label>
                <select value={handToId} onChange={e => setHandToId(e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd2}`, borderRadius: 6, color: T.tx, fontSize: 12, padding: '8px 10px', outline: 'none', boxSizing: 'border-box', cursor: 'pointer' }}>
                  <option value="">Select recipient...</option>
                  {users.filter(u => u.id !== currentUserId).map(u => {
                    const issues = [];
                    if (!u.has_pin) issues.push('no PIN');
                    if (!u.phone) issues.push('no phone');
                    return <option key={u.id} value={u.id}>{u.full_name}{issues.length ? ` (${issues.join(', ')})` : ''}</option>;
                  })}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 9, fontWeight: 600, color: T.tx3, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Amount (₹)</label>
                <input type="number" value={handAmount} onChange={e => setHandAmount(e.target.value)} placeholder="0.00" style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: handBreakdown && Math.abs(Number(handAmount) - handBreakdown.available) > 0.01 ? '1px solid rgba(245,158,11,.4)' : `1px solid ${T.bd2}`, borderRadius: 6, color: T.tx, fontFamily: T.mono, fontSize: 14, padding: '8px 10px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>

            {/* Exclude Paise */}
            {handBreakdown && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginBottom: 10, fontSize: 11, color: T.tx2 }}>
                <input type="checkbox" checked={excludePaise} onChange={e => {
                  setExcludePaise(e.target.checked);
                  if (e.target.checked && handBreakdown) setHandAmount(String(Math.floor(handBreakdown.available)));
                  else if (handBreakdown) setHandAmount(String(handBreakdown.available));
                }} style={{ accentColor: T.ac, width: 14, height: 14, cursor: 'pointer' }} />
                Exclude paise (round down to ₹{Math.floor(handBreakdown.available)})
              </label>
            )}

            {/* Mismatch warning + reason */}
            {handBreakdown && Math.abs(Number(handAmount) - handBreakdown.available) > 0.01 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.2)', borderRadius: 6, padding: '6px 10px', fontSize: 10, color: T.yl, marginBottom: 6 }}>
                  ⚠ Amount differs from available (₹{handBreakdown.available.toFixed(2)}). Reason required:
                </div>
                <input type="text" value={handReason} onChange={e => setHandReason(e.target.value)} placeholder="e.g., Keeping ₹200 as petty cash" style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd2}`, borderRadius: 6, color: T.tx, fontSize: 11, padding: '7px 10px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            )}

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 9, fontWeight: 600, color: T.tx3, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Notes (optional)</label>
              <textarea value={handNotes} onChange={e => setHandNotes(e.target.value)} rows={2} placeholder="Additional context..." style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd2}`, borderRadius: 6, color: T.tx, fontSize: 11, padding: '7px 10px', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
            </div>
            {handError && <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '6px 10px', fontSize: 10, color: T.re, marginBottom: 8 }}>{handError}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setShowHandover(false); setHandError(''); setHandReason(''); setHandAmount(''); setHandToId(''); setHandNotes(''); setHandBreakdown(null); setExcludePaise(false); }} style={{ flex: 1, padding: '9px 0', borderRadius: 6, border: '1px solid rgba(99,102,241,0.15)', fontSize: 11, fontWeight: 500, background: 'rgba(99,102,241,0.06)', color: T.ac2, cursor: 'pointer' }}>Cancel</button>
              <button onClick={createHandover} style={{ flex: 1, padding: '9px 0', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 600, background: `linear-gradient(135deg, ${T.yl}, ${T.yl}cc)`, color: '#fff', cursor: 'pointer' }}>Initiate</button>
            </div>
          </div>
        </div>
      )}

      {/* View Handover Details Modal */}
      {viewingHandover && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(8px)', padding: 16 }}>
          <div style={{ background: 'rgba(14,18,30,.96)', border: `1px solid ${T.bd2}`, borderRadius: 14, padding: '20px 18px', maxWidth: 460, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: T.tx, fontFamily: T.sora }}>Handover Details</span>
              <button onClick={() => setViewingHandover(null)} style={{ padding: '3px 10px', borderRadius: 5, border: `1px solid ${T.bd2}`, background: 'rgba(255,255,255,0.03)', color: T.tx3, fontSize: 10, cursor: 'pointer' }}>Close</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12, fontSize: 11 }}>
              <div><div style={{ fontSize: 8, color: T.tx3, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>From</div><div style={{ color: T.tx, fontWeight: 600 }}>{viewingHandover.from_user_name}</div></div>
              <div><div style={{ fontSize: 8, color: T.tx3, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>To</div><div style={{ color: T.tx, fontWeight: 600 }}>{viewingHandover.to_user_name}</div></div>
              <div><div style={{ fontSize: 8, color: T.tx3, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>Period</div><div style={{ color: T.tx2, fontFamily: T.mono, fontSize: 10 }}>{viewingHandover.period_from ? new Date(viewingHandover.period_from).toLocaleDateString('en-IN') : '-'} → {viewingHandover.period_to ? new Date(viewingHandover.period_to).toLocaleDateString('en-IN') : '-'}</div></div>
              <div><div style={{ fontSize: 8, color: T.tx3, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>Status</div><div style={{ color: viewingHandover.status === 'confirmed' ? T.gr : T.yl, fontWeight: 700, textTransform: 'uppercase', fontSize: 10 }}>{viewingHandover.status === 'confirmed' ? '✓ Signed' : 'Pending'}</div></div>
            </div>
            {viewingHandover.breakdown ? (
              <div style={{ background: 'rgba(99,102,241,.06)', border: '1px solid rgba(99,102,241,.15)', borderRadius: 8, padding: '10px 12px', marginBottom: 10, fontSize: 11 }}>
                <div style={{ fontSize: 9, color: T.ac2, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>Cash Flow Snapshot</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 4, fontFamily: T.mono }}>
                  <span style={{ color: T.tx2 }}>Opening Balance</span><span style={{ color: T.tx2 }}>₹{viewingHandover.breakdown.opening.toFixed(2)}</span>
                  <span style={{ color: T.gr }}>+ Cash Sales</span><span style={{ color: T.gr }}>+₹{viewingHandover.breakdown.cashSales.toFixed(2)}</span>
                  {viewingHandover.breakdown.cashReturns > 0 && <><span style={{ color: T.re }}>− Cash Returns</span><span style={{ color: T.re }}>−₹{viewingHandover.breakdown.cashReturns.toFixed(2)}</span></>}
                  <span style={{ color: T.re }}>− Cash Expenses</span><span style={{ color: T.re }}>−₹{viewingHandover.breakdown.expenses.toFixed(2)}</span>
                  {viewingHandover.breakdown.previousHandovers > 0 && <><span style={{ color: T.yl }}>− Previous Handovers</span><span style={{ color: T.yl }}>−₹{viewingHandover.breakdown.previousHandovers.toFixed(2)}</span></>}
                  <span style={{ fontWeight: 700, color: T.tx, borderTop: `1px solid ${T.bd}`, paddingTop: 4 }}>= Available</span>
                  <span style={{ fontWeight: 700, color: T.tx, borderTop: `1px solid ${T.bd}`, paddingTop: 4 }}>₹{viewingHandover.breakdown.available.toFixed(2)}</span>
                  <span style={{ fontWeight: 700, color: T.gr, fontSize: 13 }}>HANDED OVER</span>
                  <span style={{ fontWeight: 700, color: T.gr, fontSize: 13 }}>₹{Number(viewingHandover.amount).toFixed(2)}</span>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 13, fontWeight: 700, color: T.gr, fontFamily: T.mono, padding: '10px 12px', background: 'rgba(34,197,94,.06)', borderRadius: 8, marginBottom: 10 }}>Amount: ₹{Number(viewingHandover.amount).toFixed(2)}</div>
            )}
            {viewingHandover.reason && <div style={{ background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.2)', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: T.yl, marginBottom: 8 }}><strong>Reason:</strong> {viewingHandover.reason}</div>}
            {viewingHandover.notes && <div style={{ fontSize: 10, color: T.tx3, marginBottom: 8 }}><strong>Notes:</strong> {viewingHandover.notes}</div>}
            {viewingHandover.confirmed_at && <div style={{ fontSize: 10, color: T.gr, marginBottom: 10 }}>✓ Signed at {new Date(viewingHandover.confirmed_at).toLocaleString('en-IN')}</div>}
            <button onClick={() => printHandoverReceipt(viewingHandover)} style={{ width: '100%', padding: '10px', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 600, background: `linear-gradient(135deg, ${T.ac}, ${T.ac2})`, color: '#fff', cursor: 'pointer' }}>Print Receipt</button>
          </div>
        </div>
      )}

      {/* Confirm Handover (Sign with PIN) Modal */}
      {confirmingHandover && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(8px)', padding: 16 }}>
          <div style={{ background: 'rgba(14,18,30,.96)', border: `1px solid ${T.bd2}`, borderRadius: 14, padding: '20px 18px', maxWidth: 360, width: '100%' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.tx, fontFamily: T.sora, marginBottom: 4 }}>Sign &amp; Confirm Receipt</div>
            <div style={{ fontSize: 11, color: T.tx3, marginBottom: 12 }}>You are confirming receipt of <strong style={{ color: T.gr, fontFamily: T.mono }}>₹{Number(confirmingHandover.amount).toLocaleString('en-IN')}</strong> from <strong style={{ color: T.tx }}>{confirmingHandover.from_user_name}</strong>. This is a permanent legal record.</div>
            <input type="password" value={confirmPin} onChange={e => setConfirmPin(e.target.value)} placeholder="Your 4-6 digit PIN" autoFocus inputMode="numeric" style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd2}`, borderRadius: 6, color: T.tx, fontFamily: T.mono, fontSize: 18, padding: '10px 12px', outline: 'none', boxSizing: 'border-box', textAlign: 'center', letterSpacing: 6, marginBottom: 10 }} />
            {confirmError && <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '6px 10px', fontSize: 10, color: T.re, marginBottom: 8 }}>{confirmError}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setConfirmingHandover(null); setConfirmPin(''); setConfirmError(''); }} style={{ flex: 1, padding: '9px 0', borderRadius: 6, border: '1px solid rgba(99,102,241,0.15)', fontSize: 11, fontWeight: 500, background: 'rgba(99,102,241,0.06)', color: T.ac2, cursor: 'pointer' }}>Cancel</button>
              <button onClick={confirmHandover} style={{ flex: 1, padding: '9px 0', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 600, background: `linear-gradient(135deg, ${T.gr}, ${T.gr}cc)`, color: '#fff', cursor: 'pointer' }}>Sign &amp; Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Expense Modal */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(8px)', padding: 16 }}>
          <div style={{ background: 'rgba(14,18,30,.96)', border: `1px solid ${T.bd2}`, borderRadius: 14, padding: '20px 18px', maxWidth: 380, width: '100%' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.tx, fontFamily: T.sora, marginBottom: 14 }}>Add Expense</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: 9, fontWeight: 600, color: T.tx3, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Date</label>
                <input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd2}`, borderRadius: 6, color: T.tx, fontSize: 12, padding: '8px 10px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 9, fontWeight: 600, color: T.tx3, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Amount (₹)</label>
                <input type="number" value={amount} onChange={e => setAmount(e.target.value)} autoFocus placeholder="0.00" style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd2}`, borderRadius: 6, color: T.tx, fontFamily: T.mono, fontSize: 14, padding: '8px 10px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', fontSize: 9, fontWeight: 600, color: T.tx3, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Category</label>
              <select value={category} onChange={e => setCategory(e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd2}`, borderRadius: 6, color: T.tx, fontFamily: T.sans, fontSize: 12, padding: '8px 10px', outline: 'none' }}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 9, fontWeight: 600, color: T.tx3, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Description (optional)</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="What was this expense for?" style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd2}`, borderRadius: 6, color: T.tx, fontFamily: T.sans, fontSize: 11, padding: '7px 10px', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
            </div>
            {formError && <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '6px 10px', fontSize: 10, color: T.re, marginBottom: 8 }}>{formError}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setShowAdd(false); setFormError(''); }} style={{ flex: 1, padding: '9px 0', borderRadius: 6, border: '1px solid rgba(99,102,241,0.15)', fontSize: 11, fontWeight: 500, background: 'rgba(99,102,241,0.06)', color: T.ac2, cursor: 'pointer' }}>Cancel</button>
              <button onClick={addExpense} style={{ flex: 1, padding: '9px 0', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 600, background: `linear-gradient(135deg, ${T.ac}, ${T.ac2})`, color: '#fff', cursor: 'pointer' }}>Add</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(8px)', padding: 16 }}>
          <div style={{ background: 'rgba(14,18,30,.96)', border: `1px solid ${T.bd2}`, borderRadius: 14, padding: '20px 18px', textAlign: 'center', maxWidth: 340, width: '100%' }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>⚠️</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.tx, fontFamily: T.sora, marginBottom: 4 }}>Delete Expense?</div>
            <div style={{ fontSize: 11, color: T.tx3, marginBottom: 14 }}>This will permanently remove the expense.</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setConfirmDelete(null)} style={{ flex: 1, padding: '8px 0', borderRadius: 6, border: '1px solid rgba(99,102,241,0.15)', fontSize: 11, fontWeight: 500, background: 'rgba(99,102,241,0.06)', color: T.ac2, cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => deleteExpense(confirmDelete)} style={{ flex: 1, padding: '8px 0', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 600, background: `linear-gradient(135deg, ${T.re}, ${T.re}cc)`, color: '#fff', cursor: 'pointer' }}>Delete</button>
            </div>
          </div>
        </div>
      )}
      {pendingExpDel && <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: '#0B0F19', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 0, boxShadow: '0 8px 30px rgba(0,0,0,.5)', zIndex: 300, overflow: 'hidden', minWidth: 260 }}>
        <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}><span style={{ fontSize: 12, color: '#E2E8F0', flex: 1 }}>Expense deleted</span><span onClick={undoExpDel} style={{ padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, background: '#F59E0B', color: '#000' }}>Undo</span><span onClick={dismissExpDel} style={{ cursor: 'pointer', color: '#4A5568', fontSize: 14 }}>✕</span></div>
        <div className="undo-bar" key={pendingExpDel.id} />
      </div>}
    </div>
  );
}
