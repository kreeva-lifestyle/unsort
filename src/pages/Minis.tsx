import { useState, useRef, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { T, S } from '../lib/theme';
import { SUPABASE_ANON_KEY } from '../lib/supabase';
import { useNotifications } from '../hooks/useNotifications';
import { useBreadcrumb } from '../hooks/useBreadcrumb';
import AddressPrinter from '../components/minis/AddressPrinter';
import CbazaarImport from '../components/minis/CbazaarImport';
import OdetteImport from '../components/minis/OdetteImport';
import VirtualStock from '../components/minis/VirtualStock';
import Trackly from '../components/minis/Trackly';

const SIZE_MAP: Record<number, string> = { 32: 'XXS', 34: 'XS', 36: 'S', 38: 'M', 40: 'L', 42: 'XL', 44: 'XXL' };

interface UtsavRow { relid: string; vendorno: string; stock: number; leadtime: number; block: number; designno: string; size: number; catalogname: string; updateddate: string; aryaSku: string }

type MiniView = 'home' | 'utsav' | 'cbazaar' | 'odette' | 'address' | 'trackly';

export default function Minis() {
  const { addToast } = useNotifications();
  const [view, setViewState] = useState<MiniView>('home');
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<UtsavRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [virtualStock, setVirtualStock] = useState<Record<string, number>>({});
  const [comparing, setComparing] = useState(false);

  type CompareFilter = 'all' | 'na' | 'inactive' | 'not_uploaded' | 'vs_missing';
  interface CompareRow { sku: string; category: CompareFilter; cells?: string[] }
  const [compareHeaders, setCompareHeaders] = useState<string[]>([]);
  const [compareRows, setCompareRows] = useState<CompareRow[]>([]);
  const [compareFilter, setCompareFilter] = useState<CompareFilter>('all');
  const [compareSearch, setCompareSearch] = useState('');
  const [compareLimit, setCompareLimit] = useState(50);
  const compareComputed = compareRows.length > 0;

  const setView = useCallback((v: MiniView) => {
    setViewState(v);
    if (v !== 'home') window.history.pushState({ miniView: v }, '');
  }, []);

  const viewLabels: Record<MiniView, string | null> = { home: null, cbazaar: 'Cbazaar Import', odette: 'Odette Import', address: 'LabelMaker', utsav: 'Utsav Import', trackly: 'Trackly' };
  const { set: setBreadcrumb } = useBreadcrumb();
  useEffect(() => {
    setBreadcrumb(viewLabels[view] ? [viewLabels[view]!] : null);
    return () => setBreadcrumb(null);
  }, [view, setBreadcrumb]);

  useEffect(() => {
    const onPop = () => setViewState('home');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json<Record<string, any>>(ws);
        if (raw.length === 0) { addToast('File is empty', 'error'); return; }
        if (raw.length > 5000) { addToast('File too large — max 5,000 rows', 'error'); return; }
        const keys = Object.keys(raw[0]).map(k => k.toLowerCase());
        if (!keys.some(k => k.includes('designno') || k.includes('design'))) { addToast('Missing "designno" column — check file format', 'error'); return; }
        let unmappedSizes = 0;
        const parsed: UtsavRow[] = [];
        for (const r of raw) {
          const designno = String(r.designno || r.DESIGNNO || r.DesignNo || '').trim();
          const sizeNum = Number(r.size || r.SIZE || r.Size || 0);
          const sizeName = SIZE_MAP[sizeNum] || '';
          if (sizeNum > 0 && !sizeName) unmappedSizes++;
          const aryaSku = designno ? (sizeNum > 0 ? (sizeName ? `${designno}-${sizeName}` : `${designno}-${sizeNum}`) : designno) : '';
          parsed.push({ relid: String(r.relid || r.RELID || ''), vendorno: String(r.vendorno || r.VENDORNO || ''), stock: Number(r.stock || r.STOCK || 0), leadtime: Number(r.leadtime || r.LEADTIME || 0), block: Number(r.block || r.BLOCK || 0), designno, size: sizeNum, catalogname: String(r.catalogname || r.CATALOGNAME || ''), updateddate: String(r.updateddate || r.UPDATEDDATE || ''), aryaSku });
        }
        setRows(parsed);
        addToast(`${parsed.length} rows imported`, 'success');
        if (unmappedSizes > 0) addToast(`${unmappedSizes} rows have unmapped sizes — used raw number in SKU`, 'error');
      } catch { addToast('Failed to parse file — check format', 'error'); }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const exportXls = () => {
    if (rows.length === 0) return;
    const data = rows.map(r => ({ relid: r.relid, vendorno: r.vendorno, stock: r.stock, leadtime: r.leadtime, block: r.block, 'ARYA SKU': r.aryaSku }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Utsav Export');
    XLSX.writeFile(wb, `Utsav_Export_${new Date().toISOString().slice(0, 10)}.xls`);
  };

  const EDGE = 'https://ulphprdnswznfztawbvg.supabase.co/functions/v1/short-track';
  const compareNonUploaded = async () => {
    const skus = [...new Set(rows.map(r => r.aryaSku).filter(Boolean))];
    if (skus.length === 0) { addToast('No ARYA SKUs to compare', 'error'); return; }
    setComparing(true);
    try {
      const res = await fetch(EDGE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ action: 'compare', skus }),
      });
      const data = await res.json();
      if (!data.ok) { addToast(data.error || 'Compare failed', 'error'); return; }
      const headers: string[] = data.headers || [];
      const inactive: string[][] = data.inactive || [];
      const nonUploaded: string[][] = data.nonUploaded || [];
      const notFound: string[] = data.notFound || [];

      const vendorSet = new Set(skus.map(s => s.toUpperCase().replace(/[-\s.]/g, '')));
      const vsMissing: string[] = [];
      for (const [sku, qty] of Object.entries(virtualStock)) {
        if (qty > 0 && !vendorSet.has(sku.toUpperCase().replace(/[-\s.]/g, ''))) vsMissing.push(sku);
      }

      const all: CompareRow[] = [
        ...notFound.filter(Boolean).map(sku => ({ sku, category: 'na' as const })),
        ...inactive.filter(c => c.length > 0 && c[0]).map(cells => ({ sku: cells[0], category: 'inactive' as const, cells })),
        ...nonUploaded.filter(c => c.length > 0 && c[0]).map(cells => ({ sku: cells[0], category: 'not_uploaded' as const, cells })),
        ...vsMissing.map(sku => ({ sku, category: 'vs_missing' as const })),
      ];

      setCompareHeaders(headers);
      setCompareRows(all);
      setCompareFilter('all');
      setCompareSearch('');
      setCompareLimit(50);

      if (all.length === 0) addToast('All SKUs are Active and uploaded!', 'success');
      else {
        const parts: string[] = [];
        if (notFound.length > 0) parts.push(`${notFound.length} NA`);
        if (inactive.length > 0) parts.push(`${inactive.length} inactive`);
        if (nonUploaded.length > 0) parts.push(`${nonUploaded.length} not uploaded`);
        if (vsMissing.length > 0) parts.push(`${vsMissing.length} virtual stock missing`);
        addToast(parts.join(', '), 'success');
      }
    } catch { addToast('Network error — please try again', 'error'); }
    finally { setComparing(false); }
  };

  const compareFiltered = compareRows.filter(r => {
    if (compareFilter !== 'all' && r.category !== compareFilter) return false;
    if (compareSearch && !r.sku.toLowerCase().includes(compareSearch.toLowerCase())) return false;
    return true;
  });

  const exportCompareFilter = (cat: CompareFilter) => {
    const items = cat === 'all' ? compareRows : compareRows.filter(r => r.category === cat);
    if (items.length === 0) return;
    const today = new Date().toISOString().slice(0, 10);
    const hasFullData = items.some(r => r.cells);
    if (hasFullData && compareHeaders.length > 0) {
      const ws = XLSX.utils.aoa_to_sheet([compareHeaders, ...items.map(r => r.cells || [r.sku])]);
      const wb = XLSX.utils.book_new();
      const label = cat === 'inactive' ? 'Inactive' : cat === 'not_uploaded' ? 'Not Uploaded' : 'Export';
      XLSX.utils.book_append_sheet(wb, ws, label);
      XLSX.writeFile(wb, `Utsav_${label.replace(/\s/g, '')}_${today}.xlsx`);
    } else {
      const ws = XLSX.utils.aoa_to_sheet([['SKU'], ...items.map(r => [r.sku])]);
      const wb = XLSX.utils.book_new();
      const label = cat === 'na' ? 'NA' : cat === 'vs_missing' ? 'VirtualStockMissing' : 'Export';
      XLSX.utils.book_append_sheet(wb, ws, label);
      XLSX.writeFile(wb, `Utsav_${label}_${today}.xlsx`);
    }
  };

  const back = <span onClick={() => setViewState('home')} style={{ ...S.btnGhost, padding: '6px 10px', cursor: 'pointer' }}>
    <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const }}><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
  </span>;

  if (view === 'cbazaar') return (
    <div className="page-pad" style={{ padding: '14px 16px', animation: 'fi .15s ease' }}>
      <div style={{ marginBottom: 14 }}>{back}</div>
      <VirtualStock stock={virtualStock} setStock={setVirtualStock} addToast={addToast} />
      <CbazaarImport addToast={addToast} />
    </div>
  );

  if (view === 'odette') return (
    <div className="page-pad" style={{ padding: '14px 16px', animation: 'fi .15s ease' }}>
      <div style={{ marginBottom: 14 }}>{back}</div>
      <VirtualStock stock={virtualStock} setStock={setVirtualStock} addToast={addToast} />
      <OdetteImport addToast={addToast} virtualStock={virtualStock} />
    </div>
  );

  if (view === 'address') return (
    <div className="page-pad" style={{ padding: '14px 16px', animation: 'fi .15s ease' }}>
      <div style={{ marginBottom: 14 }}>{back}</div>
      <AddressPrinter addToast={addToast} />
    </div>
  );

  if (view === 'trackly') return (
    <div className="page-pad" style={{ padding: '14px 16px', animation: 'fi .15s ease' }}>
      <Trackly addToast={addToast} onBack={() => setViewState('home')} />
    </div>
  );

  if (view === 'utsav') return (
    <div className="page-pad" style={{ padding: '14px 16px', animation: 'fi .15s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        {back}
        <div style={{ display: 'flex', gap: 6 }}>
          <div onClick={() => fileRef.current?.click()} style={S.btnPrimary}>Import Excel</div>
          {rows.length > 0 && <div onClick={exportXls} style={{ ...S.btnGhost, color: T.gr, border: '1px solid rgba(34,197,94,.2)', background: 'rgba(34,197,94,.06)' }}>Export XLS</div>}
          {rows.length > 0 && <div onClick={!comparing ? compareNonUploaded : undefined} style={{ ...S.btnGhost, color: T.yl, border: '1px solid rgba(251,191,36,.2)', background: 'rgba(251,191,36,.06)', opacity: comparing ? 0.5 : 1, pointerEvents: comparing ? 'none' : 'auto' }}>{comparing ? 'Comparing…' : 'Compare Non-Uploaded'}</div>}
          {rows.length > 0 && <div onClick={() => { setRows([]); setFileName(''); setCompareRows([]); setCompareHeaders([]); setCompareFilter('all'); setCompareSearch(''); }} style={{ ...S.btnGhost, color: T.re, border: '1px solid rgba(239,68,68,.2)', background: 'rgba(239,68,68,.06)' }}>Close</div>}
        </div>
      </div>
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleImport} style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', opacity: 0 }} />
      <VirtualStock stock={virtualStock} setStock={setVirtualStock} addToast={addToast} />
      {fileName && <div style={{ fontSize: 10, color: T.tx3, marginBottom: 8 }}>File: {fileName} -- {rows.length} rows</div>}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: rows.length > 0 ? 12 : 0 }}>
        {Object.entries(SIZE_MAP).map(([num, name]) => (
          <span key={num} style={{ padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 600, background: 'rgba(99,102,241,.08)', color: T.ac2, fontFamily: T.mono }}>{num}={name}</span>
        ))}
      </div>
      {rows.length > 0 && <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', borderRadius: 8, border: `1px solid ${T.bd}`, marginTop: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
          <thead><tr>
            <th style={S.thStyle}>Rel ID</th><th style={S.thStyle}>Vendor</th><th style={S.thStyle}>Stock</th><th style={S.thStyle}>Lead</th><th style={S.thStyle}>Block</th><th style={S.thStyle}>Design No</th><th style={S.thStyle}>Size</th><th style={{ ...S.thStyle, color: T.ac2 }}>ARYA SKU</th>
          </tr></thead>
          <tbody>
            {rows.slice(0, 50).map((r, i) => (
              <tr key={i}>
                <td style={{ ...S.tdStyle, fontFamily: T.mono, fontSize: 10 }}>{r.relid}</td>
                <td style={{ ...S.tdStyle, fontFamily: T.mono, fontSize: 10 }}>{r.vendorno}</td>
                <td style={{ ...S.tdStyle, textAlign: 'right' }}>{r.stock}</td>
                <td style={{ ...S.tdStyle, textAlign: 'right' }}>{r.leadtime}</td>
                <td style={{ ...S.tdStyle, textAlign: 'right' }}>{r.block}</td>
                <td style={{ ...S.tdStyle, fontWeight: 600 }}>{r.designno}</td>
                <td style={S.tdStyle}>{r.size > 0 ? `${r.size} (${SIZE_MAP[r.size] || r.size})` : '0'}</td>
                <td style={{ ...S.tdStyle, fontFamily: T.mono, fontWeight: 600, color: r.aryaSku ? T.ac2 : T.tx3 }}>{r.aryaSku || '--'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > 50 && <div style={{ padding: '8px 14px', fontSize: 10, color: T.tx3, borderTop: `1px solid ${T.bd}`, textAlign: 'center' }}>Showing 50 of {rows.length} rows.</div>}
      </div>}
      {compareComputed && <>
        <div style={{ marginTop: 16, marginBottom: 12, fontSize: 12, fontWeight: 600, color: T.tx, fontFamily: T.sora }}>Compare Results</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {([
            { key: 'all' as CompareFilter, label: 'Total', count: compareRows.length, color: T.tx2 },
            { key: 'na' as CompareFilter, label: 'NA', count: compareRows.filter(r => r.category === 'na').length, color: T.yl },
            { key: 'inactive' as CompareFilter, label: 'Inactive', count: compareRows.filter(r => r.category === 'inactive').length, color: T.re },
            { key: 'not_uploaded' as CompareFilter, label: 'Not Uploaded', count: compareRows.filter(r => r.category === 'not_uploaded').length, color: T.bl },
            { key: 'vs_missing' as CompareFilter, label: 'Virtual Stock', count: compareRows.filter(r => r.category === 'vs_missing').length, color: T.gr },
          ]).map(s => (
            <div key={s.key} onClick={() => { setCompareFilter(compareFilter === s.key ? 'all' : s.key); setCompareLimit(50); }} style={{ padding: '8px 14px', background: compareFilter === s.key ? `${s.color}12` : 'rgba(255,255,255,0.02)', border: `1px solid ${compareFilter === s.key ? `${s.color}44` : T.bd}`, borderRadius: 8, textAlign: 'center', cursor: 'pointer', transition: 'all .15s' }}>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: T.mono, color: s.color }}>{s.count}</div>
              <div style={{ fontSize: 9, color: T.tx3, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', maxWidth: 240 }}>
            <svg viewBox="0 0 24 24" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, fill: 'none', stroke: T.tx3, strokeWidth: 1.8, strokeLinecap: 'round' as const, opacity: 0.5 }}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
            <input value={compareSearch} onChange={e => setCompareSearch(e.target.value)} placeholder="Search SKU…" style={{ ...S.fSearch, width: '100%' }} />
          </div>
          {compareFilter !== 'all' && <div onClick={() => exportCompareFilter(compareFilter)} style={{ ...S.btnSm, cursor: 'pointer', color: T.bl, border: '1px solid rgba(56,189,248,.2)', background: 'rgba(56,189,248,.06)', borderRadius: 5, padding: '4px 10px', fontSize: 10 }}>Export {compareFiltered.length}</div>}
          {compareFilter !== 'all' && <div onClick={() => setCompareFilter('all')} style={{ ...S.btnSm, cursor: 'pointer', color: T.tx3, border: `1px solid ${T.bd}`, borderRadius: 5, padding: '4px 10px', fontSize: 10 }}>Clear</div>}
        </div>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', borderRadius: 8, border: `1px solid ${T.bd}` }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 300 }}>
            <thead><tr>
              <th style={S.thStyle}>SKU</th><th style={S.thStyle}>Category</th>
            </tr></thead>
            <tbody>
              {compareFiltered.slice(0, compareLimit).map((r, i) => {
                const catColor = r.category === 'na' ? T.yl : r.category === 'inactive' ? T.re : r.category === 'not_uploaded' ? T.bl : T.gr;
                const catLabel = r.category === 'na' ? 'NA' : r.category === 'inactive' ? 'Inactive' : r.category === 'not_uploaded' ? 'Not Uploaded' : 'Virtual Stock';
                return (
                  <tr key={`${r.sku}-${i}`}>
                    <td style={{ ...S.tdStyle, fontFamily: T.mono, fontWeight: 600 }}>{r.sku}</td>
                    <td style={S.tdStyle}><span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 600, color: catColor, background: `${catColor}18` }}>{catLabel}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {compareFiltered.length > compareLimit && <div style={{ padding: '8px 14px', fontSize: 10, color: T.tx3, borderTop: `1px solid ${T.bd}`, textAlign: 'center' }}>Showing {compareLimit} of {compareFiltered.length} rows.</div>}
        </div>
        {compareFiltered.length > compareLimit && <button onClick={() => setCompareLimit(l => l + 50)} style={{ width: '100%', padding: '12px', marginTop: 8, border: 'none', background: T.ac3, color: T.ac2, fontSize: 11, fontWeight: 600, cursor: 'pointer', borderRadius: 8 }}>Load More ({compareFiltered.length - compareLimit} remaining)</button>}
      </>}
      {rows.length === 0 && !fileName && <div style={{ padding: 40, textAlign: 'center', color: T.tx3, fontSize: 12 }}>Click "Import Excel" to upload a vendor file.</div>}
    </div>
  );

  return (
    <div className="page-pad" style={{ padding: '14px 16px', animation: 'fi .15s ease' }}>
      <div className="minis-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
        {[
          { id: 'utsav' as MiniView, title: 'Utsav Import', desc: 'Import vendor Excel, generate ARYA SKU column, export as XLS' },
          { id: 'cbazaar' as MiniView, title: 'Cbazaar Import', desc: 'Import Cbazaar vendor Excel, generate ARYA SKU column, export as CSV' },
          { id: 'odette' as MiniView, title: 'Odette Import', desc: 'Aggregate SKU quantities across multiple vendor sheets' },
          { id: 'address' as MiniView, title: 'LabelMaker', desc: 'Save addresses, print 4x6 inch courier label stickers' },
          { id: 'trackly' as MiniView, title: 'Trackly', desc: 'Shorten URLs and track clicks — device, browser, location, timing analytics' },
        ].map(t => (
          <div key={t.id} onClick={() => setView(t.id)} style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: '20px 18px', cursor: 'pointer', transition: 'all .15s' }} onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,.3)'; e.currentTarget.style.background = 'rgba(99,102,241,.04)'; }} onMouseLeave={e => { e.currentTarget.style.borderColor = T.bd; e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.tx, marginBottom: 4 }}>{t.title}</div>
            <div style={{ fontSize: 11, color: T.tx3, lineHeight: 1.5 }}>{t.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
