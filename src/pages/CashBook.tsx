import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { printOrQueue } from '../lib/printQueue';

const waPhone = (raw: string) => { const d = raw.replace(/\D/g, ''); return '91' + (d.startsWith('91') && d.length > 10 ? d.slice(2) : d); };
// Local (IST) calendar date — NOT toISOString() which is UTC and shifts the day
// boundary 5.5h, so a late-evening expense lands on the wrong day and falls
// outside the default today filter (same fix already applied in CashChallan).
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
import { friendlyError } from '../lib/friendlyError';
import { numericKeyDown } from '../lib/numericInput';
import { useDebouncedFetch } from '../hooks/useDebouncedFetch';
import { useNotifications } from '../hooks/useNotifications';
import Empty from '../components/ui/Empty';
import { SkeletonRows } from '../components/ui/Skeleton';

import { T, S } from '../lib/theme';
import DateInput from '../components/ui/DateInput';
import type {
  CashExpense,
  CashExpenseInsert,
  CashHandover,
  CashHandoverInsert,
  CashBookBalanceInsert,
  CashChallan,
  Profile,
} from '../types/database';

const CATEGORIES = ['Office Supplies', 'Rent', 'Salaries', 'Travel', 'Utilities', 'Food', 'Transport', 'Misc', 'Others'];

// In-memory / jsonb-embedded cash-flow snapshot. Stored in
// cash_handovers.breakdown as jsonb, read back and cast to this shape.
interface Breakdown { opening: number; openingIsSet: boolean; cashSales: number; cashReturns: number; expenses: number; previousHandovers: number; available: number; periodFrom: string; periodTo: string; }

// View model: central CashHandover row but with the jsonb breakdown
// narrowed to the local Breakdown shape for typed access.
type Handover = Omit<CashHandover, 'breakdown'> & { breakdown: Breakdown | null };

// Human-readable handover identifier used in receipts, UI badges, and WhatsApp.
const formatHandoverNo = (n: number | null | undefined) =>
  n == null ? '—' : `HO-${String(n).padStart(4, '0')}`;

// View model: narrowed cash_expenses projection used by the expenses tab.
// paid_by is resolved to a name client-side from the loaded users list — the
// PostgREST embed profiles:paid_by(...) was BROKEN because paid_by's FK points
// at auth.users, not profiles, so the whole query errored and silently returned
// nothing (expenses vanished while sales/handovers showed fine).
type ExpenseRow = Pick<CashExpense, 'id' | 'date' | 'amount' | 'category' | 'description' | 'created_at'> & { paid_by?: string | null };

// View model: narrowed cash_challans projection used by the sales tab.
type CashSaleRow = Pick<CashChallan, 'id' | 'challan_number' | 'customer_name' | 'total' | 'amount_paid' | 'status' | 'is_return' | 'payment_mode' | 'payment_date' | 'created_at'>;

