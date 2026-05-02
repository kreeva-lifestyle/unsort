// Dashboard page — KPI cards, alerts, trends, task list
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { T, S, Pill } from '../lib/theme';
import { useAuth } from '../hooks/useAuth';
import { useDebouncedFetch } from '../hooks/useDebouncedFetch';
import { useNotifications } from '../hooks/useNotifications';
import { friendlyError } from '../lib/friendlyError';
import ConfirmModal, { useConfirm } from '../components/ui/ConfirmModal';

type ChallanRow = { total: number | string; amount_paid: number | string | null; status: string; is_return: boolean; customer_name: string; created_at: string };
type InventoryRow = { status: string; status_changed_at: string | null };
type ExpenseRow = { amount: number | string };
type HandoverRow = { handover_number: number; amount: number | string; status: string; date: string; from_user_name: string; created_at: string };
type BalanceRow = { opening_balance: number | string };
type OverdueAlert = { name: string; amount: number; days: number };
type DryCleanAlert = { days: number };
type TaskRow = { id: string; title: string; is_done: boolean; created_at: string };

export default function Dashboard({ navigateTo }: { navigateTo?: (tab: string) => void } = {}) {
  const { profile } = useAuth();
  const { addToast } = useNotifications();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const [pulse, setPulse] = useState({ scans: 0, revenue: 0, unsorted: 0, cashInHand: 0, handoverTotal: 0 });
  type PendingHandover = { number: number; from: string; amount: number; ageDays: number };
  const [alerts, setAlerts] = useState<{ overdue: OverdueAlert[]; dryClean: DryCleanAlert[]; pendingHandovers: PendingHandover[]; disputedCount: number }>({ overdue: [], dryClean: [], pendingHandovers: [], disputedCount: 0 });
  const [invBreakdown, setInvBreakdown] = useState<Record<string, number>>({});
  const [topCustomers, setTopCustomers] = useState<{ name: string; outstanding: number }[]>([]);
  const [scanTrend, setScanTrend] = useState<{ date: string; count: number }[]>([]);
  const [revTrend, setRevTrend] = useState<{ date: string; amount: number }[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [newTask, setNewTask] = useState('');
  const { ask, modalProps } = useConfirm();

  const fetchAll = useCallback(async () => {
    const today = new Date(); today.setHours(0,0,0,0);
    const todayISO = today.toISOString();
    let scansRes, challansRes, itemsRes, expensesRes, handoversRes, balancesRes;
    try {
      [scansRes, challansRes, itemsRes, expensesRes, handoversRes, balancesRes] = await Promise.all([
        supabase.from('packtime_scans').select('id', { count: 'exact', head: true }).gte('scanned_at', todayISO),
        supabase.from('cash_challans').select('total, amount_paid, status, is_return, customer_name, created_at').neq('status', 'voided').neq('status', 'draft'),
        supabase.from('inventory_items').select('status, status_changed_at'),
        supabase.from('cash_expenses').select('amount').gte('date', today.toISOString().slice(0,10)),
        supabase.from('cash_handovers').select('handover_number, amount, status, date, from_user_name, created_at'),
        supabase.from('cash_book_balances').select('opening_balance').eq('date', today.toISOString().slice(0,10)).maybeSingle(),
      ]);
    } catch (e: any) {
      console.error('Dashboard fetch failed:', e?.message || e);
      return; // keep old data instead of crashing
    }
    const challans = (challansRes.data ?? []) as ChallanRow[];
    const items = (itemsRes.data ?? []) as InventoryRow[];
    const expenses = (expensesRes.data ?? []) as ExpenseRow[];
    const handovers = (handoversRes.data ?? []) as HandoverRow[];
    const balances = balancesRes.data as BalanceRow | null;
    const scanCount = scansRes.count ?? 0;

    // Pulse
    const todayChallans = challans.filter(c => new Date(c.created_at) >= today);
    const todayRev = todayChallans.reduce((s, c) => s + (c.is_return ? -1 : 1) * Number(c.total || 0), 0);
    const unsortedCount = items.filter(i => i.status === 'unsorted').length;
    const opening = Number(balances?.opening_balance || 0);
    const cashSales = todayChallans.filter(c => !c.is_return).reduce((s, c) => s + Number(c.amount_paid || 0), 0);
    const cashReturns = todayChallans.filter(c => c.is_return).reduce((s, c) => s + Number(c.amount_paid || 0), 0);
    const totalExp = expenses.reduce((s, e) => s + Number(e.amount), 0);
    const confirmedHand = handovers.filter(h => h.status === 'confirmed' && h.date === today.toISOString().slice(0,10)).reduce((s, h) => s + Number(h.amount), 0);
    const handoverTotal = handovers.filter(h => h.status === 'confirmed').reduce((s, h) => s + Number(h.amount), 0);
    setPulse({ scans: scanCount, revenue: Math.round(todayRev), unsorted: unsortedCount, cashInHand: Math.round(opening + cashSales - cashReturns - totalExp - confirmedHand), handoverTotal: Math.round(handoverTotal) });

    // Alerts
    const sevenDaysAgo = Date.now() - 7 * 86400000;
    const overdue: OverdueAlert[] = challans.filter(c => !c.is_return && (c.status === 'unpaid' || c.status === 'partial') && new Date(c.created_at).getTime() < sevenDaysAgo)
      .map(c => ({ name: c.customer_name, amount: Number(c.total) - Number(c.amount_paid || 0), days: Math.floor((Date.now() - new Date(c.created_at).getTime()) / 86400000) }));
    const dryClean: DryCleanAlert[] = items.filter(i => i.status === 'dry_clean').map(i => ({ days: Math.floor((Date.now() - new Date(i.status_changed_at || Date.now()).getTime()) / 86400000) }));
    const pendHand: PendingHandover[] = handovers.filter(h => h.status === 'pending').map(h => ({
      number: h.handover_number, from: h.from_user_name, amount: Number(h.amount),
      ageDays: Math.floor((Date.now() - new Date(h.created_at || Date.now()).getTime()) / 86400000),
    }));
    const disputedCount = handovers.filter(h => h.status === 'disputed').length;
    setAlerts({ overdue, dryClean, pendingHandovers: pendHand, disputedCount });

    // Inventory breakdown
    const breakdown: Record<string, number> = {};
    items.forEach(i => { breakdown[i.status] = (breakdown[i.status] || 0) + 1; });
    setInvBreakdown(breakdown);

    // Top 5 customers
    const custMap: Record<string, number> = {};
    challans.filter(c => !c.is_return && (c.status === 'unpaid' || c.status === 'partial')).forEach(c => {
      custMap[c.customer_name] = (custMap[c.customer_name] || 0) + (Number(c.total) - Number(c.amount_paid || 0));
    });
    setTopCustomers(Object.entries(custMap).map(([name, outstanding]) => ({ name, outstanding })).sort((a, b) => b.outstanding - a.outstanding).slice(0, 5));

    // Scan trend (7 days)
    const { data: scanData } = await supabase.from('packtime_scans').select('scanned_at').gte('scanned_at', new Date(Date.now() - 7 * 86400000).toISOString());
    const scanByDay: Record<string, number> = {};
    for (let d = 6; d >= 0; d--) { const dt = new Date(Date.now() - d * 86400000); scanByDay[dt.toISOString().slice(0,10)] = 0; }
    ((scanData ?? []) as { scanned_at: string }[]).forEach(s => { const d = new Date(s.scanned_at).toISOString().slice(0,10); if (scanByDay[d] !== undefined) scanByDay[d]++; });
    setScanTrend(Object.entries(scanByDay).map(([date, count]) => ({ date, count })));

    // Revenue trend (30 days)
    const revByDay: Record<string, number> = {};
    for (let d = 29; d >= 0; d--) { const dt = new Date(Date.now() - d * 86400000); revByDay[dt.toISOString().slice(0,10)] = 0; }
    challans.forEach(c => { const d = new Date(c.created_at).toISOString().slice(0,10); if (revByDay[d] !== undefined) revByDay[d] += (c.is_return ? -1 : 1) * Number(c.amount_paid || 0); });
    setRevTrend(Object.entries(revByDay).map(([date, amount]) => ({ date, amount: Math.round(amount) })));
  }, []);

  const fetchTasks = () => { supabase.from('tasks').select('id, title, is_done, created_at').order('created_at', { ascending: false }).limit(100).then(({ data }) => setTasks((data ?? []) as TaskRow[])); };

  // Dashboard shows aggregate counts — a 2s lag is imperceptible.
  const { debounced: debouncedFetchAll } = useDebouncedFetch(fetchAll, 2000);
  const { debounced: debouncedFetchTasks } = useDebouncedFetch(fetchTasks, 2000);
  useEffect(() => {
    fetchAll(); fetchTasks();
    const ch = supabase.channel('dash-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items' }, debouncedFetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_challans' }, debouncedFetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'packtime_scans' }, debouncedFetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, debouncedFetchTasks)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.trim()) return;
    const { error } = await supabase.from('tasks').insert({ title: newTask.trim(), created_by: profile?.id });
    if (error) { addToast(friendlyError(error), 'error'); return; }
    setNewTask(''); fetchTasks();
  };
  const toggleTask = async (id: string, done: boolean) => {
    const { error } = await supabase.from('tasks').update({ is_done: !done }).eq('id', id);
    if (error) { addToast(friendlyError(error), 'error'); return; }
    fetchTasks();
  };
  const deleteTask = async (id: string) => {
    if (!await ask({ title: 'Delete task?', confirmLabel: 'Delete', danger: true })) return;
    const { error } = await supabase.from('tasks').delete().eq('id', id);
    if (error) { addToast(friendlyError(error), 'error'); return; }
    fetchTasks();
  };

  const maxScan = Math.max(...scanTrend.map(s => s.count), 1);
  const statusColors: Record<string, string> = { unsorted: T.yl, damaged: T.re, dry_clean: '#06b6d4', complete: T.gr, completed: '#10b981' };

  return (
    <div className="page-pad" style={{ padding: '14px 16px', animation: 'fi .15s ease', paddingBottom: 80 }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T.tx, fontFamily: T.sora }}>{greeting}, {profile?.full_name?.split(' ')[0] || 'there'}</h2>
        <p style={{ margin: '4px 0 0', fontSize: 14, color: T.tx2, fontWeight: 500 }}>{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })}</p>
      </div>

      {/* Row 1a: Today's Revenue — hero card (audit P1: the one number that matters) */}
      <div
        role={navigateTo ? 'button' : undefined}
        tabIndex={navigateTo ? 0 : undefined}
        onClick={() => navigateTo?.('challan')}
        onKeyDown={e => { if (navigateTo && (e.key === 'Enter' || e.key === ' ')) navigateTo('challan'); }}
        title="Net cash received today (sales − returns)"
        className="stat-hero"
        style={{ background: `linear-gradient(135deg, rgba(34,197,94,.08), rgba(34,197,94,.02))`, border: `1px solid rgba(34,197,94,.18)`, borderRadius: 12, padding: '18px 22px', marginBottom: 10, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, cursor: navigateTo ? 'pointer' : 'default', transition: T.transition, position: 'relative', overflow: 'hidden' }}
        onMouseEnter={e => navigateTo && (e.currentTarget.style.borderColor = 'rgba(34,197,94,.35)')}
        onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(34,197,94,.18)')}
      >
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${T.gr}cc, ${T.gr}22)` }} />
        <div>
          <p style={{ fontSize: 10, color: T.gr, letterSpacing: 1.2, marginBottom: 6, fontWeight: 700, textTransform: 'uppercase' }}>Today's Revenue</p>
          <p style={{ fontFamily: T.sora, fontSize: 44, fontWeight: 800, color: T.gr, margin: 0, lineHeight: 1, letterSpacing: -1.5 }}>₹{pulse.revenue.toLocaleString('en-IN')}</p>
        </div>
        <div style={{ textAlign: 'right' as const, fontSize: 11, color: T.tx3 }}>
          Net of returns<br /><span style={{ color: T.tx2 }}>Tap to open Challan</span>
        </div>
      </div>

      {/* Row 1b: Secondary stats — demoted to 3-up strip */}
      <div className="stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
        {([
          { label: "Today's Scans", value: pulse.scans, color: T.ac, prefix: '', tip: 'Total barcodes scanned today in PackStation', target: 'packtime' },
          { label: 'Unsorted Items', value: pulse.unsorted, color: T.yl, prefix: '', tip: 'Items awaiting sorting in Inventory', target: 'inventory' },
          { label: 'Cash in Hand', value: pulse.cashInHand, color: T.bl, prefix: '₹', tip: 'Opening balance + sales - expenses - handovers', target: 'challan' },
          { label: 'Total Handovers', value: pulse.handoverTotal, color: T.gr, prefix: '₹', tip: 'Total confirmed handovers', target: 'challan' },
        ] as const).map((c, i) => (
          <div
            key={i}
            role={navigateTo ? 'button' : undefined}
            tabIndex={navigateTo ? 0 : undefined}
            onClick={() => navigateTo?.(c.target)}
            onKeyDown={e => { if (navigateTo && (e.key === 'Enter' || e.key === ' ')) navigateTo(c.target); }}
            title={c.tip}
            style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: '10px 14px', position: 'relative', overflow: 'hidden', cursor: navigateTo ? 'pointer' : 'default', transition: T.transition }}
            onMouseEnter={e => navigateTo && (e.currentTarget.style.borderColor = T.bd2)}
            onMouseLeave={e => (e.currentTarget.style.borderColor = T.bd)}
          >
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${c.color}cc, ${c.color}33)` }} />
            <p style={{ fontSize: 9, color: T.tx3, letterSpacing: 0.8, marginBottom: 3, fontWeight: 600, textTransform: 'uppercase' }}>{c.label}</p>
            <p style={{ fontFamily: T.sora, fontSize: 18, fontWeight: 700, color: c.color, margin: 0 }}>{c.prefix}{c.value.toLocaleString('en-IN')}</p>
          </div>
        ))}
      </div>

      {/* Today's 3 things — hero attention strip (upgraded visual; same data, same handlers) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, marginTop: 4 }}>
        <div style={{ width: 6, height: 6, borderRadius: 3, background: T.ac, boxShadow: `0 0 12px ${T.ac}` }} />
        <div style={{ fontFamily: T.sora, fontSize: 12, fontWeight: 600, color: T.tx, letterSpacing: -0.1 }}>Today's 3 things</div>
        <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${T.bd} 0%, transparent 100%)` }} />
      </div>
      <div className="three-things" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
        {/* Overdue payments */}
        <div role="button" tabIndex={0} onClick={() => navigateTo?.('challan')} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') navigateTo?.('challan'); }} style={{ background: alerts.overdue.length > 0 ? 'rgba(248,113,113,.06)' : 'rgba(255,255,255,0.02)', border: `1px solid ${alerts.overdue.length > 0 ? 'rgba(248,113,113,.18)' : T.bd}`, borderLeft: `3px solid ${alerts.overdue.length > 0 ? T.re : T.bd2}`, borderRadius: 10, padding: '12px 14px', cursor: navigateTo ? 'pointer' : 'default', transition: T.transition, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 110 }} onMouseEnter={e => navigateTo && (e.currentTarget.style.borderColor = 'rgba(248,113,113,.35)')} onMouseLeave={e => (e.currentTarget.style.borderColor = alerts.overdue.length > 0 ? 'rgba(248,113,113,.18)' : T.bd)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Pill tone={alerts.overdue.length > 0 ? 're' : 'neutral'} dot>Overdue Payments</Pill>
            <span style={{ fontFamily: T.sora, fontSize: 18, fontWeight: 700, color: alerts.overdue.length > 0 ? T.re : T.tx3, lineHeight: 1 }}>{alerts.overdue.length}</span>
          </div>
          <div style={{ flex: 1 }}>
            {alerts.overdue.slice(0, 2).map((o, i) => <p key={i} style={{ fontSize: 10, color: T.tx2, margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.name}: ₹{o.amount.toLocaleString('en-IN')} ({o.days}d)</p>)}
            {alerts.overdue.length === 0 && <p style={{ fontSize: 10, color: T.tx3, margin: 0 }}>All caught up</p>}
          </div>
        </div>
        {/* Dry clean stuck */}
        <div role="button" tabIndex={0} onClick={() => navigateTo?.('inventory')} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') navigateTo?.('inventory'); }} style={{ background: alerts.dryClean.length > 0 ? 'rgba(56,189,248,.06)' : 'rgba(255,255,255,0.02)', border: `1px solid ${alerts.dryClean.length > 0 ? 'rgba(56,189,248,.18)' : T.bd}`, borderLeft: `3px solid ${alerts.dryClean.length > 0 ? T.bl : T.bd2}`, borderRadius: 10, padding: '12px 14px', cursor: navigateTo ? 'pointer' : 'default', transition: T.transition, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 110 }} onMouseEnter={e => navigateTo && (e.currentTarget.style.borderColor = 'rgba(56,189,248,.35)')} onMouseLeave={e => (e.currentTarget.style.borderColor = alerts.dryClean.length > 0 ? 'rgba(56,189,248,.18)' : T.bd)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Pill tone={alerts.dryClean.length > 0 ? 'bl' : 'neutral'} dot>In Dry Clean</Pill>
            <span style={{ fontFamily: T.sora, fontSize: 18, fontWeight: 700, color: alerts.dryClean.length > 0 ? T.bl : T.tx3, lineHeight: 1 }}>{alerts.dryClean.length}</span>
          </div>
          <div style={{ flex: 1 }}>
            {alerts.dryClean.length > 0 ? <p style={{ fontSize: 10, color: T.tx2, margin: 0 }}>Avg {Math.round(alerts.dryClean.reduce((s, d) => s + d.days, 0) / alerts.dryClean.length)} days at vendor</p> : <p style={{ fontSize: 10, color: T.tx3, margin: 0 }}>Nothing stuck</p>}
          </div>
        </div>
        {/* Pending handovers */}
        <div role="button" tabIndex={0} onClick={() => navigateTo?.('challan')} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') navigateTo?.('challan'); }} style={{ background: alerts.pendingHandovers.length > 0 ? 'rgba(251,191,36,.06)' : 'rgba(255,255,255,0.02)', border: `1px solid ${alerts.pendingHandovers.length > 0 ? 'rgba(251,191,36,.18)' : T.bd}`, borderLeft: `3px solid ${alerts.pendingHandovers.length > 0 ? T.yl : T.bd2}`, borderRadius: 10, padding: '12px 14px', cursor: navigateTo ? 'pointer' : 'default', transition: T.transition, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 110 }} onMouseEnter={e => navigateTo && (e.currentTarget.style.borderColor = 'rgba(251,191,36,.35)')} onMouseLeave={e => (e.currentTarget.style.borderColor = alerts.pendingHandovers.length > 0 ? 'rgba(251,191,36,.18)' : T.bd)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Pill tone={alerts.pendingHandovers.length > 0 ? 'yl' : 'neutral'} dot>Pending Handovers</Pill>
            <span style={{ fontFamily: T.sora, fontSize: 18, fontWeight: 700, color: alerts.pendingHandovers.length > 0 ? T.yl : T.tx3, lineHeight: 1 }}>{alerts.pendingHandovers.length}</span>
          </div>
          <div style={{ flex: 1 }}>
            {alerts.pendingHandovers.slice(0, 2).map(h => (
              <p key={h.number} style={{ fontSize: 9, color: T.tx2, margin: '0 0 2px' }}>HO-{String(h.number).padStart(4, '0')} from {h.from} — ₹{h.amount.toLocaleString('en-IN')}{h.ageDays > 0 ? `, ${h.ageDays}d ago` : ''}{h.ageDays >= 1 ? ' ⚠' : ''}</p>
            ))}
            {alerts.pendingHandovers.length === 0 && <p style={{ fontSize: 10, color: T.tx3, margin: 0 }}>None awaiting</p>}
            {alerts.disputedCount > 0 && <p style={{ fontSize: 9, color: T.re, margin: '4px 0 0', fontWeight: 600 }}>{alerts.disputedCount} rejected — needs attention</p>}
          </div>
        </div>
      </div>

      {/* Row 3: Trends */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
        {/* Scan Trend 7d */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: '12px 14px' }}>
          <p style={{ fontSize: 8, color: T.tx3, letterSpacing: 0.8, fontWeight: 600, textTransform: 'uppercase', marginBottom: 8 }}>Scans — Last 7 Days</p>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 60 }}>
            {scanTrend.map((s, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <span style={{ fontSize: 8, color: T.tx3, fontFamily: T.mono }}>{s.count}</span>
                <div style={{ width: '100%', background: `linear-gradient(180deg, ${T.ac}cc, ${T.ac}44)`, borderRadius: 3, height: Math.max(4, (s.count / maxScan) * 50) }} />
                <span style={{ fontSize: 7, color: T.tx3 }}>{new Date(s.date).toLocaleDateString('en-IN', { day: '2-digit' })}</span>
              </div>
            ))}
          </div>
        </div>
        {/* Revenue Trend 30d — with peak labels + 7-day moving avg (audit P2) */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: '12px 14px' }}>
          {(() => {
            const peak = revTrend.reduce((acc, r) => r.amount > acc.amount ? r : acc, { date: '', amount: -Infinity });
            const trough = revTrend.reduce((acc, r) => r.amount < acc.amount ? r : acc, { date: '', amount: Infinity });
            // 7-day trailing moving average
            const avgs = revTrend.map((_, i) => {
              const win = revTrend.slice(Math.max(0, i - 6), i + 1);
              return win.reduce((s, r) => s + r.amount, 0) / win.length;
            });
            const range = Math.max(1, Math.abs(peak.amount), Math.abs(trough.amount));
            return (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                  <p style={{ fontSize: 9, color: T.tx3, letterSpacing: 0.8, fontWeight: 600, textTransform: 'uppercase', margin: 0 }}>Revenue — Last 30 Days</p>
                  <p style={{ fontSize: 9, color: T.tx3, fontFamily: T.mono, margin: 0 }}>peak ₹{peak.amount.toLocaleString('en-IN')}</p>
                </div>
                <div style={{ position: 'relative', height: 64 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 50, position: 'relative', zIndex: 1 }}>
                    {revTrend.map((r, i) => (
                      <div key={i} style={{ flex: 1, background: r.amount >= 0 ? `${T.gr}88` : `${T.re}88`, borderRadius: 2, height: Math.max(2, (Math.abs(r.amount) / range) * 46), border: r.date === peak.date ? `1px solid ${T.gr}` : 'none' }} title={`${r.date}: ₹${r.amount.toLocaleString('en-IN')}`} />
                    ))}
                  </div>
                  {/* Moving-avg overlay as an SVG polyline */}
                  <svg width="100%" height="50" preserveAspectRatio="none" style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }} viewBox={`0 0 ${revTrend.length} 50`}>
                    <polyline points={avgs.map((a, i) => `${i + 0.5},${50 - Math.max(2, (Math.abs(a) / range) * 46)}`).join(' ')} fill="none" stroke={T.ac2} strokeWidth="0.4" strokeOpacity="0.85" />
                  </svg>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 9, color: T.tx3, fontFamily: T.mono }}>
                    <span>{revTrend[0] ? new Date(revTrend[0].date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : ''}</span>
                    <span style={{ color: T.ac2 }}>— 7d avg</span>
                    <span>{revTrend.length > 0 ? new Date(revTrend[revTrend.length - 1].date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : ''}</span>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
        {/* Inventory Breakdown */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: '12px 14px' }}>
          <p style={{ fontSize: 8, color: T.tx3, letterSpacing: 0.8, fontWeight: 600, textTransform: 'uppercase', marginBottom: 8 }}>Inventory Breakdown</p>
          {Object.entries(invBreakdown).map(([status, count]) => {
            const total = Object.values(invBreakdown).reduce((a, b) => a + b, 0) || 1;
            return (
              <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 9, color: T.tx2, width: 65, textTransform: 'capitalize' }}>{status.replace('_', ' ')}</span>
                <div style={{ flex: 1, background: T.s2, borderRadius: 3, height: 8, overflow: 'hidden' }}>
                  <div style={{ width: `${(count / total) * 100}%`, height: '100%', background: statusColors[status] || T.tx3, borderRadius: 3 }} />
                </div>
                <span style={{ fontSize: 9, fontFamily: T.mono, color: statusColors[status] || T.tx3, width: 28, textAlign: 'right' }}>{count}</span>
              </div>
            );
          })}
        </div>
        {/* Top 5 Customers Outstanding — rows deep-link to Challan filtered by customer */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: '12px 14px' }}>
          <p style={{ fontSize: 9, color: T.tx3, letterSpacing: 0.8, fontWeight: 600, textTransform: 'uppercase', marginBottom: 8 }}>Top Outstanding</p>
          {topCustomers.length === 0 && <p style={{ fontSize: 11, color: T.tx3 }}>No outstanding dues</p>}
          {topCustomers.map((c, i) => (
            <div
              key={i}
              role={navigateTo ? 'button' : undefined}
              tabIndex={navigateTo ? 0 : undefined}
              onClick={() => navigateTo?.('challan')}
              onKeyDown={e => { if (navigateTo && (e.key === 'Enter' || e.key === ' ')) navigateTo('challan'); }}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 4px', borderBottom: `1px solid ${T.bd}`, cursor: navigateTo ? 'pointer' : 'default', borderRadius: 4, transition: 'background .15s' }}
              onMouseEnter={e => navigateTo && (e.currentTarget.style.background = 'rgba(99,102,241,.06)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ fontSize: 11, color: T.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{c.name}</span>
              <span style={{ fontSize: 11, fontFamily: T.mono, color: T.re, fontWeight: 600, flexShrink: 0 }}>₹{c.outstanding.toLocaleString('en-IN')}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Row 4: Tasks */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: `1px solid ${T.bd}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: T.tx, fontFamily: T.sora }}>Tasks</span>
          <span style={{ fontSize: 9, color: T.tx3 }}>{tasks.filter(t => !t.is_done).length} pending</span>
        </div>
        <form onSubmit={addTask} style={{ display: 'flex', gap: 6, padding: '8px 12px', borderBottom: `1px solid ${T.bd}` }}>
          <input value={newTask} onChange={(e) => setNewTask(e.target.value)} placeholder="Add a task..." style={{ ...S.fInput, flex: 1 }} />
          <button type="submit" style={S.btnPrimary}>Add</button>
        </form>
        <div style={{ maxHeight: 200, overflowY: 'auto' }}>
          {tasks.map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderBottom: `1px solid ${T.bd}`, opacity: t.is_done ? 0.45 : 1 }}>
              <div onClick={() => toggleTask(t.id, t.is_done)} style={{ width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${t.is_done ? T.gr : T.bd2}`, background: t.is_done ? T.gr : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: '#000', fontWeight: 700, flexShrink: 0 }}>{t.is_done && '✓'}</div>
              <span style={{ flex: 1, fontSize: 11, color: T.tx, textDecoration: t.is_done ? 'line-through' : 'none' }}>{t.title}</span>
              <span onClick={() => deleteTask(t.id)} style={{ cursor: 'pointer', color: T.tx3, fontSize: 11, opacity: 0.4 }}>×</span>
            </div>
          ))}
          {tasks.length === 0 && <div style={{ padding: 18, textAlign: 'center', color: T.tx3, fontSize: 10 }}>No tasks yet</div>}
        </div>
      </div>
      <ConfirmModal {...modalProps} />
    </div>
  );
}
