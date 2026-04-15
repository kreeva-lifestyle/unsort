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

export default function CashBook() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [tab, setTab] = useState<'expenses' | 'sales'>('expenses');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [editingOpening, setEditingOpening] = useState(false);
  const [openingInput, setOpeningInput] = useState('0');
  const [showAdd, setShowAdd] = useState(false);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    // Opening balance
    const { data: bal } = await supabase.from('cash_book_balances').select('opening_balance').eq('date', date).maybeSingle();
    setOpeningBalance(Number(bal?.opening_balance || 0));
    setOpeningInput(String(bal?.opening_balance || 0));

    // Expenses
    const { data: exp } = await supabase.from('cash_expenses').select('*').eq('date', date).order('created_at', { ascending: false });
    setExpenses(exp || []);

    // Cash sales (challans paid in cash, created on this date)
    const { data: ch } = await supabase.from('cash_challans').select('id, challan_number, customer_name, total, amount_paid, status, is_return, payment_mode, payment_date, created_at')
      .eq('payment_mode', 'Cash').in('status', ['paid', 'partial']).gte('created_at', date + 'T00:00:00').lte('created_at', date + 'T23:59:59').order('created_at', { ascending: false });
    setSales(ch || []);
  }, [date]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Realtime sync — multi-user safety ──────────────────────────────────────
  useEffect(() => {
    const channel = supabase.channel('cash_book_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_expenses' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_book_balances' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_challans' }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  const cashInSales = sales.filter(s => !s.is_return).reduce((s, r) => s + Number(r.amount_paid || 0), 0);
  const cashOutReturns = sales.filter(s => s.is_return).reduce((s, r) => s + Number(r.amount_paid || 0), 0);
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const closingBalance = openingBalance + cashInSales - cashOutReturns - totalExpenses;

  const saveOpening = async () => {
    const val = Number(openingInput) || 0;
    await supabase.from('cash_book_balances').upsert({ date, opening_balance: val }, { onConflict: 'date' });
    setEditingOpening(false);
    fetchData();
  };

  const addExpense = async () => {
    setFormError('');
    const amt = Number(amount);
    if (!amt || amt <= 0) { setFormError('Amount must be greater than 0'); return; }
    if (!category) { setFormError('Category is required'); return; }
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('cash_expenses').insert({ date, amount: amt, category, description: description.trim() || null, paid_by: user?.id });
    setAmount(''); setDescription(''); setCategory(CATEGORIES[0]); setShowAdd(false);
    fetchData();
  };

  const deleteExpense = async (id: string) => {
    await supabase.from('cash_expenses').delete().eq('id', id);
    setConfirmDelete(null);
    fetchData();
  };

  const exportCSV = async () => {
    // Export expenses for current month
    const monthStart = date.slice(0, 7) + '-01';
    const monthEndDate = new Date(new Date(monthStart).getFullYear(), new Date(monthStart).getMonth() + 1, 0);
    const monthEnd = monthEndDate.toISOString().slice(0, 10);
    const { data } = await supabase.from('cash_expenses').select('*').gte('date', monthStart).lte('date', monthEnd).order('date', { ascending: false });
    const rows = (data || []).map(e => `${e.date},${e.amount},${e.category},"${(e.description || '').replace(/"/g, '""')}"`);
    const csv = 'Date,Amount,Category,Description\n' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `CashBook_${date.slice(0, 7)}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div style={{ fontFamily: T.sans, color: T.tx, padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 700, fontFamily: T.sora }}>Cash Book</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd2}`, borderRadius: 6, color: T.tx, fontSize: 11, padding: '5px 8px', outline: 'none' }} />
          <button onClick={exportCSV} style={{ padding: '5px 10px', borderRadius: 6, border: `1px solid ${T.bd2}`, background: 'rgba(255,255,255,0.03)', color: T.tx3, fontSize: 10, fontWeight: 500, cursor: 'pointer', fontFamily: T.sans }}>Export Month</button>
        </div>
      </div>

      {/* Summary Card */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 12, padding: '14px 16px', marginBottom: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, fontSize: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: T.tx2 }}>
            Opening Balance
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
          <div style={{ display: 'flex', alignItems: 'center', color: T.tx, fontWeight: 700, fontFamily: T.sora, fontSize: 14, borderTop: `1px solid ${T.bd}`, paddingTop: 8, marginTop: 4, gridColumn: '1 / 2' }}>= Closing Balance</div>
          <div style={{ fontFamily: T.mono, color: closingBalance >= 0 ? T.gr : T.re, fontWeight: 800, fontSize: 16, borderTop: `1px solid ${T.bd}`, paddingTop: 8, marginTop: 4 }}>₹{closingBalance.toLocaleString('en-IN')}</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 3, marginBottom: 10, background: 'rgba(255,255,255,0.02)', borderRadius: 6, padding: 2, width: 'fit-content', border: `1px solid ${T.bd}` }}>
        {([{ id: 'expenses', label: `Expenses (${expenses.length})` }, { id: 'sales', label: `Cash Sales (${sales.length})` }] as const).map(t => (
          <div key={t.id} onClick={() => setTab(t.id)} style={{ padding: '5px 14px', borderRadius: 4, fontSize: 10, fontWeight: tab === t.id ? 600 : 400, cursor: 'pointer', background: tab === t.id ? `linear-gradient(135deg, ${T.ac}dd, ${T.ac2}cc)` : 'transparent', color: tab === t.id ? '#fff' : T.tx3 }}>{t.label}</div>
        ))}
      </div>

      {/* Expenses Tab */}
      {tab === 'expenses' && <>
        <button onClick={() => setShowAdd(true)} style={{ padding: '7px 14px', borderRadius: 6, border: 'none', background: `linear-gradient(135deg, ${T.ac}, ${T.ac2})`, color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', marginBottom: 10 }}>+ Add Expense</button>
        <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, overflow: 'hidden' }}>
          {expenses.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: T.tx3, fontSize: 11 }}>No expenses on this date.</div>}
          {expenses.map(e => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: `1px solid ${T.bd}` }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.tx, marginBottom: 2 }}>{e.category}</div>
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
          {sales.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: T.tx3, fontSize: 11 }}>No cash sales on this date.</div>}
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

      {/* Add Expense Modal */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(8px)', padding: 16 }}>
          <div style={{ background: 'rgba(14,18,30,.96)', border: `1px solid ${T.bd2}`, borderRadius: 14, padding: '20px 18px', maxWidth: 380, width: '100%' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.tx, fontFamily: T.sora, marginBottom: 14 }}>Add Expense</div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', fontSize: 9, fontWeight: 600, color: T.tx3, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Amount (₹)</label>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} autoFocus placeholder="0.00" style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd2}`, borderRadius: 6, color: T.tx, fontFamily: T.mono, fontSize: 14, padding: '8px 10px', outline: 'none', boxSizing: 'border-box' }} />
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
