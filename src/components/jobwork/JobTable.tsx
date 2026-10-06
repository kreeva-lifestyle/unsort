// Desktop list of jobs: one row per job with the SKU photo, what and with
// whom, progress, dates, status and (admin/manager) the balance. Phones use
// JobCard instead (index.css swaps .jw-table / .jw-cards at 768px).
import { T, S } from '../../lib/theme';
import type { JobworkSummary } from '../../types/database';
import SkuThumb from '../ui/SkuThumb';
import { StateDot } from './JobHeader';
import { workState, payState, shortDate, inr, isOverdue, n, qty, qu } from './jobworkModel';

export default function JobTable({ rows, showMoney, onOpen }: { rows: JobworkSummary[]; showMoney: boolean; onOpen: (id: string) => void }) {
  const th = (label: string, align: 'left' | 'right' = 'left', w?: number) => <th style={{ ...S.thStyle, textAlign: align, width: w, whiteSpace: 'nowrap' }}>{label}</th>;
  const td: React.CSSProperties = { ...S.tdStyle, padding: '10px 14px', verticalAlign: 'middle', borderTop: `1px solid ${T.bd}` };
  return (
    <div className="jw-table" style={{ borderRadius: 10, border: `1px solid ${T.bd}`, background: 'rgba(255,255,255,0.01)', overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 880 }}>
        <thead><tr>
          {th('', 'left', 64)}{th('Job')}{th('Jobworker')}{th('Progress', 'left', 220)}{th('Given · due back')}{th('Status')}{showMoney && th('Balance', 'right')}
        </tr></thead>
        <tbody>
          {rows.map(j => {
            const ws = workState(j), ps = payState(j);
            const back = j.pcs_ok + j.pcs_rejected - j.pcs_rework;
            const pct = Math.min(100, Math.round((Math.max(0, back) / j.pieces) * 100));
            return (
              <tr key={j.id} className="jw-row" onClick={() => onOpen(j.id)} style={{ cursor: 'pointer' }}>
                <td style={{ ...td, paddingRight: 0 }}><SkuThumb sku={j.sku} size={44} radius={8} /></td>
                <td style={td}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 700, color: T.tx }}>{j.sku}</span>
                    <span style={{ fontFamily: T.mono, fontSize: 10, color: T.tx3 }}>JW #{j.jw_number}</span>
                  </div>
                  <div style={{ fontSize: 11, color: T.tx3, marginTop: 2 }}>{j.job_type}{j.component ? ` · ${j.component.toUpperCase()}` : ''}</div>
                </td>
                <td style={td}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>{j.vendor_name}</div>
                  {j.vendor_phone && <div style={{ fontSize: 11, color: T.tx3, marginTop: 2, fontFamily: T.mono }}>{j.vendor_phone}</div>}
                </td>
                <td style={td}>
                  <div style={{ height: 4, borderRadius: 4, background: T.s3, overflow: 'hidden' }}><div style={{ width: `${pct}%`, height: '100%', background: T.gr }} /></div>
                  <div style={{ fontSize: 11, color: T.tx3, marginTop: 6 }}>
                    <b style={{ color: T.tx2 }}>{qty(j.pcs_ok)}</b>/{qu(j.pieces, j.qty_unit)} OK{j.pcs_remaining ? <> · <b style={{ color: T.yl }}>{qty(j.pcs_remaining)}</b> pending</> : ''}
                  </div>
                </td>
                <td style={{ ...td, fontSize: 12, whiteSpace: 'nowrap' }}>
                  <span style={{ color: T.tx2 }}>{shortDate(j.job_date)}</span>
                  <span style={{ color: T.tx3 }}> · </span>
                  <span style={{ color: isOverdue(j) ? T.re : T.tx3 }}>{j.expected_date ? shortDate(j.expected_date) : '—'}</span>
                </td>
                <td style={td}><StateDot label={ws.label} t={ws.tone} /></td>
                {showMoney && (
                  <td style={{ ...td, textAlign: 'right' }}>
                    <div style={{ fontFamily: T.mono, fontSize: 13, color: n(j.due) > 0 ? T.tx : T.tx3 }}>{inr(j.due)}</div>
                    <div style={{ marginTop: 3, display: 'flex', justifyContent: 'flex-end' }}><StateDot label={ps.label} t={ps.tone} /></div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
