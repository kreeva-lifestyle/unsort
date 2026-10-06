// The four numbers at the top of Jobwork: open jobs, what is still with
// jobworkers (pieces and meters kept apart), overdue jobs, and what is owed
// (admin/manager). Read in one
// query from the summary view; a tile filters the list below.
import { useEffect, useState } from 'react';
import { T } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { supabase } from '../../lib/supabase';
import type { JobFilter } from './jobworkApi';
import { today, inr, n, qu } from './jobworkModel';

interface Totals { open: number; pending: number; pendingM: number; overdue: number; due: number; dueJobs: number }

export default function JobStats({ boss, version, active, onPick, addToast }: {
  boss: boolean;
  /** Bumped by the list after every change so the numbers follow. */
  version: number;
  active: JobFilter;
  onPick: (f: JobFilter) => void;
  addToast: (m: string, t?: string) => void;
}) {
  const [t, setT] = useState<Totals | null>(null);
  useEffect(() => {
    let live = true;
    supabase.from('jobwork_order_summary').select('status, pcs_remaining, qty_unit, expected_date, due').neq('status', 'cancelled').limit(5000)
      .then(({ data, error }) => {
        if (!live) return;
        if (error) { addToast(friendlyError(error), 'error'); return; }
        const d = today(), acc: Totals = { open: 0, pending: 0, pendingM: 0, overdue: 0, due: 0, dueJobs: 0 };
        for (const r of (data ?? []) as { status: string; pcs_remaining: number; qty_unit: string; expected_date: string | null; due: number }[]) {
          if (n(r.due) > 0) { acc.due += n(r.due); acc.dueJobs += 1; }
          if (r.status !== 'open') continue;
          acc.open += 1;
          if (r.qty_unit === 'm') acc.pendingM += n(r.pcs_remaining); else acc.pending += n(r.pcs_remaining);
          if (r.expected_date && r.expected_date < d && r.pcs_remaining > 0) acc.overdue += 1;
        }
        setT(acc);
      });
    return () => { live = false; };
  }, [version, addToast]);

  const tile = (f: JobFilter | null, label: string, value: string, sub: string, color: string) => (
    <button type="button" onClick={() => f && onPick(f)} aria-pressed={f !== null && active === f}
      style={{ textAlign: 'left', background: f !== null && active === f ? T.ac3 : 'rgba(255,255,255,0.02)', border: `1px solid ${f !== null && active === f ? T.ac22 : T.bd}`, borderRadius: T.rLg, padding: '12px 14px', cursor: f ? 'pointer' : 'default', minWidth: 0, fontFamily: T.sans }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: T.tx3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ fontFamily: T.sora, fontSize: 22, fontWeight: 800, color, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t ? value : '—'}</div>
      <div style={{ fontSize: 11, color: T.tx3, marginTop: 2 }}>{t ? sub : ' '}</div>
    </button>
  );
  return (
    <div className="jw-stats" style={{ display: 'grid', gridTemplateColumns: `repeat(${boss ? 4 : 3}, minmax(0, 1fr))`, gap: 10, marginBottom: 14 }}>
      {tile('open', 'Open jobs', String(t?.open ?? 0), 'with jobworkers now', T.tx)}
      {tile(null, 'Pieces pending', String(t?.pending ?? 0), t?.pendingM ? `+ ${qu(t.pendingM, 'm')} · still to come back` : 'still to come back', (t?.pending || t?.pendingM) ? T.yl : T.tx3)}
      {tile('overdue', 'Overdue', String(t?.overdue ?? 0), (t?.overdue ?? 0) === 1 ? 'job past its due date' : 'jobs past their due date', (t?.overdue ?? 0) > 0 ? T.re : T.tx3)}
      {boss && tile('unpaid', 'To pay', inr(t?.due ?? 0), `${t?.dueJobs ?? 0} job${t?.dueJobs === 1 ? '' : 's'} with a balance`, (t?.due ?? 0) > 0 ? T.yl : T.tx3)}
    </div>
  );
}
