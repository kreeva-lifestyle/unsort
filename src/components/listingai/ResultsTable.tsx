// Results grid + export for Listing AI. One row per SKU with status and a
// title-ish preview; the full sheet goes out via Export in template order.
import { useState } from 'react';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { GenRow, GenUsage } from './api';
import { exportFilledXlsx } from './exportFilled';
import type { ListingTemplate } from '../../types/database';

const fmtK = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

export default function ResultsTable({ headers, kinds, rows, usage, cost, template, addToast }: {
  headers: string[];
  kinds: string[];
  rows: GenRow[];
  usage: GenUsage | null;
  cost: { usd: number; saved: number };
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
      const res = await exportFilledXlsx(headers, ok, template);
      const skipTail = rows.length - ok.length ? ` — ${rows.length - ok.length} SKU(s) skipped (see status)` : '';
      if (res.formatted) {
        const unmatched = res.total - res.matched;
        // Unmatched columns are a real, silent data loss on the marketplace
        // sheet — surface it as an error so it isn't uploaded unnoticed.
        addToast(unmatched
          ? `Exported ${ok.length} into ${template.file_name}, but ${unmatched} column(s) didn't match the template and were left out — re-upload the template if it changed.${skipTail}`
          : `Exported ${ok.length} into ${template.file_name}${skipTail}`, unmatched ? 'error' : 'success');
      } else if (res.hadTemplate) {
        addToast(`The template's columns no longer match this run — exported a plain data sheet instead. Re-upload the template to restore the formatted export.${skipTail}`, 'error');
      } else {
        addToast(`Exported ${ok.length} as a data sheet${skipTail}`, 'success');
      }
    } catch (e) { addToast(friendlyError(e), 'error'); }
    setExporting(false);
  };

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: T.tx, fontFamily: T.sora }}>Results</div>
        <button onClick={exportSheet} disabled={exporting} style={{ ...S.btnGhost, ...S.btnSm, color: T.gr, border: '1px solid oklch(0.72 0.19 145 / .2)', background: 'oklch(0.72 0.19 145 / .06)', pointerEvents: exporting ? 'none' : 'auto', opacity: exporting ? 0.5 : 1 }}>{exporting ? 'Exporting…' : `Export ${ok.length} to Excel`}</button>
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
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: r.status === 'ok' ? T.gr : r.status === 'bad_link' ? T.re : T.yl, flexShrink: 0 }} />
                    <span style={{ fontSize: 11 }}>{r.status === 'ok' ? (r.noImage ? 'Ready (no photo found)' : 'Ready') : r.status === 'bad_link' ? 'Dropbox link failed' : 'Not in master sheet'}</span>
                    {r.status === 'ok' && r.linkSource && (
                      <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 8, fontWeight: 600, background: 'oklch(0.55 0.22 265 / .1)', color: T.ac2, whiteSpace: 'nowrap' }}>
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
        <div style={{ fontSize: 11, color: T.tx2, marginTop: 8 }}>
          {(() => {
            const free = kinds.filter(k => k === 'fixed' || k === 'image' || k === 'direct' || k === 'brand' || k === 'wired').length;
            const blank = kinds.filter(k => k === 'blank').length;
            return <>
              AI cost this run: <b style={{ color: T.gr, fontFamily: T.mono }}>${cost.usd.toFixed(3)}</b>
              {cost.saved > 0 && <> · cache saved <span style={{ fontFamily: T.mono }}>${cost.saved.toFixed(3)}</span></>}
              {' '}· {free} column(s) filled free{blank ? ` · ${blank} left empty` : ''}
            </>;
          })()}
          <div style={{ fontSize: 10, color: T.tx3, marginTop: 3, fontFamily: T.mono }}>
            Tokens: {fmtK(usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens)} in
            ({fmtK(usage.cache_read_input_tokens)} from cache) + {fmtK(usage.output_tokens)} out
          </div>
        </div>
      )}
    </div>
  );
}
