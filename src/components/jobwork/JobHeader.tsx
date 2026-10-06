// Top of a job: photo (the SKU's Dropbox thumbnail, else its costing sheet's), identity, the piece
// counts with a progress bar, and the money line (rate · bill · paid · due).
import { T } from '../../lib/theme';
import type { JobworkSummary } from '../../types/database';
import { thumbUrl } from '../minis/costing/costingThumbs';
import SkuThumb from '../ui/SkuThumb';
import { workState, payState, isOverdue, fmtDate, inr, n } from './jobworkModel';

const tone = (t: string) => (({ gr: T.gr, yl: T.yl, re: T.re, bl: T.bl, tx3: T.tx3 }) as Record<string, string>)[t] ?? T.tx3;
export const StateDot = ({ label, t }: { label: string; t: string }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: tone(t), whiteSpace: 'nowrap' }}>
    <span style={{ width: 8, height: 8, borderRadius: 999, background: tone(t) }} />{label}
  </span>
);

export default function JobHeader({ job, photo }: { job: JobworkSummary; photo: string | null }) {
  const ws = workState(job), ps = payState(job);
  const done = job.pcs_ok + job.pcs_rejected - job.pcs_rework;
  const pct = Math.min(100, Math.round((Math.max(0, done) / job.pieces) * 100));
  const tile = (label: string, value: number, color: string = T.tx) => (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: T.rLg, padding: '10px 12px', minWidth: 0 }}>
      <div style={{ fontSize: 9, fontWeight: 600, color: T.tx3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ fontFamily: T.sora, fontSize: 20, fontWeight: 800, color, marginTop: 2 }}>{value}</div>
    </div>
  );
  return (
    <div>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 12 }}>
        <SkuThumb sku={job.sku} size={72} radius={12} fallback={photo ? thumbUrl(photo) || photo : null} full={photo} zoom />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: T.mono, fontSize: 18, fontWeight: 700, color: T.tx }}>{job.sku}</span>
            <span style={{ fontSize: 11, color: T.tx3, fontFamily: T.mono }}>JW #{job.jw_number}</span>
          </div>
          <div style={{ fontSize: 13, color: T.tx2, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {job.job_type}{job.component ? ` · ${job.component.toUpperCase()}` : ''} · <b style={{ color: T.tx }}>{job.vendor_name}</b>
            {job.vendor_phone && <> · <a href={`tel:${job.vendor_phone}`} style={{ color: T.ac2, textDecoration: 'none' }}>{job.vendor_phone}</a></>}
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 6, alignItems: 'center' }}>
            <StateDot label={ws.label} t={ws.tone} /><StateDot label={ps.label} t={ps.tone} />
            <span style={{ fontSize: 11, color: isOverdue(job) ? T.re : T.tx3 }}>Given {fmtDate(job.job_date)}{job.expected_date ? ` · due back ${fmtDate(job.expected_date)}` : ''}</span>
          </div>
        </div>
      </div>
      <div className="jw-tiles" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
        {tile('Ordered', job.pieces)}
        {tile('Received OK', job.pcs_ok, T.gr)}
        {tile('Rejected', job.pcs_rejected - job.pcs_rework, job.pcs_rejected - job.pcs_rework > 0 ? T.re : T.tx3)}
        {tile('Remaining', job.pcs_remaining, job.pcs_remaining > 0 ? T.yl : T.tx3)}
      </div>
      <div style={{ height: 4, borderRadius: 4, background: T.s3, margin: '10px 0 12px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg, ${T.ac}, ${T.gr})` }} />
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 11, color: T.tx3 }}>
        <span>Rate <b style={{ fontFamily: T.mono, color: T.tx2 }}>{inr(job.rate)}/pc</b></span>
        <span>Bill <b style={{ fontFamily: T.mono, color: T.tx2 }}>{inr(job.bill)}</b></span>
        <span>Paid <b style={{ fontFamily: T.mono, color: T.tx2 }}>{inr(job.paid)}</b></span>
        <span>Due <b style={{ fontFamily: T.mono, color: n(job.due) > 0 ? T.yl : T.gr }}>{inr(job.due)}</b></span>
      </div>
    </div>
  );
}
