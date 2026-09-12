// Results table for Indya Import with the house pagination (Prev · n / N ·
// Next, per-page 10/25/50/100). 25k rows must never render at once.
import { T, S, alpha } from '../../../lib/theme';
import type { ResultRow, Flag } from './indyaCompute';

export const flagColor = (f: Flag) => f === 'oos' ? T.re : f === 'blocked' ? '#F97316' : f === 'unknown' ? T.re : f === 'size_missing' ? T.tx3 : f === 'last' ? T.yl : T.gr;
export const flagLabel = (f: Flag) => f === 'oos' ? 'Out of stock' : f === 'blocked' ? 'Blocked' : f === 'unknown' ? 'Unknown code' : f === 'size_missing' ? 'Size not stocked' : f === 'last' ? 'Last qty' : 'Updated';

export default function IndyaTable({ rows, page, perPage, onPage, onPerPage }: {
  rows: ResultRow[];
  page: number;
  perPage: number;
  onPage: (p: number) => void;
  onPerPage: (n: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(rows.length / perPage));
  const cur = Math.min(page, pages - 1);
  const slice = rows.slice(cur * perPage, cur * perPage + perPage);
  return (
    <>
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', borderRadius: 8, border: `1px solid ${T.bd}` }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
          <thead><tr>
            <th style={S.thStyle}>Indya SKU</th><th style={S.thStyle}>Vendor SKU → looked up as</th><th style={S.thStyle}>Size</th><th style={{ ...S.thStyle, textAlign: 'right' }}>New stock</th><th style={S.thStyle}>Status</th>
          </tr></thead>
          <tbody>
            {slice.map(r => (
              <tr key={r.i} style={{ borderTop: `1px solid ${T.bd}` }}>
                <td style={{ ...S.tdStyle, fontFamily: T.mono, fontWeight: 600, whiteSpace: 'nowrap' }}>{r.sku}</td>
                <td style={{ ...S.tdStyle, fontSize: 12 }}>
                  <div style={{ fontFamily: T.mono, color: T.tx }}>{r.vendorSku}</div>
                  <div style={{ fontSize: 10, color: T.tx3, fontFamily: T.mono, marginTop: 2, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span>→ {r.hitKey ?? r.key}</span>
                    {r.stripped && <span style={{ padding: '1px 6px', borderRadius: 4, background: alpha(T.yl, 0.12), color: T.yl, fontSize: 9, fontWeight: 700 }}>stripped</span>}
                    {r.viaShape && <span style={{ padding: '1px 6px', borderRadius: 4, background: alpha(T.bl, 0.12), color: T.bl, fontSize: 9, fontWeight: 700 }}>loose match</span>}
                    {r.siblings > 1 && <span style={{ padding: '1px 6px', borderRadius: 4, background: T.ac3, color: T.ac2, fontSize: 9, fontWeight: 700 }}>×{r.siblings} shared</span>}
                  </div>
                </td>
                <td style={{ ...S.tdStyle, fontFamily: T.mono, whiteSpace: 'nowrap', color: r.unstitched ? T.tx3 : T.tx2 }}>{r.size}</td>
                <td style={{ ...S.tdStyle, textAlign: 'right', fontFamily: T.mono, fontWeight: 700, color: flagColor(r.flag), whiteSpace: 'nowrap' }}>{r.out}{r.oldStock !== r.out && <div style={{ fontSize: 9, color: T.tx3, fontWeight: 400 }}>was {r.oldStock}</div>}</td>
                <td style={S.tdStyle}><span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 600, color: flagColor(r.flag), background: alpha(flagColor(r.flag), 0.09), whiteSpace: 'nowrap' }}>{flagLabel(r.flag)}</span></td>
              </tr>
            ))}
            {slice.length === 0 && <tr><td colSpan={5} style={{ ...S.tdStyle, textAlign: 'center', color: T.tx3 }}>Nothing matches this filter.</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => onPage(Math.max(0, cur - 1))} disabled={cur === 0} style={{ ...S.btnGhost, ...S.btnSm, opacity: cur === 0 ? 0.3 : 1 }}>Prev</button>
        <span style={{ fontSize: 10, color: T.tx3, fontFamily: T.mono }}>{cur + 1} / {pages}</span>
        <button type="button" onClick={() => onPage(Math.min(pages - 1, cur + 1))} disabled={cur >= pages - 1} style={{ ...S.btnGhost, ...S.btnSm, opacity: cur >= pages - 1 ? 0.3 : 1 }}>Next</button>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: T.tx3 }}>{rows.length.toLocaleString('en-IN')} rows</span>
        <select value={perPage} onChange={e => onPerPage(Number(e.target.value))} aria-label="Rows per page" style={{ ...S.fInput, padding: '4px 8px', fontSize: 11, height: 28, borderRadius: 6, width: 'auto' }}>
          {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
    </>
  );
}
