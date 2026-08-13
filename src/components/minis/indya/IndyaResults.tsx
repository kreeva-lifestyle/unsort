// Indya Import results: filters, the two honesty notices (ignored Unstitched
// rows, and designs Indya lists twice), and the preview table. Split out of
// IndyaImport for the file budget.
import { useMemo, useState } from 'react';
import { T, S } from '../../../lib/theme';
import { designKey, normSize, type Filled } from './indyaMatch';

export interface IndyaStats { size: number; design: number; none: number; ignored: number; inStock: number; shared: number }
type Tab = 'all' | 'size' | 'design' | 'none' | 'instock' | 'ignored';

export default function IndyaResults({ result, stats, zeroIgnored, onZeroIgnored }: {
  result: Filled[];
  stats: IndyaStats;
  zeroIgnored: boolean;
  onZeroIgnored: (v: boolean) => void;
}) {
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return result.filter(r => {
      if (tab === 'instock' ? !(r.newStock > 0) : tab !== 'all' && r.match !== tab) return false;
      if (!q) return true;
      return r.sku.toLowerCase().includes(q) || r.vendorSku.toLowerCase().includes(q);
    }).slice(0, 300);
  }, [result, tab, search]);

  const pill = (on: boolean): React.CSSProperties => ({ ...S.btnGhost, ...S.btnSm, minHeight: 30, border: `1px solid ${on ? 'oklch(0.55 0.22 265 / .5)' : T.bd2}`, background: on ? T.ac3 : 'transparent', color: on ? T.ac2 : T.tx3, fontWeight: on ? 700 : 500 });

  return (
    <>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        {([['all', `All ${result.length}`], ['size', `Matched ${stats.size}`], ['design', `Design-level ${stats.design}`], ['none', `Not found ${stats.none}`], ['instock', `In stock ${stats.inStock}`], ['ignored', `Unstitched ${stats.ignored}`]] as [Tab, string][])
          .filter(([k]) => (k !== 'design' || stats.design > 0) && (k !== 'ignored' || stats.ignored > 0))
          .map(([k, label]) => <button key={k} onClick={() => setTab(k)} style={pill(tab === k)}>{label}</button>)}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search SKU or VendorSKU…" style={{ ...S.fInput, flex: 1, minWidth: 160, marginLeft: 'auto' }} />
      </div>

      {stats.ignored > 0 && (
        <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, padding: '8px 11px', fontSize: 10.5, color: T.tx2, marginBottom: 8, lineHeight: 1.5 }}>
          <b>{stats.ignored} Unstitched rows ignored.</b> They are left out of the export, so Indya keeps whatever stock it already has for them.
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={zeroIgnored} onChange={e => onZeroIgnored(e.target.checked)} />
            <span>Include them with stock 0 instead <b style={{ color: T.yl }}>(sets every Unstitched listing out of stock)</b></span>
          </label>
        </div>
      )}

      {stats.shared > 0 && (
        <div style={{ background: 'oklch(0.78 0.18 75 / .07)', border: '1px solid oklch(0.78 0.18 75 / .2)', borderRadius: 8, padding: '8px 11px', fontSize: 10.5, color: T.tx2, marginBottom: 8, lineHeight: 1.5 }}>
          {stats.shared} rows share a design+size with another row — Indya lists the same design more than once (e.g. TF-343 and TF-343-XL). Each gets the same figure, which is one physical stock counted once per listing.
        </div>
      )}

      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', borderRadius: 10, border: `1px solid ${T.bd}`, background: 'rgba(255,255,255,0.01)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
          <thead><tr>{['Indya SKU', 'VendorSKU', 'Size', 'Compared as', 'Stock'].map(h => <th key={h} style={S.thStyle}>{h}</th>)}</tr></thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={r.sku + r.vendorSku + r.size + i}>
                <td style={{ ...S.tdStyle, fontFamily: T.mono, fontSize: 11 }}>{r.sku || '—'}</td>
                <td style={{ ...S.tdStyle, fontFamily: T.mono, fontSize: 11, color: T.tx }}>{r.vendorSku}</td>
                <td style={{ ...S.tdStyle, fontSize: 11 }}>{r.size}</td>
                <td style={{ ...S.tdStyle, fontSize: 10, color: T.tx3, fontFamily: T.mono }}>
                  {designKey(r.vendorSku)}-{normSize(r.size)}
                  {r.match === 'none' && <span style={{ color: T.re, marginLeft: 6 }}>not found</span>}
                  {r.match === 'ignored' && <span style={{ color: T.tx3, marginLeft: 6 }}>ignored</span>}
                  {r.match === 'design' && <span style={{ color: T.yl, marginLeft: 6 }}>design-level</span>}
                </td>
                <td style={{ ...S.tdStyle, fontFamily: T.mono, fontWeight: 700, color: r.newStock > 0 ? T.gr : T.tx3 }}>{r.newStock}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {shown.length === 0 && <div style={{ padding: 24, textAlign: 'center', fontSize: 11, color: T.tx3 }}>Nothing matches this filter.</div>}
      {result.length > shown.length && <div style={{ fontSize: 10, color: T.tx3, marginTop: 6 }}>Showing the first {shown.length} of {result.length} rows — the export contains every row.</div>}
    </>
  );
}
