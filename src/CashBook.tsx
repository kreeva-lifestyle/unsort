/* eslint-disable */
import { useState, useEffect, useCallback } from 'react';
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

const CATEGORIES = ['Office Supplies', 'Rent', 'Salaries', 'Travel', 'Utilities', 'Food', 'Transport', 'Misc'];

interface Expense { id: string; date: string; amount: number; category: string; description: string; created_at: string; }
interface Handover { id: string; date: string; amount: number; from_user_id: string | null; from_user_name: string; to_user_id: string | null; to_user_name: string; notes: string; status: string; confirmed_at: string | null; created_at: string; }

export default function CashBook() {
  const today = new Date().toISOString().slice(0, 10);
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  // Single 'date' for new expense/handover input — defaults to today
  const [entryDate, setEntryDate] = useState(today);
  const [tab, setTab] = useState<'expenses' | 'sales' | 'handovers'>('expenses');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [sales, setSales] = useState<any[]>([]);
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
  // Handover form
  const [showHandover, setShowHandover] = useState(false);
  const [handAmount, setHandAmount] = useState('');
  const [handToId, setHandToId] = useState('');
  const [handNotes, setHandNotes] = useState('');
  const [handError, setHandError] = useState('');
  // Users list (for recipient dropdown)
  const [users, setUsers] = useState<{ id: string; full_name: string; email: string; cash_pin: string | null }[]>([]);
  const [currentUserId, setCurrentUserId] = useState('');
  // Confirm handover with PIN
  const [confirmingHandover, setConfirmingHandover] = useState<Handover | null>(null);
  const [confirmPin, setConfirmPin] = useState('');
  const [confirmError, setConfirmError] = useState('');

  const fetchData = useCallback(async () => {
    // Opening balance — uses From date
    const { data: bal } = await supabase.from('cash_book_balances').select('opening_balance').eq('date', fromDate).maybeSingle();
    setOpeningBalance(Number(bal?.opening_balance || 0));
    setOpeningInput(String(bal?.opening_balance || 0));

    // Expenses in date range
    const { data: exp } = await supabase.from('cash_expenses').select('*').gte('date', fromDate).lte('date', toDate).order('date', { ascending: false }).order('created_at', { ascending: false });
    setExpenses(exp || []);

    // Cash sales (challans paid in cash, created in date range)
    const { data: ch } = await supabase.from('cash_challans').select('id, challan_number, customer_name, total, amount_paid, status, is_return, payment_mode, payment_date, created_at')
      .eq('payment_mode', 'Cash').in('status', ['paid', 'partial']).gte('created_at', fromDate + 'T00:00:00').lte('created_at', toDate + 'T23:59:59').order('created_at', { ascending: false });
    setSales(ch || []);

    // Handovers in date range
    const { data: ho } = await supabase.from('cash_handovers').select('*').gte('date', fromDate).lte('date', toDate).order('date', { ascending: false }).order('created_at', { ascending: false });
    setHandovers(ho || []);
  }, [fromDate, toDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Load active users for handover recipient dropdown
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentUserId(user.id);
      const { data } = await supabase.from('profiles').select('id, full_name, email, cash_pin').eq('is_active', true).order('full_name');
      setUsers(data || []);
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
    await supabase.from('cash_book_balances').upsert({ date: fromDate, opening_balance: val }, { onConflict: 'date' });
    setEditingOpening(false);
    fetchData();
  };

  const addExpense = async () => {
    setFormError('');
    const amt = Number(amount);
    if (!amt || amt <= 0) { setFormError('Amount must be greater than 0'); return; }
    if (!category) { setFormError('Category is required'); return; }
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('cash_expenses').insert({ date: entryDate, amount: amt, category, description: description.trim() || null, paid_by: user?.id });
    setAmount(''); setDescription(''); setCategory(CATEGORIES[0]); setShowAdd(false);
    fetchData();
  };

  const createHandover = async () => {
    setHandError('');
    const amt = Number(handAmount);
    if (!amt || amt <= 0) { setHandError('Amount must be greater than 0'); return; }
    if (!handToId) { setHandError('Select a recipient'); return; }
    const recipient = users.find(u => u.id === handToId);
    if (!recipient) { setHandError('Recipient not found'); return; }
    if (handToId === currentUserId) { setHandError('Cannot hand over cash to yourself'); return; }
    if (!recipient.cash_pin) { setHandError(`${recipient.full_name} has no PIN set. They must set it in Settings → Users first.`); return; }
    const { data: { user } } = await supabase.auth.getUser();
    const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', user?.id).maybeSingle();
    await supabase.from('cash_handovers').insert({
      date: entryDate, amount: amt,
      from_user_id: user?.id, from_user_name: prof?.full_name || user?.email || 'Unknown',
      to_user_id: recipient.id, to_user_name: recipient.full_name,
      notes: handNotes.trim() || null, status: 'pending'
    });
    setHandAmount(''); setHandToId(''); setHandNotes(''); setShowHandover(false);
    fetchData();
  };

  const confirmHandover = async () => {
    setConfirmError('');
    if (!confirmingHandover || !confirmPin.trim()) { setConfirmError('Enter PIN'); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setConfirmError('Not logged in'); return; }
    // Verify the confirming user IS the intended recipient
    if (confirmingHandover.to_user_id && confirmingHandover.to_user_id !== user.id) {
      setConfirmError(`This handover is meant for ${confirmingHandover.to_user_name}. Only they can sign it.`);
      return;
    }
    const { data: prof } = await supabase.from('profiles').select('cash_pin, full_name').eq('id', user.id).maybeSingle();
    if (!prof?.cash_pin) { setConfirmError('You have no PIN set. Go to Settings → Users to set one.'); return; }
    if (prof.cash_pin !== confirmPin.trim()) { setConfirmError('Incorrect PIN'); return; }
    await supabase.from('cash_handovers').update({
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
      to_user_id: user.id,
      to_user_name: prof.full_name || user.email || confirmingHandover.to_user_name,
    }).eq('id', confirmingHandover.id);
    setConfirmingHandover(null); setConfirmPin('');
    fetchData();
  };

  const deleteExpense = async (id: string) => {
    await supabase.from('cash_expenses').delete().eq('id', id);
    setConfirmDelete(null);
    fetchData();
  };

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
              {h.status === 'confirmed' && h.confirmed_at && <div style={{ fontSize: 9, color: T.gr, fontFamily: T.mono }}>Signed at {new Date(h.confirmed_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>}
              {h.status === 'pending' && <button onClick={() => setConfirmingHandover(h)} style={{ padding: '4px 12px', borderRadius: 5, border: 'none', background: T.gr, color: '#fff', fontSize: 10, fontWeight: 600, cursor: 'pointer', marginTop: 4 }}>Sign &amp; Confirm Receipt</button>}
            </div>
          ))}
        </div>
      </>}

      {/* Initiate Handover Modal */}
      {showHandover && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(8px)', padding: 16 }}>
          <div style={{ background: 'rgba(14,18,30,.96)', border: `1px solid ${T.bd2}`, borderRadius: 14, padding: '20px 18px', maxWidth: 380, width: '100%' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.tx, fontFamily: T.sora, marginBottom: 4 }}>Initiate Cash Handover</div>
            <div style={{ fontSize: 10, color: T.tx3, marginBottom: 12 }}>Recipient must sign with their PIN to confirm receipt</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: 9, fontWeight: 600, color: T.tx3, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Date</label>
                <input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd2}`, borderRadius: 6, color: T.tx, fontSize: 12, padding: '8px 10px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 9, fontWeight: 600, color: T.tx3, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Amount (₹)</label>
                <input type="number" value={handAmount} onChange={e => setHandAmount(e.target.value)} autoFocus placeholder="0.00" style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd2}`, borderRadius: 6, color: T.tx, fontFamily: T.mono, fontSize: 14, padding: '8px 10px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', fontSize: 9, fontWeight: 600, color: T.tx3, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Recipient (Cashier)</label>
              <select value={handToId} onChange={e => setHandToId(e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd2}`, borderRadius: 6, color: T.tx, fontSize: 12, padding: '8px 10px', outline: 'none', boxSizing: 'border-box', cursor: 'pointer' }}>
                <option value="">Select recipient...</option>
                {users.filter(u => u.id !== currentUserId).map(u => (
                  <option key={u.id} value={u.id}>{u.full_name}{!u.cash_pin ? ' (no PIN set)' : ''}</option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 9, fontWeight: 600, color: T.tx3, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Notes (optional)</label>
              <textarea value={handNotes} onChange={e => setHandNotes(e.target.value)} rows={2} placeholder="Reason / reference..." style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd2}`, borderRadius: 6, color: T.tx, fontSize: 11, padding: '7px 10px', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
            </div>
            {handError && <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '6px 10px', fontSize: 10, color: T.re, marginBottom: 8 }}>{handError}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setShowHandover(false); setHandError(''); }} style={{ flex: 1, padding: '9px 0', borderRadius: 6, border: `1px solid ${T.bd2}`, fontSize: 11, fontWeight: 500, background: 'rgba(255,255,255,0.03)', color: T.tx3, cursor: 'pointer' }}>Cancel</button>
              <button onClick={createHandover} style={{ flex: 1, padding: '9px 0', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 600, background: `linear-gradient(135deg, ${T.yl}, ${T.yl}cc)`, color: '#fff', cursor: 'pointer' }}>Initiate</button>
            </div>
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
              <button onClick={() => { setConfirmingHandover(null); setConfirmPin(''); setConfirmError(''); }} style={{ flex: 1, padding: '9px 0', borderRadius: 6, border: `1px solid ${T.bd2}`, fontSize: 11, fontWeight: 500, background: 'rgba(255,255,255,0.03)', color: T.tx3, cursor: 'pointer' }}>Cancel</button>
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
              <button onClick={() => { setShowAdd(false); setFormError(''); }} style={{ flex: 1, padding: '9px 0', borderRadius: 6, border: `1px solid ${T.bd2}`, fontSize: 11, fontWeight: 500, background: 'rgba(255,255,255,0.03)', color: T.tx3, cursor: 'pointer' }}>Cancel</button>
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
              <button onClick={() => setConfirmDelete(null)} style={{ flex: 1, padding: '8px 0', borderRadius: 6, border: `1px solid ${T.bd2}`, fontSize: 11, fontWeight: 500, background: 'rgba(255,255,255,0.03)', color: T.tx3, cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => deleteExpense(confirmDelete)} style={{ flex: 1, padding: '8px 0', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 600, background: `linear-gradient(135deg, ${T.re}, ${T.re}cc)`, color: '#fff', cursor: 'pointer' }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
