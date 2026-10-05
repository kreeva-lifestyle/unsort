// Material balance for one job, one row per material: the headline is what
// the jobworker should still hold; under it sent · returned · used by the
// pieces received OK (when usage/pc is known). A negative hold means more
// was used than planned — shown in red as "over".
import { T } from '../../../lib/theme';
import { qty, unitShort, type MaterialBalance } from './jobworkModel';

export default function JobBalance({ rows }: { rows: MaterialBalance[] }) {
  if (!rows.length) return <div style={{ fontSize: 11, color: T.tx3, padding: '6px 0' }}>No material listed on this job — edit it to add what you give the jobworker.</div>;
  return (
    <div>
      {rows.map((b, i) => {
        const u = unitShort(b.m.unit);
        const over = b.used != null && b.held < -1e-9;
        const stat = (label: string, v: string) => <span style={{ whiteSpace: 'nowrap' }}>{label} <b style={{ fontFamily: T.mono, fontWeight: 600, color: T.tx2 }}>{v}</b></span>;
        return (
          <div key={b.m.id} style={{ padding: '10px 0', borderTop: i ? `1px solid ${T.bd}` : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: b.m.removed ? T.tx3 : T.tx, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {b.m.name}{b.m.per_piece != null && <span style={{ fontWeight: 400, color: T.tx3, fontSize: 11 }}> · {qty(b.m.per_piece)} {u}/pc</span>}
              </span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: T.tx3, whiteSpace: 'nowrap' }}>
                {over ? 'used over plan' : 'with them'}{' '}
                <b style={{ fontFamily: T.mono, fontSize: 14, color: over ? T.re : b.held > 1e-9 ? T.yl : T.gr }}>{qty(Math.abs(b.held))} {u}</b>
              </span>
            </div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11, color: T.tx3, marginTop: 4 }}>
              {stat('Sent', `${qty(b.sent)} ${u}`)}{stat('Returned', `${qty(b.returned)} ${u}`)}
              {stat('Used', b.used == null ? '—' : `${qty(b.used)} ${u}`)}
            </div>
          </div>
        );
      })}
      {rows.some(b => b.used == null) && <div style={{ fontSize: 10, color: T.tx3, marginTop: 6 }}>"—" = no usage per piece set, so "with them" includes what was already used.</div>}
    </div>
  );
}
