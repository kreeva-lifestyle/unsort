// Jobwork → Received on: what came back on one date, across every job and
// jobworker (owner's ask: "check what was received on a particular date").
// Grouped by jobworker with day totals; pieces and meters are summed apart.
// A row opens its job. Arrows step a day; the date field jumps anywhere.
import { useEffect, useState } from 'react';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import DateInput from '../ui/DateInput';
import Empty from '../ui/Empty';
import { addDays } from '../purchaseorders/poDue';
import { today, fmtDate, mixedQty, qty } from './jobworkModel';
import { receivedOn, RECEIVED_CAP, type ReceivedRow } from './jobworkReceived';

const sum = (rows: ReceivedRow[], f: (r: ReceivedRow) => number, unit: 'pcs' | 'm') =>
  rows.filter(r => (r.job?.qty_unit === 'm' ? 'm' : 'pcs') === unit).reduce((a, r) => a + f(r), 0);
const totals = (rows: ReceivedRow[]) => {
  const ok = mixedQty(sum(rows, r => r.pcs_ok, 'pcs'), sum(rows, r => r.pcs_ok, 'm'));
  const rejPcs = sum(rows, r => r.pcs_rejected, 'pcs'), rejM = sum(rows, r => r.pcs_rejected, 'm');
  return `${ok} OK${rejPcs || rejM ? ` · ${mixedQty(rejPcs, rejM)} rejected` : ''}`;
};
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

export default function ReceivedByDate({ onBack, onOpen, addToast }: {
  onBack: () => void; onOpen: (orderId: string) => void; addToast: (m: string, t?: string) => void;
}) {
  const [date, setDate] = useState(today());
  const [data, setData] = useState<{ date: string; rows: ReceivedRow[]; names: Record<string, string> } | null>(null);
  useEffect(() => {
    let live = true;
    setData(null);
    receivedOn(date).then(r => {
      if (!live) return;
      if (r.error) addToast(friendlyError(r.error), 'error');
      setData({ date, rows: r.rows, names: r.names });
    });
    return () => { live = false; };
  }, [date, addToast]);

  const isToday = date >= today();
  const step = (d: number) => setDate(x => addDays(x, d));
  const groups = new Map<string, ReceivedRow[]>();
  for (const r of data?.rows ?? []) { const v = r.job?.vendor_name ?? '—'; groups.set(v, [...(groups.get(v) ?? []), r]); }
  const arrow: React.CSSProperties = { ...S.btnGhost, minHeight: 44, minWidth: 44, padding: '8px 12px', fontSize: 16, lineHeight: 1 };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <button type="button" onClick={onBack} style={{ ...S.btnGhost, minHeight: 36 }}>‹ All jobs</button>
        <span style={{ fontSize: 12, color: T.tx3 }}>What came back from jobworkers on one date</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => step(-1)} aria-label="Previous day" style={arrow}>‹</button>
        <DateInput value={date} max={today()} onChange={e => { if (e.target.value) setDate(e.target.value); }} aria-label="Received on" style={{ width: 170 }} />
        <button type="button" onClick={() => step(1)} disabled={isToday} aria-label="Next day" style={{ ...arrow, opacity: isToday ? 0.3 : 1, pointerEvents: isToday ? 'none' : 'auto' }}>›</button>
        {!isToday && <button type="button" onClick={() => setDate(today())} style={{ ...S.btnGhost, minHeight: 44 }}>Today</button>}
      </div>

      {!data ? <div style={{ padding: 40, textAlign: 'center', fontSize: 12, color: T.tx3 }}>Loading…</div>
        : data.rows.length === 0 ? <Empty icon="receipt" title={`Nothing received on ${fmtDate(data.date)}`} message="Pick another date, or step a day with the arrows." />
        : (<>
          <div style={{ background: T.glass1, border: `1px solid ${T.bd}`, borderRadius: T.rLg, padding: '12px 16px', marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: T.tx3, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>{fmtDate(data.date)}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.tx, marginTop: 4 }}>{totals(data.rows)}</div>
            <div style={{ fontSize: 11, color: T.tx3, marginTop: 2 }}>{data.rows.length} receipt{data.rows.length === 1 ? '' : 's'} from {groups.size} jobworker{groups.size === 1 ? '' : 's'}{data.rows.length >= RECEIVED_CAP ? ` · first ${RECEIVED_CAP} shown` : ''}</div>
          </div>
          {[...groups.entries()].map(([vendor, rows]) => (
            <div key={vendor} style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: T.rLg, marginBottom: 10, overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '10px 14px', borderBottom: `1px solid ${T.bd}`, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: T.tx }}>{vendor}</span>
                <span style={{ fontSize: 11, color: T.tx3 }}>{totals(rows)}</span>
              </div>
              {rows.map(r => {
                const unit = r.job?.qty_unit === 'm' ? 'm' : 'pcs';
                return (
                  <button key={r.id} type="button" onClick={() => onOpen(r.order_id)}
                    style={{ display: 'flex', width: '100%', gap: 12, alignItems: 'flex-start', padding: '10px 14px', minHeight: 44, background: 'none', border: 'none', borderBottom: `1px solid ${T.bd}`, cursor: 'pointer', textAlign: 'left', color: T.tx, font: 'inherit' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12 }}>
                        <span style={{ fontFamily: T.mono, color: T.ac2, fontWeight: 600 }}>JW #{r.job?.jw_number ?? '—'}</span>
                        <span style={{ fontFamily: T.mono, marginLeft: 8 }}>{r.job?.sku}</span>
                        <span style={{ color: T.tx3 }}> · {r.job?.job_type}{r.job?.component ? ` · ${r.job.component}` : ''}</span>
                      </div>
                      {r.lines.length > 0 && <div style={{ fontSize: 11, color: T.tx2, marginTop: 3 }}>Material back: {r.lines.map(l => `${l.name} ${qty(l.qty)} ${l.unit}`.trim()).join(', ')}</div>}
                      {r.note && <div style={{ fontSize: 11, color: T.tx2, marginTop: 3 }}>{r.note}</div>}
                      <div style={{ fontSize: 10, color: T.tx3, marginTop: 3 }}>Entered by {(r.created_by && data.names[r.created_by]) || 'someone'} at {timeOf(r.created_at)}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, fontFamily: T.mono, color: T.gr }}>{qty(r.pcs_ok)} {unit}</div>
                      {r.pcs_rejected > 0 && <div style={{ fontSize: 11, fontFamily: T.mono, color: T.re }}>{qty(r.pcs_rejected)} rejected</div>}
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </>)}
    </div>
  );
}
