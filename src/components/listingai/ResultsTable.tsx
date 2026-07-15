// Results grid + export for Listing AI. One row per SKU with status and a
// title-ish preview; the full sheet goes out via Export in template order.
import { useState } from 'react';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { GenRow, GenUsage } from './api';
import { exportFilledXlsx } from './exportFilled';
import type { ListingTemplate } from '../../types/database';

const fmtK = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

export default function ResultsTable({ headers, kinds, rows, usage, template, addToast }: {
  headers: string[];
  kinds: string[];
  rows: GenRow[];
  usage: GenUsage | null;
  template: Pick<ListingTemplate, 'id' | 'name' | 'file_name' | 'sheet_name' | 'header_row'>;
  addToast: (m: string, t?: string) => void;
}) {
  const [exporting, setExporting] = useState(false);
  let previewIdx = headers.findIndex((h, ix) => kinds[ix] === 'ai' && /title|product\s*name/i.test(h));
  if (previewIdx < 0) previewIdx = kinds.findIndex(k => k === 'ai');
  const ok = rows.filter(r => r.status === 'ok');

  const exportSheet = async () => {
    if (exporting) return;
    if (ok.length === 0) { addToast('Nothing to export — no SKU generated successfully', 'error'); return; }
    setExporting(true);
    try {
      await exportFilledXlsx(headers, ok, template);
      const skipped = rows.length - ok.length;
      const into = template.file_name ? ` into ${template.file_name}` : '';
      addToast(`Exported ${ok.length}${into}${skipped ? ` — ${skipped} SKU(s) skipped (see status)` : ''}`, 'success');
    } catch (e) { addToast(friendlyError(e), 'error'); }
    setExporting(false);
  };

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: T.tx, fontFamily: T.sora }}>Results</div>
        <button onClick={exportSheet} disabled={exporting} style={{ ...S.btnGhost, ...S.btnSm, color: T.gr, border: '1px solid rgba(34,197,94,.2)', background: 'rgba(34,197,94,.06)', pointerEvents: exporting ? 'none' : 'auto', opacity: exporting ? 0.5 : 1 }}>{exporting ? 'Exporting…' : `Export ${ok.length} to Excel`}</button>
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
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: r.status === 'ok' ? '#22C55E' : r.status === 'bad_link' ? '#EF4444' : '#F59E0B', flexShrink: 0 }} />
                    <span style={{ fontSize: 11 }}>{r.status === 'ok' ? (r.noImage ? 'Ready (no photo found)' : 'Ready') : r.status === 'bad_link' ? 'Dropbox link failed' : 'Not in master sheet'}</span>
                    {r.status === 'ok' && r.linkSource && (
                      <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 8, fontWeight: 600, background: 'rgba(99,102,241,.1)', color: T.ac2, whiteSpace: 'nowrap' }}>
                        {{ typed: 'direct link', folders: 'image folder', master: 'master link', search: 'auto-found' }[r.linkSource]}
                      </span>
                    )}
                  </span>
                  {r.note && <div style={{ fontSize: 9, color: T.tx3, marginTop: 3 }}>{r.note}</div>}
                </td>
                {previewIdx >= 0 && <td style={{ ...S.tdStyle, fontSize: 12, maxWidth: 380 }}>{r.values[previewIdx] || '—'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {usage && (
        <div style={{ fontSize: 10, color: T.tx3, marginTop: 8, fontFamily: T.mono }}>
          {(() => {
            const free = kinds.filter(k => k === 'fixed' || k === 'image' || k === 'direct' || k === 'brand').length;
            const ai = kinds.filter(k => k === 'ai').length;
            const blank = kinds.filter(k => k === 'blank').length;
            return `${free} column(s) filled free (fixed / master / photos) · ${ai} written by AI${blank ? ` · ${blank} left empty` : ''}`;
          })()}
          <br />
          Tokens: {fmtK(usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens)} in
          ({fmtK(usage.cache_read_input_tokens)} from cache) + {fmtK(usage.output_tokens)} out · price fields left blank
        </div>
      )}
    </div>
  );
}
