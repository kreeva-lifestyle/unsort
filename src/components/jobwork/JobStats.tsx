// The Jobwork summary: four stat tiles (open jobs by state, what is still
// out and how much of it is back, overdue, money owed) and two panels — who
// holds the most, and when it is due back. One read of the summary view
// (jobworkStats.ts does the sums). A tile filters the list below; a
// jobworker's bar shows exactly that jobworker's jobs. The last numbers stay
// on screen while a refresh is in flight, so nothing jumps.
import { useEffect, useState } from 'react';
import { T } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { supabase } from '../../lib/supabase';
import type { JobFilter } from './jobworkApi';
import { inr, qu, qty, mixedQty } from './jobworkModel';
import { statsOf, STAT_COLS, STATE_LABELS, OTHERS, type JobStatsData, type StatRow, type StateKey } from './jobworkStats';
import { Meter, StackBar, BarList, Columns } from '../ui/Charts';
import { StatTile, TileLabel, TileHint, TileBig, TileSub, tileCard } from '../ui/StatTile';

const STATE_COLORS: Record<StateKey, string> = { notSent: T.tx3, with: T.bl, part: T.yl, overdue: T.re, done: T.gr };
const STATE_ORDER: StateKey[] = ['notSent', 'with', 'part', 'overdue', 'done'];

