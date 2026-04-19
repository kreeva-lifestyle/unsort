// Dashboard page — KPI cards, alerts, trends, task list
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { T, S } from '../lib/theme';
import { useAuth } from '../hooks/useAuth';

type ChallanRow = { total: number | string; amount_paid: number | string | null; status: string; is_return: boolean; customer_name: string; created_at: string };
type InventoryRow = { status: string; status_changed_at: string | null };
type ExpenseRow = { amount: number | string };
type HandoverRow = { amount: number | string; status: string; date: string };
type BalanceRow = { opening_balance: number | string };
type OverdueAlert = { name: string; amount: number; days: number };
type DryCleanAlert = { days: number };
type TaskRow = { id: string; title: string; is_done: boolean; created_at: string };

export default function Dashboard({ navigateTo }: { navigateTo?: (tab: string) => void } = {}) {
  const { profile } = useAuth();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const [pulse, setPulse] = useState({ scans: 0, revenue: 0, unsorted: 0, cashInHand: 0 });
  const [alerts, setAlerts] = useState<{ overdue: OverdueAlert[]; dryClean: DryCleanAlert[]; pendingHandovers: number }>({ overdue: [], dryClean: [], pendingHandovers: 0 });
  const [invBreakdown, setInvBreakdown] = useState<Record<string, number>>({});
  const [topCustomers, setTopCustomers] = useState<{ name: string; outstanding: number }[]>([]);
  const [scanTrend, setScanTrend] = useState<{ date: string; count: number }[]>([]);
  const [revTrend, setRevTrend] = useState<{ date: string; amount: number }[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [newTask, setNewTask] = useState('');

  const fetchAll = useCallback(async () => {
    const today = new Date(); today.setHours(0,0,0,0);
    const todayISO = today.toISOString();
    const [scansRes, challansRes, itemsRes, expensesRes, handoversRes, balancesRes] = await Promise.all([
      supabase.from('packtime_scans').select('id', { count: 'exact', head: true }).gte('scanned_at', todayISO),
      supabase.from('cash_challans').select('total, amount_paid, status, is_return, customer_name, created_at').neq('status', 'voided').neq('status', 'draft'),
      supabase.from('inventory_items').select('status, status_changed_at'),
      supabase.from('cash_expenses').select('amount').gte('date', today.toISOString().slice(0,10)),
      supabase.from('cash_handovers').select('amount, status, date'),
      supabase.from('cash_book_balances').select('opening_balance').eq('date', today.toISOString().slice(0,10)).maybeSingle(),
    ]);
    const challans = (challansRes.data ?? []) as ChallanRow[];
    const items = (itemsRes.data ?? []) as InventoryRow[];
    const expenses = (expensesRes.data ?? []) as ExpenseRow[];
    const handovers = (handoversRes.data ?? []) as HandoverRow[];
    const balances = balancesRes.data as BalanceRow | null;
    const scanCount = scansRes.count ?? 0;

    // Pulse
    const todayChallans = challans.filter(c => new Date(c.created_at) >= today);
    const todayRev = todayChallans.reduce((s, c) => s + (c.is_return ? -1 : 1) * Number(c.amount_paid || 0), 0);
    const unsortedCount = items.filter(i => i.status === 'unsorted').length;
    const opening = Number(balances?.opening_balance || 0);
    const cashSales = todayChallans.filter(c => !c.is_return).reduce((s, c) => s + Number(c.amount_paid || 0), 0);
    const cashReturns = todayChallans.filter(c => c.is_return).reduce((s, c) => s + Number(c.amount_paid || 0), 0);
    const totalExp = expenses.reduce((s, e) => s + Number(e.amount), 0);
    const confirmedHand = handovers.filter(h => h.status === 'confirmed' && h.date === today.toISOString().slice(0,10)).reduce((s, h) => s + Number(h.amount), 0);
    setPulse({ scans: scanCount, revenue: Math.round(todayRev), unsorted: unsortedCount, cashInHand: Math.round(opening + cashSales - cashReturns - totalExp - confirmedHand) });

    // Alerts
    const sevenDaysAgo = Date.now() - 7 * 86400000;
    const overdue: OverdueAlert[] = challans.filter(c => !c.is_return && (c.status === 'unpaid' || c.status === 'partial') && new Date(c.created_at).getTime() < sevenDaysAgo)
      .map(c => ({ name: c.customer_name, amount: Number(c.total) - Number(c.amount_paid || 0), days: Math.floor((Date.now() - new Date(c.created_at).getTime()) / 86400000) }));
    const dryClean: DryCleanAlert[] = items.filter(i => i.status === 'dry_clean').map(i => ({ days: Math.floor((Date.now() - new Date(i.status_changed_at || Date.now()).getTime()) / 86400000) }));
    const pendHand = handovers.filter(h => h.status === 'pending').length;
    setAlerts({ overdue, dryClean, pendingHandovers: pendHand });

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

  useEffect(() => {
    fetchAll(); fetchTasks();
    const ch = supabase.channel('dash-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_challans' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'packtime_scans' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, fetchTasks)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addTask = async (e: React.FormEvent) => { e.preventDefault(); if (!newTask.trim()) return; await supabase.from('tasks').insert({ title: newTask.trim(), created_by: profile?.id }); setNewTask(''); fetchTasks(); };
  const toggleTask = async (id: string, done: boolean) => { await supabase.from('tasks').update({ is_done: !done }).eq('id', id); fetchTasks(); };
  const deleteTask = async (id: string) => { if (!confirm('Delete this task?')) return; await supabase.from('tasks').delete().eq('id', id); fetchTasks(); };

  const maxScan = Math.max(...scanTrend.map(s => s.count), 1);
  const maxRev = Math.max(...revTrend.map(r => r.amount), 1);
  const statusColors: Record<string, string> = { unsorted: T.yl, damaged: T.re, dry_clean: '#06b6d4', complete: T.gr, completed: '#10b981' };

  return (
    <div className="page-pad" style={{ padding: '14px 16px', animation: 'fi .15s ease', paddingBottom: 80 }}>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: T.tx, fontFamily: T.sora }}>{greeting}, {profile?.full_name?.split(' ')[0] || 'there'}</h2>
        <p style={{ margin: '2px 0 0', fontSize: 11, color: T.tx3 }}>{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })}</p>
      </div>

      {/* Row 1: Today's Pulse */}
      <div className="stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
        {([
          { label: "Today's Scans", value: pulse.scans, color: T.ac, prefix: '', tip: 'Total barcodes scanned today in PackStation' },
          { label: "Today's Revenue", value: pulse.revenue, color: T.gr, prefix: '₹', tip: 'Net cash received today (sales - returns)' },
          { label: 'Unsorted Items', value: pulse.unsorted, color: T.yl, prefix: '', tip: 'Items awaiting sorting in Inventory' },
          { label: 'Cash in Hand', value: pulse.cashInHand, color: T.bl, prefix: '₹', tip: 'Opening balance + sales - expenses - handovers' },
        ] as const).map((c, i) => (
          <div key={i} title={c.tip} style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: '12px 14px', position: 'relative', overflow: 'hidden', cursor: 'default' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${c.color}cc, ${c.color}33)` }} />
            <p style={{ fontSize: 8, color: T.tx3, letterSpacing: 0.8, marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' }}>{c.label}</p>
            <p style={{ fontFamily: T.sora, fontSize: 20, fontWeight: 700, color: c.color, margin: 0 }}>{c.prefix}{c.value.toLocaleString('en-IN')}</p>
          </div>
        ))}
      </div>

      {/* Row 2: Alerts — clickable, deep-link to filtered views */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
        <div role="button" tabIndex={0} onClick={() => navigateTo?.('challan')} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') navigateTo?.('challan'); }} style={{ background: alerts.overdue.length > 0 ? 'rgba(239,68,68,.06)' : 'rgba(255,255,255,0.02)', border: `1px solid ${alerts.overdue.length > 0 ? 'rgba(239,68,68,.15)' : T.bd}`, borderRadius: 10, padding: '10px 12px', cursor: navigateTo ? 'pointer' : 'default', transition: T.transition }} onMouseEnter={e => navigateTo && (e.currentTarget.style.borderColor = 'rgba(239,68,68,.35)')} onMouseLeave={e => (e.currentTarget.style.borderColor = alerts.overdue.length > 0 ? 'rgba(239,68,68,.15)' : T.bd)}>
          <p style={{ fontSize: 9, color: alerts.overdue.length > 0 ? T.re : T.tx3, letterSpacing: 0.8, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Overdue Payments</p>
          <p style={{ fontSize: 18, fontWeight: 700, fontFamily: T.sora, color: alerts.overdue.length > 0 ? T.re : T.tx3, margin: 0 }}>{alerts.overdue.length}</p>
          {alerts.overdue.slice(0, 2).map((o, i) => <p key={i} style={{ fontSize: 10, color: T.tx3, margin: '3px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.name}: ₹{o.amount.toLocaleString('en-IN')} ({o.days}d)</p>)}
        </div>
        <div role="button" tabIndex={0} onClick={() => navigateTo?.('inventory')} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') navigateTo?.('inventory'); }} style={{ background: alerts.dryClean.length > 0 ? 'rgba(6,182,212,.06)' : 'rgba(255,255,255,0.02)', border: `1px solid ${alerts.dryClean.length > 0 ? 'rgba(6,182,212,.15)' : T.bd}`, borderRadius: 10, padding: '10px 12px', cursor: navigateTo ? 'pointer' : 'default', transition: T.transition }} onMouseEnter={e => navigateTo && (e.currentTarget.style.borderColor = 'rgba(6,182,212,.35)')} onMouseLeave={e => (e.currentTarget.style.borderColor = alerts.dryClean.length > 0 ? 'rgba(6,182,212,.15)' : T.bd)}>
          <p style={{ fontSize: 9, color: '#06b6d4', letterSpacing: 0.8, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>In Dry Clean</p>
          <p style={{ fontSize: 18, fontWeight: 700, fontFamily: T.sora, color: '#06b6d4', margin: 0 }}>{alerts.dryClean.length}</p>
          {alerts.dryClean.length > 0 && <p style={{ fontSize: 10, color: T.tx3, margin: '3px 0 0' }}>Avg {Math.round(alerts.dryClean.reduce((s, d) => s + d.days, 0) / alerts.dryClean.length)} days</p>}
        </div>
        <div role="button" tabIndex={0} onClick={() => navigateTo?.('challan')} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') navigateTo?.('challan'); }} style={{ background: alerts.pendingHandovers > 0 ? 'rgba(245,158,11,.06)' : 'rgba(255,255,255,0.02)', border: `1px solid ${alerts.pendingHandovers > 0 ? 'rgba(245,158,11,.15)' : T.bd}`, borderRadius: 10, padding: '10px 12px', cursor: navigateTo ? 'pointer' : 'default', transition: T.transition }} onMouseEnter={e => navigateTo && (e.currentTarget.style.borderColor = 'rgba(245,158,11,.35)')} onMouseLeave={e => (e.currentTarget.style.borderColor = alerts.pendingHandovers > 0 ? 'rgba(245,158,11,.15)' : T.bd)}>
          <p style={{ fontSize: 9, color: T.yl, letterSpacing: 0.8, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Pending Handovers</p>
          <p style={{ fontSize: 18, fontWeight: 700, fontFamily: T.sora, color: alerts.pendingHandovers > 0 ? T.yl : T.tx3, margin: 0 }}>{alerts.pendingHandovers}</p>
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
        {/* Revenue Trend 30d */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: '12px 14px' }}>
          <p style={{ fontSize: 8, color: T.tx3, letterSpacing: 0.8, fontWeight: 600, textTransform: 'uppercase', marginBottom: 8 }}>Revenue — Last 30 Days</p>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 60 }}>
            {revTrend.map((r, i) => (
              <div key={i} style={{ flex: 1, background: r.amount >= 0 ? `${T.gr}88` : `${T.re}88`, borderRadius: 2, height: Math.max(2, (Math.abs(r.amount) / maxRev) * 50) }} title={`${r.date}: ₹${r.amount}`} />
            ))}
          </div>
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
        {/* Top 5 Customers Outstanding */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: '12px 14px' }}>
          <p style={{ fontSize: 8, color: T.tx3, letterSpacing: 0.8, fontWeight: 600, textTransform: 'uppercase', marginBottom: 8 }}>Top Outstanding</p>
          {topCustomers.length === 0 && <p style={{ fontSize: 10, color: T.tx3 }}>No outstanding dues</p>}
          {topCustomers.map((c, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: `1px solid ${T.bd}` }}>
              <span style={{ fontSize: 10, color: T.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{c.name}</span>
              <span style={{ fontSize: 10, fontFamily: T.mono, color: T.re, fontWeight: 600, flexShrink: 0 }}>₹{c.outstanding.toLocaleString('en-IN')}</span>
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
    </div>
  );
}
