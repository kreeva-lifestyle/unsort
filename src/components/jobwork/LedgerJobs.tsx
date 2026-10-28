// Jobs tab of a jobworker's statement: one card per job, open jobs first,
// in the owner's unit of thought — five piece counts in a fixed order
// (Given · OK · Rejected · Rework · Pending) and, for money viewers, the
// bill spelled out as "108 × ₹92 = ₹9,936 billed · ₹0 paid · ₹9,936 due".
// Tapping a card opens the job.
import { T } from '../../lib/theme';
import { StateDot } from './JobHeader';
import { workState, payState, shortDate, inr, qty, per } from './jobworkModel';
import type { LedgerJob } from './jobworkLedger';
import type { JobworkSummary } from '../../types/database';

export default function LedgerJobs({ jobs, boss, onOpen }: { jobs: LedgerJob[]; boss: boolean; onOpen: (orderId: string) => void }) {
  if (!jobs.length) return <div style={{ padding: 30, textAlign: 'center', fontSize: 12, color: T.tx3 }}>No jobs yet.</div>;
  const count = (label: string, v: number, color: string = T.tx) => (
    <div style={{ minWidth: 52 }}>
      <div style={{ fontFamily: T.mono, fontSize: 15, fontWeight: 700, color }}>{qty(v)}</div>
      <div style={{ fontSize: 9, color: T.tx3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
    </div>
  );
  return (
    <div>
      {jobs.map(j => {
        const s = { status: j.status as JobworkSummary['status'], expected_date: j.expected_date, pcs_remaining: j.pending, pcs_ok: j.ok, pcs_rejected: j.rejected, out_count: j.out_count, bill: j.bill, paid: j.paid, due: j.due };
        const ws = workState(s), ps = payState(s);
        const unit = j.unit === 'm' ? 'm' : 'pcs';
        return (
          <button key={j.id} type="button" onClick={() => onOpen(j.id)} className="jw-row"
            style={{ display: 'block', width: '100%', textAlign: 'left', background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: T.rLg, padding: '12px 14px', marginBottom: 8, cursor: 'pointer', color: T.tx, font: 'inherit', opacity: j.status === 'open' ? 1 : 0.75 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: T.mono, fontSize: 14, fontWeight: 700 }}>{j.sku}</span>
              <span style={{ fontFamily: T.mono, fontSize: 10, color: T.tx3 }}>JW #{j.jw}</span>
              <span style={{ fontSize: 12, color: T.tx2 }}>{j.job_type}{j.component ? ` · ${j.component.toUpperCase()}` : ''}</span>
              <span style={{ marginLeft: 'auto' }}><StateDot label={ws.label} t={ws.tone} /></span>
            </div>
            <div style={{ fontSize: 11, color: T.tx3, marginTop: 2 }}>Given {j.job_date ? shortDate(j.job_date) : '—'}{j.expected_date && j.status === 'open' ? ` · due back ${shortDate(j.expected_date)}` : ''}{j.last_entry_date ? ` · last movement ${shortDate(j.last_entry_date)}` : ''}</div>
            <div style={{ display: 'flex', gap: 14, marginTop: 10, flexWrap: 'wrap' }}>
              {count(`Given ${unit}`, j.pieces)}{count('OK', j.ok, T.gr)}{count('Rejected', j.rejected, j.rejected ? T.re : T.tx3)}{count('Rework', j.rework, j.rework ? T.yl : T.tx3)}{count('Pending', j.pending, j.pending ? T.yl : T.tx3)}
            </div>
            {boss && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 8, borderTop: `1px solid ${T.bd}`, fontSize: 12, color: T.tx2, flexWrap: 'wrap' }}>
                {j.ok > 0 || j.paid > 0 ? <>
                  <span><span style={{ fontFamily: T.mono }}>{qty(j.ok)} × {inr(j.rate)}/{per(j.unit)} = <b style={{ color: T.tx }}>{inr(j.bill)}</b></span> billed</span>
                  <span>· <span style={{ fontFamily: T.mono, color: T.gr }}>{inr(j.paid)}</span> paid</span>
                  <span>· {j.due > 0.005 ? <><span style={{ fontFamily: T.mono, color: T.yl }}>{inr(j.due)}</span> due</> : j.due < -0.005 ? <><span style={{ fontFamily: T.mono, color: T.bl }}>{inr(-j.due)}</span> advance</> : <span style={{ color: T.gr }}>settled</span>}</span>
                </> : <span style={{ color: T.tx3 }}>Nothing received yet · rate <span style={{ fontFamily: T.mono }}>{inr(j.rate)}/{per(j.unit)}</span></span>}
                <span style={{ marginLeft: 'auto' }}><StateDot label={ps.label} t={ps.tone} /></span>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