export default function CashBook() {
  const { addToast } = useNotifications();
  const today = localToday();
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  // Single 'date' for new expense/handover input — defaults to today
  const [entryDate, setEntryDate] = useState(today);
  const [tab, setTab] = useState<'expenses' | 'sales' | 'handovers'>('expenses');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
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
  const [expSaving, setExpSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  // Admin-only correction of a LOCKED expense (inside a signed handover
  // period): the original stays untouched — a counter-entry dated today fixes
  // the running cash math without altering the signed record.
  const [correctingExpense, setCorrectingExpense] = useState<ExpenseRow | null>(null);
  const [correctAmount, setCorrectAmount] = useState('');
  const [correctError, setCorrectError] = useState('');
  const [correctSaving, setCorrectSaving] = useState(false);
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
  const [handSaving, setHandSaving] = useState(false);
  const [viewingHandover, setViewingHandover] = useState<Handover | null>(null);
  const [handoverItems, setHandoverItems] = useState<{ challan_number: number; customer_name: string; amount_paid: number; payment_date: string | null; is_return: boolean }[]>([]);
  // Users list (for recipient dropdown)
  const [users, setUsers] = useState<{ id: string; full_name: string; email: string; has_pin: boolean; phone: string | null; role: string }[]>([]);
  const [recentHandovers, setRecentHandovers] = useState<Handover[]>([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const [currentUserRole, setCurrentUserRole] = useState<string>('');
  // Reject flow
  const [rejectingHandover, setRejectingHandover] = useState<Handover | null>(null);
  const [cancellingHandover, setCancellingHandover] = useState<Handover | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState('');
  const [excludePaise, setExcludePaise] = useState(false);
  // Confirm handover with PIN
  const [confirmingHandover, setConfirmingHandover] = useState<Handover | null>(null);
  const [confirmPin, setConfirmPin] = useState('');
  const [confirmError, setConfirmError] = useState('');
  // PIN lockout is enforced SERVER-SIDE inside verify_own_pin (failed-attempt
  // tracking in the DB — can't be bypassed by closing the tab). pinLockUntil
  // here is only a local mirror so we can show the wait time without a round
  // trip; it is set from the RPC's retry_after, never computed client-side.
  const [pinLockUntil, setPinLockUntil] = useState<number>(() => {
    try { return Number(sessionStorage.getItem('pinLockUntil')) || 0; } catch { return 0; }
  });
  const [busy, setBusy] = useState(false); // disables critical handover/save buttons during async ops
  useEffect(() => {
    try {
      if (pinLockUntil > 0) sessionStorage.setItem('pinLockUntil', String(pinLockUntil));
      else sessionStorage.removeItem('pinLockUntil');
    } catch {}
  }, [pinLockUntil]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    // Opening balance — uses From date
    const { data: bal, error: balErr } = await supabase.from('cash_book_balances').select('opening_balance').eq('date', fromDate).maybeSingle();
    if (balErr) addToast('Failed to load opening balance — ' + friendlyError(balErr), 'error');
    setOpeningBalance(Number(bal?.opening_balance || 0));
    setOpeningInput(String(bal?.opening_balance || 0));

    // Expenses in date range
    const { data: exp, error: expErr } = await supabase.from('cash_expenses').select('id, date, amount, category, description, created_at, paid_by').gte('date', fromDate).lte('date', toDate).order('date', { ascending: false }).order('created_at', { ascending: false });
    if (expErr) addToast('Failed to load expenses — ' + friendlyError(expErr), 'error');
    setExpenses((exp || []) as unknown as ExpenseRow[]);

    // Cash sales — filter by payment_date (when cash actually moved), not created_at
    const { data: ch, error: chErr } = await supabase.from('cash_challans').select('id, challan_number, customer_name, total, amount_paid, status, is_return, payment_mode, payment_date, created_at')
      .in('status', ['paid', 'partial']).gte('payment_date', fromDate).lte('payment_date', toDate).order('payment_date', { ascending: false });
    if (chErr) addToast('Failed to load cash sales — ' + friendlyError(chErr), 'error');
    setSales(ch || []);

    // Handovers in date range
    const { data: ho, error: hoErr } = await supabase.from('cash_handovers').select('id, handover_number, date, amount, from_user_name, to_user_name, status, confirmed_at, created_at, period_from, period_to, breakdown, reason, from_user_id, to_user_id, notes, reject_reason, rejected_at, rejected_by, cancelled_at, cancelled_by').gte('date', fromDate).lte('date', toDate).order('date', { ascending: false }).order('created_at', { ascending: false });
    if (hoErr) addToast('Failed to load handovers — ' + friendlyError(hoErr), 'error');
    setHandovers((ho as Handover[] | null) || []);
    setLoading(false);
  }, [fromDate, toDate, addToast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const open = showHandover || !!viewingHandover || !!confirmingHandover || !!rejectingHandover || !!cancellingHandover || showAdd || !!confirmDelete || !!correctingExpense;
    document.body.classList.toggle('modal-open', open);
    return () => { document.body.classList.remove('modal-open'); };
  }, [showHandover, viewingHandover, confirmingHandover, rejectingHandover, cancellingHandover, showAdd, confirmDelete, correctingExpense]);

  // Load active users for handover recipient dropdown
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
        const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
        setCurrentUserRole(((me as { role?: string } | null)?.role) || '');
      }
      // has_pin comes from a SECURITY DEFINER RPC — cash_pin itself is not
      // selectable, and hardcoding true made the "no PIN" pre-flight dead code.
      const [{ data, error: usersErr }, { data: pinRows, error: pinErr }] = await Promise.all([
        supabase.from('profiles').select('id, full_name, email, phone, role').eq('is_active', true).order('full_name'),
        supabase.rpc('get_profiles_pin_status'),
      ]);
      if (usersErr) addToast('Failed to load users — ' + friendlyError(usersErr), 'error');
      if (pinErr) addToast('Failed to load PIN status — ' + friendlyError(pinErr), 'error');
      const pinMap = new Map(((pinRows as { id: string; has_pin: boolean }[] | null) || []).map(r => [r.id, r.has_pin]));
      type UserRow = Pick<Profile, 'id' | 'full_name' | 'email' | 'phone' | 'role'>;
      // On RPC failure fall back to permissive (the pre-flight is advisory —
      // the PIN check at confirm time is the real gate).
      setUsers((data as UserRow[] | null || []).map((u) => ({ id: u.id, full_name: u.full_name ?? '', email: u.email, has_pin: pinMap.get(u.id) ?? !!pinErr, phone: u.phone, role: u.role ?? '' })));
    })();
  }, []);

  // ── Realtime sync — multi-user safety ──────────────────────────────────────
  // INSERT/DELETE fire immediately (structural changes); UPDATE debounced 500ms
  // to coalesce rapid bursts from bulk pay/unpay operations. Stale data from
  // the debounce window is protected against by DB-level optimistic concurrency
  // on writes and fresh refetch when modals open.
  const { debounced: debouncedFetch } = useDebouncedFetch(fetchData, 500);
  useEffect(() => {
    const imm = () => fetchData();
    const channel = supabase.channel('cash_book_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cash_expenses' }, imm)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'cash_expenses' }, imm)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'cash_expenses' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_book_balances' }, debouncedFetch)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cash_challans' }, imm)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'cash_challans' }, imm)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'cash_challans' }, debouncedFetch)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cash_handovers' }, imm)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'cash_handovers' }, imm)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'cash_handovers' }, debouncedFetch)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData, debouncedFetch]);

  // Load the exact challans stamped to the handover being viewed (per-challan
  // handover tracking) — the real itemised contents, not an inferred list.
  useEffect(() => {
    if (!viewingHandover?.id) { setHandoverItems([]); return; }
    let stale = false;
    supabase.from('cash_challans').select('challan_number, customer_name, amount_paid, payment_date, is_return')
      .eq('handover_id', viewingHandover.id).order('payment_date', { ascending: true }).then(({ data, error }) => {
        if (stale) return;
        if (error) { addToast('Could not load handover items — ' + friendlyError(error), 'error'); return; }
        setHandoverItems((data as typeof handoverItems) || []);
      });
    return () => { stale = true; };
  }, [viewingHandover?.id, addToast]);

  const { cashInSales, cashOutReturns, totalExpenses, totalHandovers, closingBalance } = useMemo(() => {
    const cIn = sales.filter(s => !s.is_return).reduce((s, r) => s + Number(r.amount_paid || 0), 0);
    const cOut = sales.filter(s => s.is_return).reduce((s, r) => s + Number(r.amount_paid || 0), 0);
    const tExp = expenses.reduce((s, e) => s + Number(e.amount), 0);
    const tHand = handovers.filter(h => h.status === 'confirmed').reduce((s, h) => s + Number(h.amount), 0);
    // Handovers are internal transfers (staff → admin) — the cash stays with
    // the business, so it is NOT deducted from cash on hand. It's shown as an
    // informational line below the closing balance instead.
    return { cashInSales: cIn, cashOutReturns: cOut, totalExpenses: tExp, totalHandovers: tHand, closingBalance: openingBalance + cIn - cOut - tExp };
  }, [sales, expenses, handovers, openingBalance]);

  const saveOpening = async () => {
    if (busy) return;
    const val = Number(openingInput) || 0;
    if (val === openingBalance) { setEditingOpening(false); return; }
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const payload: CashBookBalanceInsert = { date: fromDate, opening_balance: val };
      const { error } = await supabase.from('cash_book_balances').upsert(payload, { onConflict: 'date' });
      if (error) { addToast('Save failed — ' + friendlyError(error), 'error'); return; }
      await supabase.from('audit_log').insert({
        action: 'update', module: 'cash_book',
        details: `Opening balance for ${fromDate}: ₹${openingBalance.toLocaleString('en-IN')} → ₹${val.toLocaleString('en-IN')}`,
        user_id: user?.id ?? null,
      });
      setEditingOpening(false);
      addToast('Opening balance saved', 'success');
      fetchData();
    } finally { setBusy(false); }
  };

  const addExpense = async () => {
    setFormError('');
    const amt = Number(amount);
    if (!amt || amt <= 0) { setFormError('Amount must be greater than 0'); return; }
    if (!category) { setFormError('Category is required'); return; }
    if (entryDate > today) { setFormError('Cannot add future expenses'); return; }
    // Mirror the DB backdated-expense lock: a past date inside a signed/pending
    // handover period is closed for new entries. Block cleanly before the insert.
    if (entryDate < today) {
      const h = handoverCovering(entryDate);
      if (h) { setFormError(`This date is locked — ${formatHandoverNo(h.handover_number)} (${h.period_from} → ${h.period_to}) already covers it. Record it as a correction on the handover instead.`); return; }
    }
    setExpSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const payload: CashExpenseInsert = { date: entryDate, amount: amt, category, description: description.trim() || null, paid_by: user?.id ?? null };
    const { error } = await supabase.from('cash_expenses').insert(payload);
    if (error) { setFormError('Save failed — ' + friendlyError(error)); setExpSaving(false); return; }
    addToast('Expense added!', 'success');
    setAmount(''); setDescription(''); setCategory(CATEGORIES[0]); setEntryDate(today); setFormError(''); setShowAdd(false); setExpSaving(false);
    fetchData();
  };

  const submitCorrection = async () => {
    if (!correctingExpense || correctSaving) return;
    setCorrectError('');
    const original = Number(correctingExpense.amount);
    const corrected = Number(correctAmount);
    if (correctAmount.trim() === '' || isNaN(corrected) || corrected < 0) { setCorrectError('Enter the correct amount (0 if the expense never happened)'); return; }
    const diff = Math.round((corrected - original) * 100) / 100;
    if (diff === 0) { setCorrectError('That is the same amount — nothing to correct'); return; }
    setCorrectSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const desc = `Correction of "${correctingExpense.category}${correctingExpense.description ? ': ' + correctingExpense.description : ''}" dated ${correctingExpense.date} — was ₹${original.toLocaleString('en-IN')}, corrected to ₹${corrected.toLocaleString('en-IN')}`;
    // diff is negative when the original was overstated — the counter-entry
    // puts the cash back; positive when understated. Dated TODAY so the
    // signed handover period's snapshot stays exactly as it was signed.
    const payload: CashExpenseInsert = { date: today, amount: diff, category: 'Adjustment', description: desc, paid_by: user?.id ?? null };
    const { error } = await supabase.from('cash_expenses').insert(payload);
    if (error) { setCorrectError('Save failed — ' + friendlyError(error)); setCorrectSaving(false); return; }
    await supabase.from('audit_log').insert({
      action: 'correct', module: 'cash_book',
      details: desc,
      user_id: user?.id ?? null,
    });
    setCorrectSaving(false); setCorrectingExpense(null); setCorrectAmount('');
    addToast('Adjustment recorded — cash balance corrected from today', 'success');
    fetchData();
  };

  // Compute available cash for a date range (auto-calc for handover)
  const computeBreakdown = useCallback(async (from: string, to: string): Promise<Breakdown> => {
    // Only UN-HANDED cash counts as available: challans/expenses already
    // stamped with a handover_id can't be handed over again. This per-item
    // exclusion replaces the old "subtract overlapping handover amounts"
    // heuristic — precise, and robust to edited payment dates / backdated sales.
    const [balR, expR, chR] = await Promise.all([
      supabase.from('cash_book_balances').select('opening_balance').eq('date', from).maybeSingle(),
      supabase.from('cash_expenses').select('amount').is('handover_id', null).gte('date', from).lte('date', to),
      supabase.from('cash_challans').select('amount_paid, is_return, status').is('handover_id', null).in('status', ['paid', 'partial']).gte('payment_date', from).lte('payment_date', to),
    ]);
    const fetchErr = balR.error || expR.error || chR.error;
    if (fetchErr) addToast('Cash flow calculation may be incomplete: ' + friendlyError(fetchErr), 'error');
    const bal = balR.data; const exp = expR.data; const ch = chR.data;
    const opening = Number(bal?.opening_balance || 0);
    const openingIsSet = bal !== null && bal !== undefined;
    type ChRow = Pick<CashChallan, 'amount_paid' | 'is_return' | 'status'>;
    type ExpRow = Pick<CashExpense, 'amount'>;
    const cashSales = ((ch as ChRow[] | null) || []).filter((r) => !r.is_return).reduce((s, r) => s + Number(r.amount_paid || 0), 0);
    const cashReturns = ((ch as ChRow[] | null) || []).filter((r) => r.is_return).reduce((s, r) => s + Number(r.amount_paid || 0), 0);
    const expensesTotal = ((exp as ExpRow[] | null) || []).reduce((s, r) => s + Number(r.amount), 0);
    const previousHandovers = 0; // superseded by the handover_id exclusion above
    const available = opening + cashSales - cashReturns - expensesTotal - previousHandovers;
    return { opening, openingIsSet, cashSales, cashReturns, expenses: expensesTotal, previousHandovers, available, periodFrom: from, periodTo: to };
  }, [addToast]);

  // Recompute when range changes in modal + load recent handovers
  useEffect(() => {
    if (showHandover) {
      computeBreakdown(handPeriodFrom, handPeriodTo).then(b => {
        setHandBreakdown(b);
        if (!handAmount) setHandAmount(String(Math.max(0, b.available)));
      });
      // Load last 5 handovers
      supabase.from('cash_handovers').select('id, handover_number, date, amount, from_user_name, to_user_name, status, confirmed_at, created_at, period_from, period_to, breakdown, reason, from_user_id, to_user_id, notes, reject_reason, rejected_at, rejected_by, cancelled_at, cancelled_by').order('created_at', { ascending: false }).limit(5).then(({ data, error }) => { if (error) addToast('Failed to load recent handovers — ' + friendlyError(error), 'error'); setRecentHandovers((data as Handover[] | null) || []); });
    }
  }, [showHandover, handPeriodFrom, handPeriodTo, computeBreakdown]);

  const createHandover = async () => {
    setHandError('');
    if (handSaving) return;
    if (currentUserRole === 'admin') { setHandError('Admins receive handovers — they do not initiate them.'); return; }
    const amt = Number(handAmount);
    if (!amt || amt <= 0) { setHandError('Amount must be greater than 0'); return; }
    if (!handToId) { setHandError('Select a recipient'); return; }
    const recipient = users.find(u => u.id === handToId);
    if (!recipient) { setHandError('Recipient not found'); return; }
    if (recipient.role !== 'admin') { setHandError('Handovers can only be sent to an admin.'); return; }
    if (handToId === currentUserId) { setHandError('Cannot hand over cash to yourself'); return; }
    if (!recipient.has_pin) { setHandError(`${recipient.full_name} has no PIN set. They must set it in Settings → Users first.`); return; }
    if (!handBreakdown) { setHandError('Breakdown not loaded — try again'); return; }
    if (amt > handBreakdown.available) { setHandError(`Cannot exceed available cash: ₹${handBreakdown.available.toLocaleString('en-IN')}`); return; }
    const amountDiffers = Math.abs(amt - handBreakdown.available) > 0.01;
    if (amountDiffers && !handReason.trim()) { setHandError('Amount differs from available cash. Add a reason in Notes/Reason field.'); return; }
    setHandSaving(true);
    const todayDate = localToday();
    // Only an IN-FLIGHT (pending) handover blocks — its cash is claimed but
    // unsigned. Confirmed handovers no longer hard-block: computeBreakdown
    // already nets them out of "available", so leftover cash from a partial
    // handover (or a too-low signed amount) can be handed over in a follow-up.
    // Both guards FAIL CLOSED: if the duplicate/overlap check itself errors,
    // creating the handover anyway is exactly the double-claim they prevent.
    const { data: existing, error: existErr } = await supabase.from('cash_handovers').select('id, status, amount').eq('to_user_id', recipient.id).eq('date', todayDate).eq('status', 'pending').maybeSingle();
    if (existErr) { setHandSaving(false); setHandError('Could not verify pending handovers — ' + friendlyError(existErr)); return; }
    if (existing) { setHandSaving(false); setHandError(`A pending handover for ${recipient.full_name} already exists today (₹${Number(existing.amount).toLocaleString('en-IN')}). Cancel it or wait for them to sign before sending another.`); return; }
    const { data: overlapping, error: overlapErr } = await supabase.from('cash_handovers').select('handover_number, status, period_from, period_to').eq('status', 'pending').lte('period_from', handPeriodTo).gte('period_to', handPeriodFrom);
    if (overlapErr) { setHandSaving(false); setHandError('Could not verify overlapping handovers — ' + friendlyError(overlapErr)); return; }
    if (overlapping && overlapping.length > 0) {
      const h = overlapping[0];
      setHandSaving(false); setHandError(`HO-${String(h.handover_number).padStart(4, '0')} (pending) already covers ${h.period_from} to ${h.period_to}. Wait for it to be signed, or cancel it, before creating an overlapping handover.`);
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    const { data: prof, error: profErr } = await supabase.from('profiles').select('full_name').eq('id', user?.id).maybeSingle();
    if (profErr) addToast('Could not load your profile name — using email on the handover', 'error');
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
    // Insert and return the generated handover_number for the notification
    const { data: inserted, error: hoErr } = await supabase.from('cash_handovers').insert(handoverPayload).select('handover_number').single();
    if (hoErr) { setHandSaving(false); addToast(friendlyError(hoErr), 'error'); return; }
    addToast('Handover created!', 'success');
    const hoNo = formatHandoverNo((inserted as { handover_number?: number } | null)?.handover_number);
    // WhatsApp notification to recipient
    if (recipient.phone) {
      const msg = encodeURIComponent(`Hi ${recipient.full_name},\n${prof?.full_name || 'Sender'} has initiated cash handover ${hoNo} of ₹${amt.toLocaleString('en-IN')} for you (period ${handPeriodFrom} to ${handPeriodTo}).\nPlease open DailyOffice → Cash Book → Handovers and sign with your PIN to confirm receipt, or reject with a reason.\n— Arya Designs`);
      // Open WhatsApp WITHOUT navigating the app away — the handover is already
      // saved, and location.href here used to dump desktop users out of the PWA.
      const waUrl = `https://wa.me/${waPhone(recipient.phone)}?text=${msg}`;
      const w = window.open(waUrl, '_blank', 'noopener');
      if (!w) window.location.href = waUrl; // popup blocked — fall back to same-tab
    }
    setHandSaving(false); setHandAmount(''); setHandToId(''); setHandNotes(''); setHandReason(''); setHandBreakdown(null); setShowHandover(false);
    fetchData();
  };

  // Print receipt for a handover
  const esc = (s: unknown) => String(s ?? '').replace(/[<>"'&]/g, c => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '&': '&amp;' }[c] || c));
  const printHandoverReceipt = async (h: Handover) => {
    const b = h.breakdown;
    let html = `<html><head><meta charset="utf-8"><title>Cash Handover Receipt</title><style>
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
      @media print{@page{margin:10mm}}
    </style></head><body>`;
    const receiptDate = h.created_at ? new Date(h.created_at).toLocaleDateString('en-IN') : '—';
    const periodFromStr = h.period_from ? new Date(h.period_from).toLocaleDateString('en-IN') : '-';
    const periodToStr = h.period_to ? new Date(h.period_to).toLocaleDateString('en-IN') : '-';
    html += `<div class="header"><h2>Arya Designs</h2><p style="margin:6px 0;color:#666;font-size:13px">CASH HANDOVER RECEIPT</p><p class="receipt-no">${formatHandoverNo(h.handover_number)} | ${receiptDate}</p><p style="margin:8px 0 0;font-size:13px;font-weight:600;color:#222">Period: ${periodFromStr} &rarr; ${periodToStr}</p></div>`;
    html += `<div class="meta">
      <div><strong>From</strong>${esc(h.from_user_name)}</div>
      <div><strong>To</strong>${esc(h.to_user_name)}</div>
      <div><strong>Period Covered</strong>${periodFromStr} to ${periodToStr}</div>
      <div><strong>Status</strong><span class="status ${h.status === 'confirmed' ? 'signed' : 'pending'}">${h.status === 'confirmed' ? '✓ Signed' : h.status === 'disputed' ? '✕ Rejected' : h.status === 'cancelled' ? 'Cancelled' : 'Pending'}</span></div>
    </div>`;
    if (b) {
      html += `<table><thead><tr><th>Cash Flow</th><th class="right">Amount (₹)</th></tr></thead><tbody>
        <tr><td>Opening Balance</td><td class="right">${b.opening.toFixed(2)}</td></tr>
        <tr><td>+ Cash Sales</td><td class="right">+${b.cashSales.toFixed(2)}</td></tr>
        <tr><td>− Cash Returns</td><td class="right">−${b.cashReturns.toFixed(2)}</td></tr>
        <tr><td>− Cash Expenses</td><td class="right">−${b.expenses.toFixed(2)}</td></tr>
        <tr><td>− Previous Handovers</td><td class="right">−${b.previousHandovers.toFixed(2)}</td></tr>
        <tr class="total-row"><td>= Available Cash</td><td class="right">${b.available.toFixed(2)}</td></tr>
        <tr class="total-row"><td>HANDED OVER</td><td class="right">${Number(h.amount).toFixed(2)}</td></tr>
      </tbody></table>`;
    } else {
      html += `<p style="text-align:center;font-size:18px;font-weight:700;padding:14px;background:#fffbe6;border-radius:6px">Amount Handed: ₹${Number(h.amount).toFixed(2)}</p>`;
    }
    if (h.reason) html += `<div class="reason"><strong>Reason for amount difference:</strong><br/>${esc(h.reason)}</div>`;
    if (h.notes) html += `<p style="font-size:12px;color:#555"><strong>Notes:</strong> ${esc(h.notes)}</p>`;
    if (h.status === 'confirmed' && h.confirmed_at) {
      html += `<p style="text-align:center;color:#155724;font-size:12px;margin-top:20px">✓ Digitally signed by ${esc(h.to_user_name)} on ${new Date(h.confirmed_at).toLocaleString('en-IN')}</p>`;
    }
    html += `<div class="signature">
      <div class="sig-box">${esc(h.from_user_name)}<br/><span style="font-size:10px">Sender Signature</span></div>
      <div class="sig-box">${esc(h.to_user_name)}<br/><span style="font-size:10px">Recipient Signature${h.status === 'confirmed' ? ' (Digitally Signed)' : ''}</span></div>
    </div>`;
    html += `<p style="text-align:center;color:#999;font-size:9px;margin-top:30px;letter-spacing:1px;text-transform:uppercase">Powered by DailyOffice</p>`;
    html += `</body></html>`;
    await printOrQueue('document', html, 'A4', `Handover ${formatHandoverNo(h.handover_number)}`, undefined, addToast);
  };

  const confirmHandover = async () => {
    if (busy) return;
    setBusy(true);
    setConfirmError('');
    if (!confirmingHandover || !confirmPin.trim()) { setConfirmError('Enter PIN'); setBusy(false); return; }
    try {
      const now = Date.now();
      if (pinLockUntil > now) {
        const secs = Math.ceil((pinLockUntil - now) / 1000);
        setConfirmError(`Too many wrong attempts. Try again in ${secs}s.`);
        return;
      }
      // Confirm is now a single SECURITY DEFINER RPC: it verifies the PIN,
      // enforces recipient == caller, and flips the status inside one
      // transaction. The browser can no longer skip the PIN and PATCH the
      // status directly.
      const { data: res, error } = await supabase.rpc('confirm_handover', { p_id: confirmingHandover.id, p_pin: confirmPin.trim() });
      if (error) { setConfirmError(friendlyError(error)); return; }
      const r = (res && typeof res === 'object' ? res : {}) as { valid?: boolean; locked?: boolean; retry_after?: number; attempts?: number; no_pin?: boolean; error?: string };
      if (!r.valid) {
        if (r.no_pin) { setConfirmError('You have no PIN set. Go to Settings → My Profile to set one.'); return; }
        if (r.error === 'not_recipient') { setConfirmError(`This handover is meant for ${confirmingHandover.to_user_name}. Only they can sign it.`); return; }
        if (r.error === 'not_pending' || r.error === 'not_found' || r.error === 'state_changed') {
          addToast('This handover is no longer pending. It may have been rejected or already confirmed.', 'error');
          setConfirmingHandover(null); setConfirmPin(''); fetchData(); return;
        }
        if (r.locked && r.retry_after) {
          setPinLockUntil(Date.now() + r.retry_after * 1000);
          setConfirmError(`Too many failed attempts (${r.attempts ?? 0}). Locked for ${r.retry_after}s.`);
        } else {
          const left = Math.max(0, 3 - (r.attempts ?? 0));
          setConfirmError(`Incorrect PIN. ${left} attempt${left === 1 ? '' : 's'} before lockout.`);
        }
        setConfirmPin('');
        return;
      }
      setPinLockUntil(0);
      setConfirmingHandover(null); setConfirmPin('');
      addToast('Handover confirmed', 'success');
      fetchData();
    } finally { setBusy(false); }
  };

  // Reject a pending handover — only the intended recipient may reject,
  // and only while status is still 'pending'. Sets status='disputed' with
  // reject_reason + rejected_at + rejected_by (enforced by CHECK constraint).
  const submitReject = async () => {
    if (busy) return;
    setBusy(true);
    setRejectError('');
    try {
      if (!rejectingHandover) return;
      const reason = rejectReason.trim();
      if (!reason) { setRejectError('Please explain why you are rejecting this handover.'); return; }
      const { data: res, error } = await supabase.rpc('reject_handover', { p_id: rejectingHandover.id, p_reason: reason });
      if (error) { setRejectError(friendlyError(error)); return; }
      const r = (res && typeof res === 'object' ? res : {}) as { ok?: boolean; error?: string };
      if (!r.ok) {
        if (r.error === 'not_recipient') { setRejectError(`Only ${rejectingHandover.to_user_name} can reject this handover.`); return; }
        if (r.error === 'reason_required') { setRejectError('Please explain why you are rejecting this handover.'); return; }
        setRejectError('This handover is no longer pending — please refresh.'); return;
      }
      setRejectingHandover(null); setRejectReason('');
      addToast('Handover rejected', 'success');
      fetchData();
    } finally { setBusy(false); }
  };

  // Sender can withdraw a still-unsigned handover — without this, a recipient
  // who never signs (left the company, lost their phone) locked the cash and
  // the period forever. Only pending handovers can be cancelled; the DB guard
  // (.eq status pending) closes the race with a simultaneous sign/reject.
  const cancelHandover = async () => {
    if (busy || !cancellingHandover) return;
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { addToast('Not logged in', 'error'); return; }
      const { data: res, error } = await supabase.rpc('cancel_handover', { p_id: cancellingHandover.id });
      if (error) { addToast('Cancel failed — ' + friendlyError(error), 'error'); return; }
      const r = (res && typeof res === 'object' ? res : {}) as { ok?: boolean; error?: string };
      if (!r.ok) {
        if (r.error === 'not_sender') { addToast(`Only ${cancellingHandover.from_user_name} (the sender) can cancel this handover.`, 'error'); return; }
        addToast('This handover is no longer pending — it may have been signed or rejected.', 'error');
        setCancellingHandover(null); fetchData(); return;
      }
      await supabase.from('audit_log').insert({
        action: 'cancel', module: 'cash_book',
        details: `Handover ${formatHandoverNo(cancellingHandover.handover_number)} of ₹${Number(cancellingHandover.amount).toLocaleString('en-IN')} to ${cancellingHandover.to_user_name} cancelled by sender`,
        user_id: user.id,
      });
      setCancellingHandover(null);
      addToast('Handover cancelled — the cash is available again', 'success');
      fetchData();
    } finally { setBusy(false); }
  };

  // Expenses that fall inside a CONFIRMED cash handover's period are locked —
  // deleting them would silently change the numbers that a signed handover
  // was based on. We hide the delete button for these rows and refuse at
  // the handler level as a second line of defense.
  // A date is locked if it sits inside a confirmed OR pending handover period
  // — mirrors the DB triggers (prevent_backdated_expense_insert /
  // prevent_locked_expense_mutation) so the UI never offers an action the DB
  // will refuse. Returns the covering handover, or null.
  const handoverCovering = useCallback((d: string): Handover | null => {
    if (!d) return null;
    for (const h of handovers) {
      if (h.status !== 'confirmed' && h.status !== 'pending') continue;
      const hFrom = h.period_from || h.date;
      const hTo = h.period_to || h.date;
      if (hFrom && hTo && d >= hFrom && d <= hTo) return h;
    }
    return null;
  }, [handovers]);

  const lockedExpenseIds = useMemo(() => {
    const locked = new Set<string>();
    const active = handovers.filter(h => h.status === 'confirmed' || h.status === 'pending');
    if (active.length === 0) return locked;
    for (const e of expenses) {
      const eDate = e.date; // 'YYYY-MM-DD'
      for (const h of active) {
        const hFrom = h.period_from || h.date;
        const hTo = h.period_to || h.date;
        if (eDate && hFrom && hTo && eDate >= hFrom && eDate <= hTo) { locked.add(e.id); break; }
      }
    }
    return locked;
  }, [expenses, handovers]);

  // Handover covering the currently-picked Add-Expense date (locked if past).
  const addLockH = entryDate < today ? handoverCovering(entryDate) : null;

  const deleteExpense = async (id: string) => {
    if (lockedExpenseIds.has(id)) {
      setConfirmDelete(null);
      addToast('This expense is locked — it was included in a confirmed cash handover and cannot be deleted.', 'error');
      return;
    }
    setConfirmDelete(null);
    setExpenses(prev => prev.filter(e => e.id !== id));
    if (pendingExpDel) clearTimeout(pendingExpDel.timer);
    const timer = window.setTimeout(async () => {
      const { error } = await supabase.from('cash_expenses').delete().eq('id', id);
      if (error) addToast('Delete failed — ' + friendlyError(error), 'error');
      setPendingExpDel(null);
      fetchData();
    }, 5000);
    setPendingExpDel({ id, timer });
  };
  const undoExpDel = () => { if (pendingExpDel) { clearTimeout(pendingExpDel.timer); setPendingExpDel(null); fetchData(); } };
  // Unmount during the 5s undo window: clear the timer (it would fire against
  // an unmounted component) and commit the delete immediately — the user
  // asked for it and the undo affordance is gone.
  const pendingExpDelRef = useRef(pendingExpDel);
  pendingExpDelRef.current = pendingExpDel;
  useEffect(() => () => {
    const p = pendingExpDelRef.current;
    if (p) {
      clearTimeout(p.timer);
      supabase.from('cash_expenses').delete().eq('id', p.id).then(() => {});
    }
  }, []);
  const dismissExpDel = async () => {
    if (!pendingExpDel) return;
    clearTimeout(pendingExpDel.timer);
    const { error } = await supabase.from('cash_expenses').delete().eq('id', pendingExpDel.id);
    if (error) addToast('Delete failed — ' + friendlyError(error), 'error');
    setPendingExpDel(null);
    fetchData();
  };

  const sq = search.toLowerCase().trim();
  const filteredExpenses = sq ? expenses.filter(e => (e.description || '').toLowerCase().includes(sq) || (e.category || '').toLowerCase().includes(sq)) : expenses;
  const filteredSales = sq ? sales.filter(s => (s.customer_name || '').toLowerCase().includes(sq) || String(s.challan_number || '').includes(sq)) : sales;
  const filteredHandovers = sq ? handovers.filter(h => (h.from_user_name || '').toLowerCase().includes(sq) || (h.to_user_name || '').toLowerCase().includes(sq) || (h.notes || '').toLowerCase().includes(sq)) : handovers;

  const exportCSV = () => {
    // Export what's on screen: the filtered arrays, so an active search and
    // the file agree (previously exported the unfiltered range).
    const rowsForTab = tab === 'expenses' ? filteredExpenses : tab === 'sales' ? filteredSales : filteredHandovers;
    if (rowsForTab.length === 0) { addToast('Nothing to export in this date range', 'error'); return; }
    // Prefix ' on leading =+-@ so Excel/Sheets never treat user-typed text as
    // a formula (CSV injection) — same guard as the challan export.
    const esc = (v: string) => { const s = v || ''; const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; return `"${safe.replace(/"/g, '""')}"`; };
    let csv = '', label = '';
    if (tab === 'expenses') {
      label = 'Expenses';
      csv = 'Date,Amount,Category,Description\n' + filteredExpenses.map(e => `${e.date},${e.amount},${esc(e.category)},${esc(e.description || '')}`).join('\n');
    } else if (tab === 'sales') {
      label = 'CashSales';
      csv = 'Challan#,Customer,Amount Paid,Payment Mode,Payment Date,Return\n' + filteredSales.map(s => `${s.challan_number},${esc(s.customer_name)},${s.amount_paid},${esc(s.payment_mode || '')},${s.payment_date || ''},${s.is_return ? 'Yes' : 'No'}`).join('\n');
    } else {
      label = 'Handovers';
      csv = 'Handover#,Date,From,To,Amount,Status\n' + filteredHandovers.map(h => `${h.handover_number},${h.date},${esc(h.from_user_name)},${esc(h.to_user_name)},${h.amount},${h.status}`).join('\n');
    }
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `CashBook_${label}_${fromDate}_to_${toDate}.csv`; a.click(); URL.revokeObjectURL(url);
    addToast(`Exported ${rowsForTab.length} ${label.toLowerCase()}`, 'success');
  };

  return (
    <div className="page-pad" style={{ fontFamily: T.sans, color: T.tx, padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <DateInput value={fromDate} onChange={e => setFromDate(e.target.value)} />
          <span style={{ fontSize: 10, color: T.tx3 }}>to</span>
          <DateInput value={toDate} onChange={e => setToDate(e.target.value)} />
          {(search || fromDate !== today || toDate !== today) && <button onClick={() => { setSearch(''); setFromDate(today); setToDate(today); }} style={{ ...S.btnGhost, ...S.btnSm }}>Clear</button>}
          <button className="desktop-only" onClick={exportCSV} style={{ ...S.btnGhost, height: 36 }}>Export</button>
        </div>
        <div style={{ position: 'relative', maxWidth: 200 }}>
          <svg viewBox="0 0 24 24" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, fill: 'none', stroke: T.tx3, strokeWidth: 1.8, strokeLinecap: 'round' as const, opacity: 0.5 }}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" style={{ ...S.fSearch, width: '100%' }} />
        </div>
      </div>

      {/* Summary Card */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 12, padding: '14px 16px', marginBottom: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, fontSize: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: T.tx2 }}>
            Opening Balance ({new Date(fromDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })})
            {!editingOpening ? <button onClick={() => setEditingOpening(true)} style={{ ...S.btnSm, border: `1px solid ${T.bd2}`, background: 'transparent', color: T.tx3, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 0.5 }}>Edit</button> : null}
          </div>
          {editingOpening ? (
            <div style={{ display: 'flex', gap: 4 }}>
              <input type="number" value={openingInput} onKeyDown={e => numericKeyDown(e, true)} onChange={e => setOpeningInput(e.target.value)} placeholder="0" style={{ ...S.fInput, width: 100, fontFamily: T.mono, textAlign: 'right' }} />
              <button onClick={saveOpening} disabled={busy} style={{ ...S.btnPrimary, ...S.btnSm, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1 }}>{busy ? 'Saving…' : 'Save'}</button>
              <button onClick={() => { setEditingOpening(false); setOpeningInput(String(openingBalance)); }} style={{ ...S.btnGhost, ...S.btnSm }}>Cancel</button>
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
          <div style={{ display: 'flex', alignItems: 'center', color: T.tx, fontWeight: 700, fontFamily: T.sora, fontSize: 14, borderTop: `1px solid ${T.bd}`, paddingTop: 8, marginTop: 4, gridColumn: '1 / 2' }}>= Cash on Hand</div>
          <div style={{ fontFamily: T.mono, color: closingBalance >= 0 ? T.gr : T.re, fontWeight: 800, fontSize: 16, borderTop: `1px solid ${T.bd}`, paddingTop: 8, marginTop: 4 }}>₹{closingBalance.toLocaleString('en-IN')}</div>
          {totalHandovers > 0 && <>
            <span style={{ color: T.tx3, fontSize: 11, gridColumn: '1 / 2' }}>Cash handed to admin (signed, internal)</span>
            <span style={{ fontFamily: T.mono, color: T.tx3, fontWeight: 600, fontSize: 11 }}>₹{totalHandovers.toLocaleString('en-IN')}</span>
          </>}
        </div>
      </div>

      {/* Segmented tabs (audit P2): bigger hit target + count in muted pill */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, background: 'rgba(255,255,255,0.02)', borderRadius: 8, padding: 3, width: 'fit-content', border: `1px solid ${T.bd}`, flexWrap: 'wrap' }}>
        {([
          { id: 'expenses', label: 'Expenses', count: expenses.length },
          { id: 'sales', label: 'Cash Sales', count: sales.length },
          { id: 'handovers', label: 'Handovers', count: handovers.length },
        ] as const).map(t => {
          const active = tab === t.id;
          return (
            <button key={t.id} tabIndex={0} onClick={() => setTab(t.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setTab(t.id); }} style={{ ...S.btnPrimary, padding: '7px 14px', borderRadius: 6, fontSize: 12, fontWeight: active ? 700 : 500, cursor: 'pointer', background: active ? S.btnPrimary.background : 'transparent', color: active ? '#fff' : T.tx3, boxShadow: active ? S.btnPrimary.boxShadow : 'none', display: 'flex', alignItems: 'center', gap: 8, transition: T.transition }}>
              <span>{t.label}</span>
              <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 10, background: active ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.04)', color: active ? '#fff' : T.tx3, fontFamily: T.mono, minWidth: 18, textAlign: 'center' as const }}>{t.count}</span>
            </button>
          );
        })}
      </div>

      {/* Expenses Tab */}
      {tab === 'expenses' && <>
        <button onClick={() => setShowAdd(true)} style={{ ...S.btnPrimary, marginBottom: 10 }}>+ Add Expense</button>
        <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, overflow: 'hidden' }}>
          {loading && expenses.length === 0 && <SkeletonRows rows={4} />}
          {!loading && filteredExpenses.length === 0 && <div style={{ padding: 14 }}><Empty icon="clipboard" title={sq ? 'No matching expenses' : 'No expenses'} message={sq ? 'Try a different search term.' : 'No expenses recorded in this date range.'} /></div>}
          {filteredExpenses.map(e => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: `1px solid ${T.bd}` }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: T.tx }}>{e.category}</span>
                  <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'rgba(255,255,255,0.04)', color: T.tx3, fontFamily: T.mono }}>{new Date(e.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                </div>
                {e.description && <div style={{ fontSize: 10, color: T.tx3 }}>{e.description}</div>}
                {e.paid_by && (() => { const name = users.find(u => u.id === e.paid_by)?.full_name; return name ? <div style={{ fontSize: 9, color: T.tx3, marginTop: 1 }}>by {name}</div> : null; })()}
              </div>
              {/* Negative amount = adjustment entry putting cash back */}
              <div style={{ fontSize: 13, fontWeight: 700, fontFamily: T.mono, color: Number(e.amount) < 0 ? T.gr : T.re }}>{Number(e.amount) < 0 ? '+' : '−'}₹{Math.abs(Number(e.amount)).toLocaleString('en-IN')}</div>
              {lockedExpenseIds.has(e.id) ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {currentUserRole === 'admin' && <button onClick={() => { setCorrectingExpense(e); setCorrectAmount(''); setCorrectError(''); }} style={{ padding: '4px 10px', borderRadius: 4, border: `1px solid ${T.bd2}`, background: 'rgba(255,255,255,0.03)', color: T.yl, fontSize: 10, fontWeight: 600, cursor: 'pointer' }} title="Record a correction entry — the locked original stays untouched">Correct</button>}
                  <span title="Included in a confirmed cash handover — cannot be deleted" style={{ display: 'inline-flex', alignItems: 'center', padding: 0, opacity: 0.5, color: T.tx3 }}>
                    <svg viewBox="0 0 24 24" style={{ width: 13, height: 13, fill: 'none', stroke: 'currentColor', strokeWidth: 2 }}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
                  </span>
                </span>
              ) : (
                <button onClick={() => setConfirmDelete(e.id)} style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer', opacity: 0.4 }} aria-label="Delete">
                  <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'none', stroke: T.re, strokeWidth: 2 }}><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                </button>
              )}
            </div>
          ))}
        </div>
      </>}

      {/* Sales Tab */}
      {tab === 'sales' && (
        <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, overflow: 'hidden' }}>
          {loading && sales.length === 0 && <SkeletonRows rows={4} />}
          {!loading && filteredSales.length === 0 && <div style={{ padding: 14 }}><Empty icon="receipt" title={sq ? 'No matching sales' : 'No cash sales'} message={sq ? 'Try a different search term.' : 'No cash-paid challans in this date range.'} /></div>}
          {filteredSales.map(s => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: `1px solid ${T.bd}` }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 10, fontFamily: T.mono, color: T.tx3 }}>#{s.challan_number}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: T.tx }}>{s.customer_name}</span>
                  {s.is_return && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'rgba(239,68,68,.12)', color: T.re, fontWeight: 600, textTransform: 'uppercase' }}>Return</span>}
                </div>
                <div style={{ fontSize: 9, color: T.tx3 }}>₹{Number(s.amount_paid).toLocaleString('en-IN')}{s.payment_mode ? ` · ${s.payment_mode}` : ''}{s.payment_date ? ` · ${new Date(s.payment_date + 'T00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}` : ''}</div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, fontFamily: T.mono, color: s.is_return ? T.re : T.gr }}>{s.is_return ? '−' : '+'}₹{Number(s.amount_paid).toLocaleString('en-IN')}</div>
            </div>
          ))}
        </div>
      )}

      {/* Handovers Tab */}
      {tab === 'handovers' && <>
        {currentUserRole !== 'admin' ? (
          <button onClick={() => setShowHandover(true)} style={{ ...S.btnWarnSolid, padding: '7px 14px', borderRadius: 6, fontSize: 11, marginBottom: 10 }}>+ Initiate Handover</button>
        ) : (
          <div style={{ padding: '8px 12px', borderRadius: 6, background: T.ac3, border: `1px solid ${T.ac3}`, color: T.tx2, fontSize: 10, marginBottom: 10 }}>Admins receive handovers — users initiate them. Review pending handovers below.</div>
        )}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, overflow: 'hidden' }}>
          {loading && handovers.length === 0 && <SkeletonRows rows={4} />}
          {!loading && filteredHandovers.length === 0 && <div style={{ padding: 14 }}><Empty icon="handshake" title={sq ? 'No matching handovers' : 'No handovers'} message={sq ? 'Try a different search term.' : 'No cash handovers recorded in this date range.'} /></div>}
          {filteredHandovers.map(h => (
            <div key={h.id} style={{ padding: '11px 12px', borderBottom: `1px solid ${T.bd}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10, fontFamily: T.mono, color: T.ac2, fontWeight: 600 }}>{formatHandoverNo(h.handover_number)}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: T.tx }}>{h.from_user_name} → {h.to_user_name}</span>
                  <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'rgba(255,255,255,0.04)', color: T.tx3, fontFamily: T.mono }}>{new Date(h.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                  <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 3, background: h.status === 'confirmed' ? 'rgba(34,197,94,.12)' : h.status === 'disputed' ? 'rgba(239,68,68,.12)' : h.status === 'cancelled' ? 'rgba(255,255,255,.06)' : 'rgba(245,158,11,.12)', color: h.status === 'confirmed' ? T.gr : h.status === 'disputed' ? T.re : h.status === 'cancelled' ? T.tx3 : T.yl, fontWeight: 700, textTransform: 'uppercase' }}>{h.status === 'confirmed' ? '✓ Signed' : h.status === 'disputed' ? '✕ Rejected' : h.status === 'cancelled' ? 'Cancelled' : 'Pending'}</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, fontFamily: T.mono, color: T.tx }}>₹{Number(h.amount).toLocaleString('en-IN')}</span>
              </div>
              {h.notes && <div style={{ fontSize: 10, color: T.tx3, marginBottom: 4 }}>{h.notes}</div>}
              {h.reason && <div style={{ fontSize: 10, color: T.yl, marginBottom: 4 }}>⚠ {h.reason}</div>}
              {h.status === 'disputed' && h.reject_reason && <div style={{ fontSize: 10, color: T.re, marginBottom: 4 }}>✕ Rejected: {h.reject_reason}</div>}
              {h.status === 'confirmed' && h.confirmed_at && <div style={{ fontSize: 9, color: T.gr, fontFamily: T.mono, marginBottom: 4 }}>Signed at {new Date(h.confirmed_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>}
              {h.status === 'disputed' && h.rejected_at && <div style={{ fontSize: 9, color: T.re, fontFamily: T.mono, marginBottom: 4 }}>Rejected at {new Date(h.rejected_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>}
              {h.status === 'cancelled' && h.cancelled_at && <div style={{ fontSize: 9, color: T.tx3, fontFamily: T.mono, marginBottom: 4 }}>Cancelled by sender at {new Date(h.cancelled_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>}
              <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                {h.status === 'pending' && h.to_user_id === currentUserId && <button onClick={() => setConfirmingHandover(h)} style={{ ...S.btnSuccess, ...S.btnSm }}>Sign &amp; Confirm</button>}
                {h.status === 'pending' && h.to_user_id === currentUserId && <button onClick={() => { setRejectingHandover(h); setRejectReason(''); setRejectError(''); }} style={{ ...S.btnDanger, ...S.btnSm }}>Reject</button>}
                {h.status === 'pending' && h.from_user_id === currentUserId && <button onClick={() => setCancellingHandover(h)} style={{ ...S.btnDanger, ...S.btnSm }}>Cancel</button>}
                <button onClick={() => setViewingHandover(h)} style={{ padding: '4px 10px', borderRadius: 5, border: `1px solid ${T.bd2}`, background: 'rgba(255,255,255,0.03)', color: T.tx3, fontSize: 10, fontWeight: 500, cursor: 'pointer' }}>View Summary</button>
                <button onClick={() => printHandoverReceipt(h)} style={{ padding: '4px 10px', borderRadius: 5, border: `1px solid ${T.bd2}`, background: 'rgba(255,255,255,0.03)', color: T.tx3, fontSize: 10, fontWeight: 500, cursor: 'pointer' }}>Print</button>
              </div>
            </div>
          ))}
        </div>
      </>}

      {/* Initiate Handover Modal */}
      {showHandover && createPortal(
        <div style={{ ...S.modalOverlay }}>
          <div className="modal-inner" style={{ ...S.modalBox, maxWidth: 460, padding: '20px 18px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.tx, fontFamily: T.sora, marginBottom: 4 }}>Initiate Cash Handover</div>
            <div style={{ fontSize: 10, color: T.tx3, marginBottom: 12 }}>Auto-calculated from sales, expenses, and previous handovers</div>

            {/* Period Range */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              <div>
                <label style={{ ...S.fLabel, display: 'block', marginBottom: 4 }}>Period From</label>
                <DateInput value={handPeriodFrom} onChange={e => { setHandPeriodFrom(e.target.value); setHandAmount(''); }} style={{ width: '100%' }} />
              </div>
              <div>
                <label style={{ ...S.fLabel, display: 'block', marginBottom: 4 }}>Period To</label>
                <DateInput value={handPeriodTo} onChange={e => { setHandPeriodTo(e.target.value); setHandAmount(''); }} style={{ width: '100%' }} />
              </div>
            </div>

            {/* Breakdown Card */}
            {handBreakdown && (
              <div style={{ background: T.ac3, border: `1px solid ${T.ac3}`, borderRadius: 8, padding: '10px 12px', marginBottom: 10, fontSize: 11 }}>
                <div style={{ fontSize: 9, color: T.ac2, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>Cash Flow Summary</div>
                {!handBreakdown.openingIsSet && (
                  <div style={{ background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.2)', borderRadius: 4, padding: '6px 8px', marginBottom: 6, fontSize: 9, color: T.yl }}>
                    ⚠ No opening balance set for {handPeriodFrom}. Using ₹0. Set it in Cash Book before initiating if that's wrong.
                  </div>
                )}
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
                      <span style={{ color: T.ac2, fontFamily: T.mono, fontSize: 9, marginRight: 5 }}>{formatHandoverNo(h.handover_number)}</span>
                      <span style={{ color: T.tx2 }}>{new Date(h.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} · </span>
                      <span style={{ color: T.tx, fontWeight: 600 }}>{h.from_user_name} → {h.to_user_name}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontFamily: T.mono, color: T.tx, fontWeight: 600 }}>₹{Number(h.amount).toLocaleString('en-IN')}</span>
                      <span style={{ fontSize: 9, padding: '1px 4px', borderRadius: 3, background: h.status === 'confirmed' ? 'rgba(34,197,94,.12)' : 'rgba(245,158,11,.12)', color: h.status === 'confirmed' ? T.gr : T.yl, fontWeight: 700, textTransform: 'uppercase' }}>{h.status === 'confirmed' ? '✓' : 'Pending'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Recipient + Amount */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 8, marginBottom: 10 }}>
              <div>
                <label style={{ ...S.fLabel, display: 'block', marginBottom: 4 }}>Recipient (Admin)</label>
                <select value={handToId} onChange={e => setHandToId(e.target.value)} style={{ ...S.fInput, width: '100%', cursor: 'pointer' }}>
                  <option value="">Select admin...</option>
                  {users.filter(u => u.id !== currentUserId && u.role === 'admin').map(u => {
                    const issues = [];
                    if (!u.has_pin) issues.push('no PIN');
                    if (!u.phone) issues.push('no phone');
                    return <option key={u.id} value={u.id}>{u.full_name}{issues.length ? ` (${issues.join(', ')})` : ''}</option>;
                  })}
                  {users.filter(u => u.id !== currentUserId && u.role === 'admin').length === 0 && <option value="" disabled>No admin users available</option>}
                </select>
              </div>
              <div>
                <label style={{ ...S.fLabel, display: 'block', marginBottom: 4 }}>Amount (₹)</label>
                <input type="number" value={handAmount} onKeyDown={e => numericKeyDown(e)} onChange={e => setHandAmount(e.target.value)} placeholder="0.00" style={{ ...S.fInput, width: '100%', fontFamily: T.mono, border: handBreakdown && Math.abs(Number(handAmount) - handBreakdown.available) > 0.01 ? '1px solid rgba(245,158,11,.4)' : `1px solid ${T.bd2}` }} />
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
                <input type="text" value={handReason} onChange={e => setHandReason(e.target.value)} placeholder="e.g., Keeping ₹200 as petty cash" style={{ ...S.fInput, width: '100%' }} />
              </div>
            )}

            <div style={{ marginBottom: 12 }}>
              <label style={{ ...S.fLabel, display: 'block', marginBottom: 4 }}>Notes (optional)</label>
              <textarea value={handNotes} onChange={e => setHandNotes(e.target.value)} rows={2} placeholder="Additional context..." style={{ ...S.fInput, width: '100%', resize: 'vertical' }} />
            </div>
            {handError && <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '6px 10px', fontSize: 10, color: T.re, marginBottom: 8 }}>{handError}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setShowHandover(false); setHandError(''); setHandReason(''); setHandAmount(''); setHandToId(''); setHandNotes(''); setHandBreakdown(null); setExcludePaise(false); }} style={{ flex: 1, padding: '9px 0', borderRadius: 6, ...S.btnGhost, fontSize: 11 }}>Cancel</button>
              <button onClick={createHandover} style={{ ...S.btnWarnSolid, flex: 1, padding: '9px 0', borderRadius: 6, fontSize: 11, opacity: handSaving ? 0.5 : 1, pointerEvents: handSaving ? 'none' : 'auto' }}>{handSaving ? 'Initiating…' : 'Initiate'}</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* View Handover Details Modal */}
      {viewingHandover && createPortal(
        <div style={{ ...S.modalOverlay }}>
          <div className="modal-inner" style={{ ...S.modalBox, maxWidth: 460, padding: '20px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div>
                <span style={{ fontSize: 14, fontWeight: 700, color: T.tx, fontFamily: T.sora }}>Handover Details</span>
                <div style={{ fontSize: 11, fontFamily: T.mono, color: T.ac2, fontWeight: 600, marginTop: 2 }}>{formatHandoverNo(viewingHandover.handover_number)}</div>
              </div>
              <button onClick={() => setViewingHandover(null)} style={{ padding: '3px 10px', borderRadius: 5, border: `1px solid ${T.bd2}`, background: 'rgba(255,255,255,0.03)', color: T.tx3, fontSize: 10, cursor: 'pointer' }}>Close</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12, fontSize: 11 }}>
              <div><div style={{ fontSize: 9, color: T.tx3, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>From</div><div style={{ color: T.tx, fontWeight: 600 }}>{viewingHandover.from_user_name}</div></div>
              <div><div style={{ fontSize: 9, color: T.tx3, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>To</div><div style={{ color: T.tx, fontWeight: 600 }}>{viewingHandover.to_user_name}</div></div>
              <div><div style={{ fontSize: 9, color: T.tx3, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>Period</div><div style={{ color: T.tx2, fontFamily: T.mono, fontSize: 10 }}>{viewingHandover.period_from ? new Date(viewingHandover.period_from).toLocaleDateString('en-IN') : '-'} → {viewingHandover.period_to ? new Date(viewingHandover.period_to).toLocaleDateString('en-IN') : '-'}</div></div>
              <div><div style={{ fontSize: 9, color: T.tx3, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>Status</div><div style={{ color: viewingHandover.status === 'confirmed' ? T.gr : viewingHandover.status === 'disputed' ? T.re : viewingHandover.status === 'cancelled' ? T.tx3 : T.yl, fontWeight: 700, textTransform: 'uppercase', fontSize: 10 }}>{viewingHandover.status === 'confirmed' ? '✓ Signed' : viewingHandover.status === 'disputed' ? '✕ Rejected' : viewingHandover.status === 'cancelled' ? 'Cancelled' : 'Pending'}</div></div>
            </div>
            {viewingHandover.breakdown ? (
              <div style={{ background: T.ac3, border: `1px solid ${T.ac3}`, borderRadius: 8, padding: '10px 12px', marginBottom: 10, fontSize: 11 }}>
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
            {viewingHandover.status === 'confirmed' && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 9, color: T.tx3, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>Challans in this handover ({handoverItems.length})</div>
                {handoverItems.length === 0 ? (
                  <div style={{ fontSize: 10, color: T.tx3, fontStyle: 'italic' }}>No individual challans linked.</div>
                ) : (
                  <div style={{ maxHeight: 180, overflowY: 'auto', border: `1px solid ${T.bd}`, borderRadius: 6 }}>
                    {handoverItems.map((it, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '6px 10px', borderBottom: i < handoverItems.length - 1 ? `1px solid ${T.bd}` : 'none', fontSize: 11 }}>
                        <div style={{ minWidth: 0 }}>
                          <span style={{ fontFamily: T.mono, color: T.tx3 }}>#{it.challan_number}</span>
                          <span style={{ color: T.tx2, marginLeft: 8 }}>{it.customer_name}</span>
                          {it.is_return && <span style={{ fontSize: 8, color: T.re, marginLeft: 6, fontWeight: 700 }}>RET</span>}
                        </div>
                        <span style={{ fontFamily: T.mono, color: it.is_return ? T.re : T.gr, fontWeight: 600, flexShrink: 0 }}>{it.is_return ? '−' : ''}₹{Number(it.amount_paid).toLocaleString('en-IN')}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button onClick={() => printHandoverReceipt(viewingHandover)} style={{ ...S.btnPrimary, width: '100%', padding: '10px', borderRadius: 6, fontSize: 11 }}>Print Receipt</button>
          </div>
        </div>,
        document.body
      )}

      {/* Confirm Handover (Sign with PIN) Modal */}
      {confirmingHandover && createPortal(
        <div style={{ ...S.modalOverlay }}>
          <div className="modal-inner" style={{ ...S.modalBox, maxWidth: 360, padding: '20px 18px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.tx, fontFamily: T.sora, marginBottom: 4 }}>Sign &amp; Confirm {formatHandoverNo(confirmingHandover.handover_number)}</div>
            <div style={{ fontSize: 11, color: T.tx3, marginBottom: 12 }}>You are confirming receipt of <strong style={{ color: T.gr, fontFamily: T.mono }}>₹{Number(confirmingHandover.amount).toLocaleString('en-IN')}</strong> from <strong style={{ color: T.tx }}>{confirmingHandover.from_user_name}</strong>. This is a permanent legal record.</div>
            <input type="password" value={confirmPin} onChange={e => setConfirmPin(e.target.value)} placeholder="Your 4-6 digit PIN" autoFocus inputMode="numeric" style={{ ...S.fInput, width: '100%', fontFamily: T.mono, fontSize: 18, padding: '10px 12px', textAlign: 'center', letterSpacing: 6, marginBottom: 10 }} />
            {confirmError && <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '6px 10px', fontSize: 10, color: T.re, marginBottom: 8 }}>{confirmError}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setConfirmingHandover(null); setConfirmPin(''); setConfirmError(''); }} style={{ flex: 1, padding: '9px 0', borderRadius: 6, ...S.btnGhost, fontSize: 11 }}>Cancel</button>
              <button onClick={confirmHandover} disabled={busy} style={{ ...S.btnSuccessSolid, flex: 1, padding: '9px 0', borderRadius: 6, fontSize: 11, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1 }}>{busy ? 'Confirming…' : 'Sign & Confirm'}</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Reject Handover Modal — only visible to the intended recipient while status is still pending */}
      {rejectingHandover && createPortal(
        <div style={{ ...S.modalOverlay }}>
          <div className="modal-inner" style={{ ...S.modalBox, maxWidth: 400, padding: '20px 18px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.tx, fontFamily: T.sora, marginBottom: 4 }}>Reject {formatHandoverNo(rejectingHandover.handover_number)}</div>
            <div style={{ fontSize: 11, color: T.tx3, marginBottom: 12 }}>You are rejecting <strong style={{ color: T.re, fontFamily: T.mono }}>₹{Number(rejectingHandover.amount).toLocaleString('en-IN')}</strong> from <strong style={{ color: T.tx }}>{rejectingHandover.from_user_name}</strong>. This action is final — the sender will need to initiate a new handover.</div>
            <label style={{ ...S.fLabel, display: 'block', marginBottom: 4 }}>Reason for rejection</label>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="e.g. Amount doesn't match, missing cash, wrong period..." rows={3} autoFocus style={{ ...S.fInput, width: '100%', resize: 'vertical', marginBottom: 10 }} />
            {rejectError && <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '6px 10px', fontSize: 10, color: T.re, marginBottom: 8 }}>{rejectError}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setRejectingHandover(null); setRejectReason(''); setRejectError(''); }} style={{ flex: 1, padding: '9px 0', borderRadius: 6, ...S.btnGhost, fontSize: 11 }}>Cancel</button>
              <button onClick={submitReject} disabled={busy} style={{ ...S.btnDangerSolid, flex: 1, padding: '9px 0', borderRadius: 6, fontSize: 11, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1 }}>{busy ? 'Rejecting…' : 'Confirm Reject'}</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Correct Locked Expense Modal — admin-only counter-entry dated today */}
      {correctingExpense && createPortal(
        <div style={{ ...S.modalOverlay }}>
          <div className="modal-inner" style={{ ...S.modalBox, maxWidth: 400, padding: '20px 18px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.tx, fontFamily: T.sora, marginBottom: 4 }}>Correct Locked Expense</div>
            <div style={{ fontSize: 11, color: T.tx3, marginBottom: 12 }}>"{correctingExpense.category}{correctingExpense.description ? `: ${correctingExpense.description}` : ''}" dated {new Date(correctingExpense.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} is locked inside a signed handover. The original stays untouched — an adjustment entry dated today will fix the cash balance.</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label style={{ ...S.fLabel, display: 'block', marginBottom: 4 }}>Recorded Amount</label>
                <div style={{ ...S.fInput, width: '100%', fontFamily: T.mono, display: 'flex', alignItems: 'center', color: T.tx3, background: 'rgba(255,255,255,0.02)' }}>₹{Number(correctingExpense.amount).toLocaleString('en-IN')}</div>
              </div>
              <div>
                <label style={{ ...S.fLabel, display: 'block', marginBottom: 4 }}>Correct Amount (₹)</label>
                <input type="number" min="0" step="0.01" value={correctAmount} onKeyDown={e => numericKeyDown(e)} onChange={e => setCorrectAmount(e.target.value)} autoFocus placeholder="0.00" style={{ ...S.fInput, width: '100%', fontFamily: T.mono }} />
              </div>
            </div>
            {correctAmount.trim() !== '' && !isNaN(Number(correctAmount)) && (() => { const d = Math.round((Number(correctAmount) - Number(correctingExpense.amount)) * 100) / 100; if (d === 0) return null; return <div style={{ fontSize: 10, color: d < 0 ? T.gr : T.yl, fontWeight: 600, marginBottom: 10 }}>{d < 0 ? `₹${Math.abs(d).toLocaleString('en-IN')} will be returned to the cash balance` : `₹${d.toLocaleString('en-IN')} more will be deducted from the cash balance`}</div>; })()}
            {correctError && <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '6px 10px', fontSize: 10, color: T.re, marginBottom: 8 }}>{correctError}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setCorrectingExpense(null); setCorrectAmount(''); setCorrectError(''); }} style={{ flex: 1, padding: '9px 0', borderRadius: 6, ...S.btnGhost, fontSize: 11 }}>Cancel</button>
              <button onClick={submitCorrection} disabled={correctSaving} style={{ ...S.btnPrimary, flex: 1, padding: '9px 0', fontSize: 11, opacity: correctSaving ? 0.5 : 1, pointerEvents: correctSaving ? 'none' : 'auto' }}>{correctSaving ? 'Saving…' : 'Record Adjustment'}</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Cancel Handover Modal — only the SENDER, only while still pending */}
      {cancellingHandover && createPortal(
        <div style={{ ...S.modalOverlay }}>
          <div className="modal-inner" style={{ ...S.modalBox, maxWidth: 400, padding: '20px 18px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.tx, fontFamily: T.sora, marginBottom: 4 }}>Cancel {formatHandoverNo(cancellingHandover.handover_number)}?</div>
            <div style={{ fontSize: 11, color: T.tx3, marginBottom: 14 }}>This withdraws your unsigned handover of <strong style={{ color: T.yl, fontFamily: T.mono }}>₹{Number(cancellingHandover.amount).toLocaleString('en-IN')}</strong> to <strong style={{ color: T.tx }}>{cancellingHandover.to_user_name}</strong>. The cash becomes available again and you can initiate a fresh handover.</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setCancellingHandover(null)} style={{ flex: 1, padding: '9px 0', borderRadius: 6, ...S.btnGhost, fontSize: 11 }}>Keep It</button>
              <button onClick={cancelHandover} disabled={busy} style={{ ...S.btnDangerSolid, flex: 1, padding: '9px 0', borderRadius: 6, fontSize: 11, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1, pointerEvents: busy ? 'none' : 'auto' }}>{busy ? 'Cancelling…' : 'Cancel Handover'}</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Add Expense Modal */}
      {showAdd && createPortal(
        <div style={{ ...S.modalOverlay }}>
          <div className="modal-inner" style={{ ...S.modalBox, maxWidth: 380, padding: '20px 18px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.tx, fontFamily: T.sora, marginBottom: 14 }}>Add Expense</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: addLockH ? 6 : 10 }}>
              <div>
                <label style={{ ...S.fLabel, display: 'block', marginBottom: 4 }}>Date</label>
                <DateInput value={entryDate} max={today} onChange={e => setEntryDate(e.target.value)} style={{ width: '100%', ...(addLockH ? { borderColor: 'rgba(245,158,11,.5)' } : {}) }} />
              </div>
              <div>
                <label style={{ ...S.fLabel, display: 'block', marginBottom: 4 }}>Amount (₹)</label>
                <input type="number" min="0.01" step="0.01" value={amount} onKeyDown={e => numericKeyDown(e)} onChange={e => setAmount(e.target.value)} autoFocus placeholder="0.00" style={{ ...S.fInput, width: '100%', fontFamily: T.mono }} />
              </div>
            </div>
            {addLockH && <div style={{ background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.25)', borderRadius: 6, padding: '6px 10px', fontSize: 10, color: T.yl, marginBottom: 10 }}>This date is inside {formatHandoverNo(addLockH.handover_number)} ({addLockH.period_from} → {addLockH.period_to}) — the period is handed over and locked. Pick a later date, or record it as a correction on the handover.</div>}
            <div style={{ marginBottom: 10 }}>
              <label style={{ ...S.fLabel, display: 'block', marginBottom: 4 }}>Category</label>
              <select value={category} onChange={e => setCategory(e.target.value)} style={{ ...S.fInput, width: '100%', cursor: 'pointer' }}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ ...S.fLabel, display: 'block', marginBottom: 4 }}>Description (optional)</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="What was this expense for?" style={{ ...S.fInput, width: '100%', resize: 'vertical' }} />
            </div>
            {formError && <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '6px 10px', fontSize: 10, color: T.re, marginBottom: 8 }}>{formError}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setShowAdd(false); setFormError(''); setExpSaving(false); }} style={{ ...S.btnGhost, flex: 1, padding: '9px 0', fontSize: 11 }}>Cancel</button>
              <button onClick={addExpense} disabled={expSaving || !!addLockH} style={{ ...S.btnPrimary, flex: 1, padding: '9px 0', fontSize: 11, opacity: (expSaving || addLockH) ? 0.5 : 1, pointerEvents: (expSaving || addLockH) ? 'none' : 'auto' }}>{expSaving ? 'Saving…' : addLockH ? 'Date Locked' : 'Add'}</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete confirmation */}
      {confirmDelete && createPortal(
        <div style={{ ...S.modalOverlay }}>
          <div className="modal-inner" style={{ ...S.modalBox, maxWidth: 340, padding: '20px 18px', textAlign: 'center' }}>
            <div style={{ marginBottom: 6 }}><svg viewBox="0 0 24 24" style={{ width: 28, height: 28, fill: 'none', stroke: T.yl, strokeWidth: 2, strokeLinejoin: 'round' }}><path d="M12 2L2 22h20L12 2z" /><path d="M12 9v5" strokeLinecap="round" /><circle cx="12" cy="17" r=".5" fill={T.yl} /></svg></div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.tx, fontFamily: T.sora, marginBottom: 4 }}>Delete Expense?</div>
            <div style={{ fontSize: 11, color: T.tx3, marginBottom: 14 }}>This will permanently remove the expense.</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setConfirmDelete(null)} style={{ flex: 1, padding: '8px 0', borderRadius: 6, ...S.btnGhost, fontSize: 11 }}>Cancel</button>
              <button onClick={() => deleteExpense(confirmDelete)} style={{ ...S.btnDangerSolid, flex: 1, padding: '8px 0', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>Delete</button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {pendingExpDel && <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: T.s, border: `1px solid ${T.bd}`, borderRadius: 10, padding: 0, boxShadow: '0 8px 30px rgba(0,0,0,.5)', zIndex: 300, overflow: 'hidden', minWidth: 260 }}>
        <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}><span style={{ fontSize: 12, color: T.tx, flex: 1 }}>Expense deleted</span><button onClick={undoExpDel} style={{ padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, background: T.yl, color: '#fff' }}>Undo</button><button onClick={dismissExpDel} style={{ cursor: 'pointer', color: T.tx3, fontSize: 14, border: 'none', background: 'none' }} aria-label="Dismiss">✕</button></div>
        <div className="undo-bar" key={pendingExpDel.id} />
      </div>}
    </div>
  );
}
