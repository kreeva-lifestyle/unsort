import { useState, useRef, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { T, S } from '../lib/theme';
import { useNotifications } from '../hooks/useNotifications';
import AddressPrinter from '../components/minis/AddressPrinter';
import CbazaarImport from '../components/minis/CbazaarImport';
import OdetteImport from '../components/minis/OdetteImport';
import VirtualStock from '../components/minis/VirtualStock';

const SIZE_MAP: Record<number, string> = { 32: 'XXS', 34: 'XS', 36: 'S', 38: 'M', 40: 'L', 42: 'XL', 44: 'XXL' };

interface UtsavRow { relid: string; vendorno: string; stock: number; leadtime: number; block: number; designno: string; size: number; catalogname: string; updateddate: string; aryaSku: string }

type MiniView = 'home' | 'utsav' | 'cbazaar' | 'odette' | 'address';

export default function Minis() {
  const { addToast } = useNotifications();
  const [view, setViewState] = useState<MiniView>('home');
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<UtsavRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [virtualStock, setVirtualStock] = useState<Record<string, number>>({});

  const setView = useCallback((v: MiniView) => {
    setViewState(v);
    if (v !== 'home') window.history.pushState({ miniView: v }, '');
  }, []);

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

  const back = <span onClick={() => setViewState('home')} style={{ ...S.btnGhost, padding: '6px 10px', cursor: 'pointer' }}>
    <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const }}><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
  </span>;

  if (view === 'cbazaar') return (
    <div className="page-pad" style={{ padding: '14px 16px', animation: 'fi .15s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        {back}
        <span style={{ fontSize: 14, fontWeight: 700, fontFamily: T.sora, color: T.tx }}>Cbazaar Import</span>
      </div>
      <VirtualStock stock={virtualStock} setStock={setVirtualStock} addToast={addToast} />
      <CbazaarImport addToast={addToast} />
    </div>
  );

  if (view === 'odette') return (
    <div className="page-pad" style={{ padding: '14px 16px', animation: 'fi .15s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        {back}
        <span style={{ fontSize: 14, fontWeight: 700, fontFamily: T.sora, color: T.tx }}>Odette Import</span>
      </div>
      <VirtualStock stock={virtualStock} setStock={setVirtualStock} addToast={addToast} />
      <OdetteImport addToast={addToast} virtualStock={virtualStock} />
    </div>
  );

  if (view === 'address') return (
    <div className="page-pad" style={{ padding: '14px 16px', animation: 'fi .15s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        {back}
        <span style={{ fontSize: 14, fontWeight: 700, fontFamily: T.sora, color: T.tx }}>LabelMaker</span>
      </div>
      <AddressPrinter addToast={addToast} />
    </div>
  );

  if (view === 'utsav') return (
    <div className="page-pad" style={{ padding: '14px 16px', animation: 'fi .15s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {back}
          <span style={{ fontSize: 14, fontWeight: 700, fontFamily: T.sora, color: T.tx }}>Utsav Import</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <div onClick={() => fileRef.current?.click()} style={S.btnPrimary}>Import Excel</div>
          {rows.length > 0 && <div onClick={exportXls} style={{ ...S.btnGhost, color: T.gr, border: '1px solid rgba(34,197,94,.2)', background: 'rgba(34,197,94,.06)' }}>Export XLS</div>}
          {rows.length > 0 && <div onClick={() => { setRows([]); setFileName(''); }} style={{ ...S.btnGhost, color: T.re, border: '1px solid rgba(239,68,68,.2)', background: 'rgba(239,68,68,.06)' }}>Close</div>}
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
      {rows.length === 0 && !fileName && <div style={{ padding: 40, textAlign: 'center', color: T.tx3, fontSize: 12 }}>Click "Import Excel" to upload a vendor file.</div>}
    </div>
  );

  return (
    <div className="page-pad" style={{ padding: '14px 16px', animation: 'fi .15s ease' }}>
      <div style={{ marginBottom: 14 }}>
        <span style={{ fontSize: 14, fontWeight: 700, fontFamily: T.sora, color: T.tx }}>Minis</span>
      </div>
      <div className="minis-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
        {[
          { id: 'utsav' as MiniView, title: 'Utsav Import', desc: 'Import vendor Excel, generate ARYA SKU column, export as XLS' },
          { id: 'cbazaar' as MiniView, title: 'Cbazaar Import', desc: 'Import Cbazaar vendor Excel, generate ARYA SKU column, export as CSV' },
          { id: 'odette' as MiniView, title: 'Odette Import', desc: 'Aggregate SKU quantities across multiple vendor sheets' },
          { id: 'address' as MiniView, title: 'LabelMaker', desc: 'Save addresses, print 4x6 inch courier label stickers' },
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
