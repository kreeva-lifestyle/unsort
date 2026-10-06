// Everything that happened on a job, oldest first: send-outs, receipts and
// payments, each dated. Admin/manager can delete a wrong entry (confirmed,
// audited server-side); the job's own guard refuses it once closed.
import { T } from '../../lib/theme';
import { timeline, linesText, shortDate, inr, PAY_MODE_LABELS, type JobDetail, type TimelineRow } from './jobworkModel';

export default function JobTimeline({ detail, canFix, onDelete }: {
  detail: JobDetail;
  canFix: boolean;
  onDelete: (row: TimelineRow) => void;
}) {
  const rows = timeline(detail);
  if (!rows.length) return <div style={{ fontSize: 11, color: T.tx3, padding: '6px 0' }}>Nothing sent or received yet — start with <b>Send out</b>.</div>;
  return (
    <div>
      {rows.map((r, i) => {
        const tone = r.kind === 'out' ? T.bl : r.kind === 'in' ? T.gr : T.ac2;
        let title = '', sub = '';
        if (r.kind === 'pay') {
          title = `Paid ${inr(r.pay.amount)}`;
          sub = [PAY_MODE_LABELS[r.pay.mode], r.pay.reference, r.pay.note].filter(Boolean).join(' · ');
        } else {
          const e = r.entry, mats = linesText(e.jobwork_entry_lines, detail.materials);
          if (r.kind === 'out') {
            title = e.pcs_rework ? `Sent back ${e.pcs_rework} pc${e.pcs_rework === 1 ? '' : 's'} for rework` : 'Sent out';
            sub = [mats, e.note].filter(Boolean).join(' · ');
          } else {
            const parts = [e.pcs_ok ? `${e.pcs_ok} OK` : '', e.pcs_rejected ? `${e.pcs_rejected} rejected` : ''].filter(Boolean);
            title = parts.length ? `Received ${parts.join(', ')}` : 'Material returned';
            sub = [mats && (parts.length ? `returned ${mats}` : mats), e.note].filter(Boolean).join(' · ');
          }
        }
        return (
          <div key={(r.kind === 'pay' ? r.pay.id : r.entry.id)} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 0', borderTop: i ? `1px solid ${T.bd}` : 'none' }}>
            <div style={{ width: 52, flexShrink: 0, fontSize: 11, color: T.tx3, fontFamily: T.mono, paddingTop: 1 }}>{shortDate(r.date)}</div>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: tone, flexShrink: 0, marginTop: 5 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>{title}</div>
              {sub && <div style={{ fontSize: 11, color: T.tx3, marginTop: 2, lineHeight: 1.5 }}>{sub}</div>}
            </div>
            {canFix && (r.kind === 'pay' || detail.job.status === 'open') && (
              <button type="button" onClick={() => onDelete(r)} aria-label="Delete entry" title="Delete this entry"
                style={{ background: 'none', border: 'none', color: T.tx3, fontSize: 16, width: 44, height: 36, cursor: 'pointer', flexShrink: 0 }}>&#215;</button>
            )}
          </div>
        );
      })}
    </div>
  );
}
