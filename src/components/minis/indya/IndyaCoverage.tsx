// Coverage Check for Indya — the Odette Coverage Check shape (button, counter
// tiles, search, table, export), computed in the browser from the imported
// master and the product catalog. Sits at the bottom of Indya Import.
import { useState, useMemo } from 'react';
import { T, S, alpha } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import { saveWorkbook } from '../../../lib/xlsxDownload';
import { exportName, fileDate } from '../../../lib/exportName';
import { useProductCatalog } from '../../../hooks/useProductCatalog';
import { coverageIndya, type Coverage, type MissingRow } from './indyaCoverage';
import type { MasterRow } from './indyaMaster';
import type { Corrections } from './indyaFiles';

type Filter = 'all' | 'whole' | 'sizes';
const badge = (color: string, text: string) => <span style={{ padding: '1px 6px', borderRadius: 4, background: alpha(color, 0.12), color, fontSize: 9, fontWeight: 700, whiteSpace: 'nowrap' }}>{text}</span>;

export default function IndyaCoverage({ master, corrections, addToast }: {
  master: MasterRow[] | null;
  corrections: Corrections | null;
  addToast: (msg: string, type?: string) => void;
}) {
  const { index, loading, error } = useProductCatalog();
  const [result, setResult] = useState<Coverage | null>(null);
  const [busy, setBusy] = useState('');
  const [filter, setFilterState] = useState<Filter>('all');
  const [search, setSearchState] = useState('');
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(25);
  const setFilter = (f: Filter) => { setFilterState(f); setPage(0); };
  const setSearch = (v: string) => { setSearchState(v); setPage(0); };

  const reconcile = () => {
    if (!master || !index || busy) return;
    setBusy('reconcile');
    setTimeout(() => {   // let "Checking…" paint first
      try {
        const r = coverageIndya(master, index.all, corrections);
        setResult(r); setFilter('all'); setSearch('');
        addToast(`${r.counts.missing.toLocaleString('en-IN')} size variant${r.counts.missing === 1 ? '' : 's'} not on Indya (of ${r.counts.active.toLocaleString('en-IN')} active) — ${r.counts.wholeProducts.toLocaleString('en-IN')} product${r.counts.wholeProducts === 1 ? '' : 's'} not on Indya at all`, 'success');
      } catch (err) { addToast(friendlyError(err), 'error'); }
      setBusy('');
    }, 30);
  };
  const filtered = useMemo(() => {
    if (!result) return [];
    const q = search.trim().toUpperCase();
    return result.rows.filter(r => (filter === 'all' || (filter === 'whole' ? r.whole : !r.whole)) &&
      (!q || r.expected.includes(q) || r.sku.toUpperCase().includes(q) || r.title.toUpperCase().includes(q) || r.catalog.toUpperCase().includes(q) || r.category.toUpperCase().includes(q)));
  }, [result, filter, search]);
  const exportXlsx = async () => {
    if (!filtered.length) { addToast('Nothing to export', 'error'); return; }
    if (busy) return;
    setBusy('export');
    try {
      const XLSX = await import('xlsx');
      const ws = XLSX.utils.json_to_sheet(filtered.map(r => ({ 'Expected Indya SKU': r.expected, 'Missing size': r.size, SKU: r.sku, Title: r.title, Catalog: r.catalog, Category: r.category, 'Indya has': r.indyaHas, 'Whole product missing': r.whole ? 'Yes' : '', 'Via SKU map': r.mapped ? 'Yes' : '' })));
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Missing from Indya');
      addToast(await saveWorkbook(wb, exportName('Indya-Missing', [fileDate()], 'xlsx')) ? `Exported ${filtered.length.toLocaleString('en-IN')} rows` : 'Nothing was saved', 'success');
    } catch (err) { addToast(friendlyError(err), 'error'); }
    setBusy('');
  };

  const c = result?.counts;
  const tiles: { key: Filter | null; label: string; count: number; color: string }[] = c ? [
    { key: null, label: 'Active variants', count: c.active, color: T.ac2 }, { key: null, label: 'On Indya', count: c.present, color: T.gr },
    { key: 'all', label: 'Not on Indya', count: c.missing, color: T.re }, { key: 'whole', label: 'Products not on Indya at all', count: c.wholeProducts, color: T.re },
    { key: 'sizes', label: 'Size gaps', count: c.missing - result!.rows.filter(r => r.whole).length, color: T.yl },
  ] : [];
  const pages = Math.max(1, Math.ceil(filtered.length / perPage)), cur = Math.min(page, pages - 1);
  const slice = filtered.slice(cur * perPage, cur * perPage + perPage);
  const disabled = !master || !index || !!busy;

  return (
    <div style={{ margin: '20px 0 0', paddingTop: 16, borderTop: `1px solid ${T.bd}` }}>
      <div style={{ fontSize: 13, fontWeight: 700, fontFamily: T.sora, color: T.tx, marginBottom: 2 }}>Coverage Check</div>
      <div style={{ fontSize: 11, color: T.tx3, marginBottom: 12 }}>Active products (SKU × size) from the master sheet that are not on Indya’s product master — the SKU map is applied first, so a misspelt listing still counts as uploaded. One row per missing size.</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="touch44" onClick={reconcile} style={{ ...S.btnPrimary, opacity: disabled ? 0.5 : 1, pointerEvents: disabled ? 'none' : 'auto' }}>{busy === 'reconcile' ? 'Checking…' : 'Reconcile vs Indya'}</button>
        {result && filtered.length > 0 && <button type="button" className="touch44" onClick={exportXlsx} style={{ ...S.btnGhost, color: T.bl, border: '1px solid oklch(0.77 0.14 230 / .2)', background: 'oklch(0.77 0.14 230 / .06)', opacity: busy ? 0.5 : 1, pointerEvents: busy ? 'none' : 'auto' }}>{busy === 'export' ? 'Exporting…' : `Export ${filtered.length.toLocaleString('en-IN')}`}</button>}
        {loading && <span style={{ fontSize: 11, color: T.tx3 }}>Loading the SKU list…</span>}
        {error && <span style={{ fontSize: 11, color: T.re }}>{friendlyError(error)}</span>}
        {index && <span style={{ padding: '3px 10px', borderRadius: 5, fontSize: 10, fontWeight: 500, background: 'rgba(255,255,255,.04)', color: T.tx2, border: `1px solid ${T.bd}` }}>Master sheet: {index.all.filter(p => p.is_active).length.toLocaleString('en-IN')} active</span>}
      </div>

      {!result && <div style={{ padding: 30, textAlign: 'center', color: T.tx3, fontSize: 12 }}>{master ? 'Tap “Reconcile vs Indya” to list the active products missing from the imported master.' : 'Import Indya’s product master first.'}</div>}
      {result && c && <>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {tiles.map(s => (
            <button type="button" key={s.label} onClick={() => s.key && setFilter(filter === s.key && s.key !== 'all' ? 'all' : s.key)} style={{ padding: '8px 14px', minHeight: 44, background: s.key && filter === s.key ? alpha(s.color, 0.07) : 'rgba(255,255,255,0.02)', border: `1px solid ${s.key && filter === s.key ? alpha(s.color, 0.27) : T.bd}`, borderRadius: 8, textAlign: 'center', cursor: s.key ? 'pointer' : 'default' }}>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: T.mono, color: s.color }}>{s.count.toLocaleString('en-IN')}</div>
              <div style={{ fontSize: 9, color: T.tx3, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</div>
            </button>
          ))}
        </div>
        {result.rows.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: T.gr, fontSize: 12 }}>Every active product and size is on Indya.</div> : <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 180, maxWidth: 320 }}>
              <svg viewBox="0 0 24 24" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, fill: 'none', stroke: T.tx3, strokeWidth: 1.8, opacity: 0.5 }}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search SKU, title, catalog…" style={{ ...S.fSearch, width: '100%' }} />
            </div>
            {filter !== 'all' && <button type="button" className="touch44" onClick={() => setFilter('all')} style={{ ...S.btnGhost, ...S.btnSm, color: T.tx3 }}>Clear filter</button>}
          </div>
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', borderRadius: 8, border: `1px solid ${T.bd}` }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
              <thead><tr><th style={S.thStyle}>Expected Indya SKU</th><th style={S.thStyle}>Missing size</th><th style={S.thStyle}>Product</th><th style={S.thStyle}>Catalog</th><th style={S.thStyle}>Indya has</th></tr></thead>
              <tbody>
                {slice.map((r: MissingRow) => (
                  <tr key={r.expected} style={{ borderTop: `1px solid ${T.bd}` }}>
                    <td style={{ ...S.tdStyle, fontFamily: T.mono, fontWeight: 600, whiteSpace: 'nowrap' }}>{r.expected}</td>
                    <td style={{ ...S.tdStyle, fontFamily: T.mono, whiteSpace: 'nowrap' }}>{r.size}</td>
                    <td style={{ ...S.tdStyle, fontSize: 12 }}><div style={{ fontFamily: T.mono, color: T.tx }}>{r.sku}</div>{r.title && <div style={{ fontSize: 10, color: T.tx3, marginTop: 2 }}>{r.title}</div>}</td>
                    <td style={{ ...S.tdStyle, fontSize: 12, whiteSpace: 'nowrap' }}>{r.catalog}{r.category && <div style={{ fontSize: 10, color: T.tx3 }}>{r.category}</div>}</td>
                    <td style={{ ...S.tdStyle, fontFamily: T.mono, fontSize: 11, whiteSpace: 'nowrap' }}>{r.whole ? badge(T.re, 'not on Indya') : <>{r.indyaHas} {r.mapped && badge(T.bl, 'via SKU map')}</>}</td>
                  </tr>
                ))}
                {slice.length === 0 && <tr><td colSpan={5} style={{ ...S.tdStyle, textAlign: 'center', color: T.tx3 }}>Nothing matches this filter.</td></tr>}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setPage(Math.max(0, cur - 1))} disabled={cur === 0} style={{ ...S.btnGhost, ...S.btnSm, opacity: cur === 0 ? 0.3 : 1 }}>Prev</button>
            <span style={{ fontSize: 10, color: T.tx3, fontFamily: T.mono }}>{cur + 1} / {pages}</span>
            <button type="button" onClick={() => setPage(Math.min(pages - 1, cur + 1))} disabled={cur >= pages - 1} style={{ ...S.btnGhost, ...S.btnSm, opacity: cur >= pages - 1 ? 0.3 : 1 }}>Next</button>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: T.tx3 }}>{filtered.length.toLocaleString('en-IN')} rows</span>
            <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(0); }} aria-label="Rows per page" style={{ ...S.fInput, padding: '4px 8px', fontSize: 11, height: 28, borderRadius: 6, width: 'auto' }}>
              {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </>}
      </>}
    </div>
  );
}
