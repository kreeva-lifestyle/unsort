// One job in the list: the SKU's photo (Dropbox thumbnail), SKU · JW #, what
// and with whom, how far along, and where the money stands.
import { T } from '../../../lib/theme';
import type { JobworkSummary } from '../../../types/database';
import { StateDot } from './JobHeader';
import SkuThumb from '../../ui/SkuThumb';
import { workState, payState, shortDate, inr, isOverdue, n } from './jobworkModel';

export default function JobCard({ job, showMoney, onOpen }: { job: JobworkSummary; showMoney: boolean; onOpen: () => void }) {
  const ws = workState(job), ps = payState(job);
  const back = job.pcs_ok + job.pcs_rejected - job.pcs_rework;
  const pct = Math.min(100, Math.round((Math.max(0, back) / job.pieces) * 100));
  return (
    <div role="button" onClick={onOpen} className="jw-card"
      style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: T.rLg, padding: '12px 14px', cursor: 'pointer', marginBottom: 8, transition: 'border-color .15s, background .15s' }}>
      <SkuThumb sku={job.sku} size={56} />
      <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
        <span style={{ fontFamily: T.mono, fontSize: 14, fontWeight: 700, color: T.tx }}>{job.sku}</span>
        <span style={{ fontFamily: T.mono, fontSize: 10, color: T.tx3 }}>JW #{job.jw_number}</span>
        <span style={{ marginLeft: 'auto' }}><StateDot label={ws.label} t={ws.tone} /></span>
      </div>
      <div style={{ fontSize: 12, color: T.tx2, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {job.job_type}{job.component ? ` · ${job.component.toUpperCase()}` : ''} · <b style={{ color: T.tx, fontWeight: 600 }}>{job.vendor_name}</b>
      </div>
      <div style={{ height: 3, borderRadius: 3, background: T.s3, margin: '8px 0 6px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: T.gr }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 11, color: T.tx3 }}>
        <span><b style={{ color: T.tx2 }}>{job.pcs_ok}</b>/{job.pieces} OK{job.pcs_remaining ? <> · <b style={{ color: T.yl }}>{job.pcs_remaining}</b> pending</> : ''}</span>
        {job.expected_date && job.status === 'open' && job.pcs_remaining > 0 && <span style={{ color: isOverdue(job) ? T.re : T.tx3 }}>due {shortDate(job.expected_date)}</span>}
        {showMoney && <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 8, alignItems: 'center' }}>
          {n(job.due) > 0 && <span style={{ fontFamily: T.mono, color: T.tx2 }}>{inr(job.due)}</span>}<StateDot label={ps.label} t={ps.tone} />
        </span>}
      </div>
      </div>
    </div>
  );
}
