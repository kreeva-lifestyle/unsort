// A guide table: on desktop a real table inside a hairline frame (header
// 11px uppercase tx2, cells 13px, tileBd row lines); on phone there is no
// table (layout §7) — each row becomes a small stacked block of
// "Heading — value" pairs, so nothing scrolls sideways.
import { PB, pbLabel } from '../../pbTheme';
import { Rich, guideText } from './GuideRich';

const frame = { border: `1px solid ${PB.tileBd}`, borderRadius: PB.r.input, marginBottom: 16, overflow: 'hidden' } as const;

export default function GuideTable({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <>
      <div className="pb-desk-only" style={{ ...frame, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>{head.map(c => <th key={c} scope="col" style={{ ...pbLabel, marginBottom: 0, display: 'table-cell', textAlign: 'left', padding: '12px 16px', borderBottom: `1px solid ${PB.tileBd}` }}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="pb-rowhover">
                {r.map((c, j) => (
                  <td key={j} style={{ padding: '12px 16px', fontSize: 13, lineHeight: 1.55, color: j === 0 ? PB.tx : PB.tx2, verticalAlign: 'top', borderTop: i ? `1px solid ${PB.tileBd}` : 'none', overflowWrap: 'break-word' }}>
                    <Rich text={c} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pb-phone-only" role="list" style={frame}>
        {rows.map((r, i) => (
          <div key={i} role="listitem" style={{ padding: '12px 16px', borderTop: i ? `1px solid ${PB.tileBd}` : 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {r.map((c, j) => (
              <div key={j} style={{ ...guideText, margin: 0, color: j === 0 ? PB.tx : PB.tx2, fontWeight: j === 0 ? 600 : 400 }}>
                {j > 0 && <span style={{ ...pbLabel, display: 'block', margin: '4px 0 0' }}>{head[j]}</span>}
                <Rich text={c} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