export default function JobStats({ boss, version, active, onPick, onVendor, addToast }: {
  boss: boolean;
  /** Bumped by the list after every change so the numbers follow. */
  version: number;
  active: JobFilter;
  onPick: (f: JobFilter) => void;
  /** A jobworker's bar was tapped: show exactly that jobworker's open jobs. */
  onVendor: (vendor: string) => void;
  addToast: (m: string, t?: string) => void;
}) {
  const [s, setS] = useState<JobStatsData | null>(null);
  useEffect(() => {
    let live = true;
    // Newest first, so if the cap is ever hit it is the oldest (long settled) jobs that drop.
    supabase.from('jobwork_order_summary').select(STAT_COLS).neq('status', 'cancelled').order('created_at', { ascending: false }).limit(5000)
      .then(({ data, error }) => {
        if (!live) return;
        if (error) { addToast(friendlyError(error), 'error'); return; }
        setS(statsOf((data ?? []) as unknown as StatRow[]));
      });
    return () => { live = false; };
  }, [version, addToast]);
  const ready = !!s;

  // Pieces jobs that were handed over: what came back (OK or rejected) of what went.
  const back = s ? s.orderedPcs - s.pending : 0;
  const rejHeld = s ? Math.max(0, back - s.okPcs) : 0;
  const pctBack = s && s.orderedPcs > 0 ? Math.round((back / s.orderedPcs) * 100) : 0;
  const metersOnly = !!s && s.pending === 0 && s.pendingM > 0;
  const backLine = !s ? '' : s.orderedPcs > 0
    ? `${qty(back)} of ${qty(s.orderedPcs)} pcs back (${pctBack}%) · ${qty(s.okPcs)} OK${rejHeld ? `, ${qty(rejHeld)} rejected` : ''}`
    : s.pendingM > 0 ? `${qu(s.pendingM, 'm')} out, all of it in meters` : 'nothing out right now';
  // Of what is billed, how much is covered by payments; advances sit outside the bill.
  const settled = s ? s.billed - s.due : 0;
  const jobs = (k: number) => `${k} job${k === 1 ? '' : 's'}`;
  const payLine = !s ? '' : s.billed > 0 || s.paid > 0
    ? `${inr(s.paid)} paid against ${inr(s.billed)} billed · ${jobs(s.dueJobs)} with a balance${s.advance > 0 ? ` · ${inr(s.advance)} advance on ${jobs(s.advanceJobs)}` : ''}`
    : 'nothing billed yet';
  const stateParts = STATE_ORDER.map(k => ({ key: k, label: STATE_LABELS[k], count: s?.states[k] ?? 0, color: STATE_COLORS[k] }));
  const dueCols = s ? [
    { key: 'overdue', label: 'Overdue', value: s.dueBack.overdue, color: T.re },
    { key: 'today', label: 'Today', value: s.dueBack.today, color: T.ac2 },
    { key: 'week', label: 'Next 7 days', value: s.dueBack.week, color: T.ac2 },
    { key: 'later', label: 'Later', value: s.dueBack.later, color: T.ac2 },
    { key: 'none', label: 'No date', value: s.dueBack.none, color: T.ac2 },
  ] : [];
  // The bar is pieces only — meters cannot share its axis; they are printed.
  const vendorRows = (s?.byVendor ?? []).map(v => ({
    key: v.vendor, label: v.vendor, value: v.pending, valueText: mixedQty(v.pending, v.pendingM),
    sub: `${v.jobs} job${v.jobs === 1 ? '' : 's'}`, pick: v.vendor !== OTHERS,
  }));
  const tile = (f: JobFilter | null, body: React.ReactNode) => (
    <StatTile active={f !== null && active === f} onPick={f ? () => onPick(f) : undefined}>{body}</StatTile>
  );

  return (<>
    <div className="jw-stats" style={{ display: 'grid', gridTemplateColumns: `repeat(${boss ? 4 : 3}, minmax(0, 1fr))`, gap: 10, marginBottom: 10 }}>
      {tile('open', <>
        <TileLabel>Open jobs</TileLabel>
        <TileBig ready={ready} value={String(s?.open ?? 0)} color={T.tx} />
        <StackBar parts={stateParts} />
      </>)}
      {tile(null, <>
        <TileLabel>Still with jobworkers</TileLabel>
        {/* Pieces lead; a workload that is only meters leads with the meters instead of a "0". */}
        <TileBig ready={ready} value={metersOnly ? qu(s!.pendingM, 'm') : String(s?.pending ?? 0)} color={(s?.pending || s?.pendingM) ? T.yl : T.tx3}
          tail={metersOnly ? undefined : s?.pendingM ? `pcs + ${qu(s.pendingM, 'm')}` : 'pcs'} />
        <Meter value={back} max={s?.orderedPcs ?? 0} color={T.gr} title={backLine} />
        <TileSub ready={ready} text={backLine} />
      </>)}
      {tile('overdue', <>
        <TileLabel>Overdue</TileLabel>
        <TileBig ready={ready} value={String(s?.overdue ?? 0)} color={(s?.overdue ?? 0) > 0 ? T.re : T.tx3} />
        <Meter value={s?.overdue ?? 0} max={s?.open ?? 0} color={T.re} title={s ? `${s.overdue} of ${s.open} open jobs past their due date` : ''} />
        <TileSub ready={ready} text={s && s.overdue > 0 ? `${s.oldestLateDays === 1 ? '1 day' : `${s.oldestLateDays} days`} late at most · ${s.open ? Math.round((s.overdue / s.open) * 100) : 0}% of open jobs` : 'nothing past its due date'} />
      </>)}
      {boss && tile('unpaid', <>
        <TileLabel>To pay</TileLabel>
        <TileBig ready={ready} value={inr(s?.due ?? 0)} color={(s?.due ?? 0) > 0 ? T.yl : T.tx3} />
        <Meter value={settled} max={s?.billed ?? 0} color={T.ac2} title={s ? `${inr(settled)} of ${inr(s.billed)} billed settled` : ''} />
        <TileSub ready={ready} text={payLine} />
      </>)}
    </div>
    <div className="jw-viz" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)', gap: 10, marginBottom: 14, alignItems: 'start' }}>
      <div style={tileCard}>
        <TileLabel>Where the stock is</TileLabel>
        <TileHint>Handed over and not yet back, by jobworker. Bars show pieces; tap a name for that jobworker's open jobs</TileHint>
        {!s ? <div style={{ fontSize: 11, color: T.tx3 }}>Loading…</div>
          : vendorRows.length === 0 ? <div style={{ fontSize: 11, color: T.tx3, padding: '8px 0' }}>Nothing is with a jobworker right now.</div>
          : <BarList rows={vendorRows} color={T.ac2} onPick={onVendor} />}
      </div>
      <div style={tileCard}>
        <TileLabel>Due back</TileLabel>
        <TileHint gap={10}>Open jobs with work pending, by due date</TileHint>
        {!s ? <div style={{ fontSize: 11, color: T.tx3 }}>Loading…</div> : <Columns cols={dueCols} />}
      </div>
    </div>
  </>);
}
