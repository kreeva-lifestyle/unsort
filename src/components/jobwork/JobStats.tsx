// The Jobwork summary: four stat tiles (open jobs by state, how much is
// still out and how much is back, overdue, money owed) and two panels —
// who holds the most, and when it is due back. One read of the summary
// view (jobworkStats.ts does the sums); a tile, chip, bar or column taps
// through to the list below. The last numbers stay on screen while a
// refresh is in flight, so nothing jumps.
import { useEffect, useState } from 'react';
import { T } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { supabase } from '../../lib/supabase';
import type { JobFilter } from './jobworkApi';
import { inr, qu, qty, mixedQty } from './jobworkModel';
import { statsOf, STAT_COLS, STATE_LABELS, type JobStatsData, type StatRow, type StateKey } from './jobworkStats';
import { Meter, StackBar, BarList, Columns } from './JobCharts';

const STATE_COLORS: Record<StateKey, string> = { notSent: T.tx3, with: T.bl, part: T.yl, overdue: T.re, done: T.gr };
const STATE_ORDER: StateKey[] = ['notSent', 'with', 'part', 'overdue', 'done'];

export default function JobStats({ boss, version, active, onPick, onSearch, addToast }: {
  boss: boolean;
  /** Bumped by the list after every change so the numbers follow. */
  version: number;
  active: JobFilter;
  onPick: (f: JobFilter) => void;
  /** A jobworker's bar was tapped: show that jobworker's jobs. */
  onSearch: (text: string) => void;
  addToast: (m: string, t?: string) => void;
}) {
  const [s, setS] = useState<JobStatsData | null>(null);
  useEffect(() => {
    let live = true;
    supabase.from('jobwork_order_summary').select(STAT_COLS).neq('status', 'cancelled').limit(5000)
      .then(({ data, error }) => {
        if (!live) return;
        if (error) { addToast(friendlyError(error), 'error'); return; }
        setS(statsOf((data ?? []) as unknown as StatRow[]));
      });
    return () => { live = false; };
  }, [version, addToast]);

  const card: React.CSSProperties = { background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: T.rLg, padding: '12px 14px', minWidth: 0, fontFamily: T.sans };
  const label = (s: string) => <div style={{ fontSize: 10, fontWeight: 600, color: T.tx3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{s}</div>;
  const big = (v: string, color: string, tail?: string) => (
    <div style={{ fontFamily: T.sora, fontSize: 24, fontWeight: 800, color, margin: '4px 0 8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.1 }}>
      {s ? v : '—'}{s && tail && <span style={{ fontSize: 12, fontWeight: 600, color: T.tx3, marginLeft: 6 }}>{tail}</span>}
    </div>
  );
  const sub = (t: string) => <div style={{ fontSize: 11, color: T.tx3, marginTop: 6 }}>{s ? t : ' '}</div>;
  const tile = (f: JobFilter | null, body: React.ReactNode) => {
    const on = f !== null && active === f;
    return (
      <div role={f ? 'button' : undefined} tabIndex={f ? 0 : undefined} aria-pressed={f ? on : undefined}
        onClick={f ? () => onPick(f) : undefined} onKeyDown={f ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(f); } } : undefined}
        style={{ ...card, cursor: f ? 'pointer' : 'default', background: on ? T.ac3 : card.background, borderColor: on ? T.ac22 : T.bd }}>
        {body}
      </div>
    );
  };

  const pctBack = s && s.orderedPcs > 0 ? Math.round((s.okPcs / s.orderedPcs) * 100) : 0;
  const stateParts = STATE_ORDER.map(k => ({ key: k, label: STATE_LABELS[k], count: s?.states[k] ?? 0, color: STATE_COLORS[k] }));
  const dueCols = s ? [
    { key: 'overdue', label: 'Overdue', value: s.dueBack.overdue, color: T.re },
    { key: 'today', label: 'Today', value: s.dueBack.today, color: T.ac2 },
    { key: 'week', label: 'This week', value: s.dueBack.week, color: T.ac2 },
    { key: 'later', label: 'Later', value: s.dueBack.later, color: T.ac2 },
    { key: 'none', label: 'No date', value: s.dueBack.none, color: T.ac2 },
  ] : [];
  const vendorRows = (s?.byVendor ?? []).map(v => ({
    key: v.vendor, label: v.vendor, value: v.pending + (v.pending === 0 ? v.pendingM : 0),
    valueText: mixedQty(v.pending, v.pendingM), sub: `${v.jobs} job${v.jobs === 1 ? '' : 's'}`,
  }));

  return (<>
    <div className="jw-stats" style={{ display: 'grid', gridTemplateColumns: `repeat(${boss ? 4 : 3}, minmax(0, 1fr))`, gap: 10, marginBottom: 10 }}>
      {tile('open', <>
        {label('Open jobs')}{big(String(s?.open ?? 0), T.tx)}
        <StackBar parts={stateParts} onPick={k => onPick(k === 'overdue' ? 'overdue' : 'open')} />
      </>)}
      {tile(null, <>
        {label('Still with jobworkers')}{big(String(s?.pending ?? 0), (s?.pending || s?.pendingM) ? T.yl : T.tx3, s?.pendingM ? `pcs + ${qu(s.pendingM, 'm')}` : 'pcs')}
        <Meter value={s?.okPcs ?? 0} max={s?.orderedPcs ?? 0} color={T.gr} title={s ? `${qty(s.okPcs)} of ${qty(s.orderedPcs)} pcs received OK` : ''} />
        {sub(s && s.orderedPcs > 0 ? `${pctBack}% back — ${qty(s.okPcs)} of ${qty(s.orderedPcs)} pcs received OK` : 'nothing out in pieces')}
      </>)}
      {tile('overdue', <>
        {label('Overdue')}{big(String(s?.overdue ?? 0), (s?.overdue ?? 0) > 0 ? T.re : T.tx3)}
        <Meter value={s?.overdue ?? 0} max={s?.open ?? 0} color={T.re} title={s ? `${s.overdue} of ${s.open} open jobs past their due date` : ''} />
        {sub(s && s.overdue > 0 ? `${s.oldestLateDays === 1 ? '1 day' : `${s.oldestLateDays} days`} late at most · ${s.open ? Math.round((s.overdue / s.open) * 100) : 0}% of open jobs` : 'nothing past its due date')}
      </>)}
      {boss && tile('unpaid', <>
        {label('To pay')}{big(inr(s?.due ?? 0), (s?.due ?? 0) > 0 ? T.yl : T.tx3)}
        <Meter value={s?.paid ?? 0} max={s?.billed ?? 0} color={T.ac2} title={s ? `${inr(s.paid)} paid of ${inr(s.billed)} billed` : ''} />
        {sub(s && s.billed > 0 ? `${inr(s.paid)} paid of ${inr(s.billed)} billed · ${s.dueJobs} job${s.dueJobs === 1 ? '' : 's'} with a balance` : 'nothing billed yet')}
      </>)}
    </div>
    <div className="jw-viz" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)', gap: 10, marginBottom: 14, alignItems: 'start' }}>
      <div style={card}>
        {label('Where the stock is')}
        <div style={{ fontSize: 11, color: T.tx3, margin: '2px 0 10px' }}>Pending with each jobworker — tap a name to see those jobs</div>
        {!s ? <div style={{ fontSize: 11, color: T.tx3 }}>Loading…</div>
          : vendorRows.length === 0 ? <div style={{ fontSize: 11, color: T.tx3, padding: '8px 0' }}>Nothing is with a jobworker right now.</div>
          : <BarList rows={vendorRows} color={T.ac2} onPick={v => { if (!v.endsWith(' others')) onSearch(v); }} />}
      </div>
      <div style={card}>
        {label('Due back')}
        <div style={{ fontSize: 11, color: T.tx3, margin: '2px 0 10px' }}>Open jobs with something pending, by due date</div>
        {!s ? <div style={{ fontSize: 11, color: T.tx3 }}>Loading…</div>
          : <Columns cols={dueCols} onPick={k => onPick(k === 'overdue' ? 'overdue' : 'open')} />}
      </div>
    </div>
  </>);
}
