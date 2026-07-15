// Results grid + export for Listing AI. One row per SKU with status and a
// title-ish preview; the full sheet goes out via Export in template order.
import { T, S } from '../../../lib/theme';
import { GenRow, GenUsage } from './api';
import { exportFilledXlsx } from './exportFilled';

const fmtK = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

export default function ResultsTable({ headers, kinds, rows, usage, templateName, addToast }: {
  headers: string[];
  kinds: string[];
  rows: GenRow[];
  usage: GenUsage | null;
  templateName: string;
  addToast: (m: string, t?: string) => void;
}) {
  let previewIdx = headers.findIndex((h, ix) => kinds[ix] === 'ai' && /title|product\s*name/i.test(h));
  if (previewIdx < 0) previewIdx = kinds.findIndex(k => k === 'ai');
  const ok = rows.filter(r => r.status === 'ok');

  const exportSheet = () => {
    if (ok.length === 0) { addToast('Nothing to export — no SKU generated successfully', 'error'); return; }
    exportFilledXlsx(headers, ok, templateName);
    if (ok.length < rows.length) addToast(`Exported ${ok.length} — ${rows.length - ok.length} SKU(s) skipped (not in master sheet)`, 'success');
    else addToast(`Exported ${ok.length} listing(s)`, 'success');
  };

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: T.tx, fontFamily: T.sora }}>Results</div>
        <button onClick={exportSheet} style={{ ...S.btnGhost, ...S.btnSm, color: T.gr, border: '1px solid rgba(34,197,94,.2)', background: 'rgba(34,197,94,.06)' }}>Export {ok.length} to Excel</button>
      </div>
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', borderRadius: 10, border: `1px solid ${T.bd}`, background: 'rgba(255,255,255,0.01)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420 }}>
          <thead><tr>
            <th style={S.thStyle}>SKU</th>
            <th style={S.thStyle}>Status</th>
            {previewIdx >= 0 && <th style={S.thStyle}>{headers[previewIdx]}</th>}
          </tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.sku}-${i}`}>
                <td style={{ ...S.tdStyle, fontFamily: T.mono, fontWeight: 600 }}>{r.sku}</td>
                <td style={S.tdStyle}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: r.status === 'ok' ? '#22C55E' : '#F59E0B', flexShrink: 0 }} />
                    <span style={{ fontSize: 11 }}>{r.status === 'ok' ? (r.noImage ? 'Ready (no photo found)' : 'Ready') : 'Not in master sheet'}</span>
                  </span>
                </td>
                {previewIdx >= 0 && <td style={{ ...S.tdStyle, fontSize: 12, maxWidth: 380 }}>{r.values[previewIdx] || '—'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {usage && (
        <div style={{ fontSize: 10, color: T.tx3, marginTop: 8, fontFamily: T.mono }}>
          Tokens: {fmtK(usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens)} in
          ({fmtK(usage.cache_read_input_tokens)} from cache) + {fmtK(usage.output_tokens)} out · price fields left blank
        </div>
      )}
    </div>
  );
}
