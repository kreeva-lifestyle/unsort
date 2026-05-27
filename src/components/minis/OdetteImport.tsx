import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { T, S } from '../../lib/theme';
import { SUPABASE_ANON_KEY } from '../../lib/supabase';

const ODETTE_EDGE_FN = 'https://ulphprdnswznfztawbvg.supabase.co/functions/v1/odette-export';
const SHEET_NAME = 'ARYA STOCK';

interface OdResult { sku: string; total: number; vendorCount: number; naCount: number; oosCount: number; blocked: number; flag: 'ok' | 'last' | 'oos' | 'not_found' | 'blocked' }

export default function OdetteImport({ addToast, virtualStock }: { addToast: (msg: string, type?: string) => void; virtualStock: Record<string, number> }) {
  const masterRef = useRef<HTMLInputElement>(null);
  const vendorRef = useRef<HTMLInputElement>(null);
  const blockedRef = useRef<HTMLInputElement>(null);
  const [masterSkus, setMasterSkus] = useState<string[]>([]);
  const [masterFile, setMasterFile] = useState('');
  const [blockedFile, setBlockedFile] = useState('');
  const [blockedMap, setBlockedMap] = useState<Record<string, number>>({});
  const [vendorFiles, setVendorFiles] = useState<{ name: string; rows: Record<string, number | string>[] }[]>([]);
  const [results, setResults] = useState<OdResult[]>([]);
  const [computed, setComputed] = useState(false);
  const [importing, setImporting] = useState(false);
  const [pushing, setPushing] = useState(false);

  const pushToSheet = async () => {
    if (results.length === 0) return;
    setPushing(true);
    try {
      const rows = results.map(r => [r.sku, r.flag === 'not_found' ? 'Not Found' : r.flag === 'oos' ? 'Out of Stock' : r.total]);
      const resp = await fetch(ODETTE_EDGE_FN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'apikey': SUPABASE_ANON_KEY },
        body: JSON.stringify({ action: 'push', sheetName: SHEET_NAME, rows }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) { addToast(`Push failed — ${data.details || data.error || 'Unknown error'}`, 'error'); setPushing(false); return; }
      addToast(`Pushed to "${SHEET_NAME}" — ${data.matched || 0} SKUs matched of ${data.totalRows || 0} rows`, 'success');
    } catch (e: any) { addToast(`Push failed — ${e.message || 'Network error'}`, 'error'); }
    setPushing(false);
  };
  const [filter, setFilter] = useState<'all' | 'ok' | 'last' | 'oos' | 'not_found' | 'blocked'>('all');
  const [search, setSearch] = useState('');

  const importMaster = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMasterFile(file.name);
    setImporting(true);
    const reader = new FileReader();
    reader.onerror = () => { addToast('Failed to read master file', 'error'); setImporting(false); };
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json<Record<string, any>>(ws);
        const skus = raw.map(r => String(r.sku || r.SKU || r.Sku || Object.values(r)[0] || '').trim().toUpperCase()).filter(Boolean);
        if (skus.length === 0) { addToast('No SKUs found in master file', 'error'); setImporting(false); return; }
        setMasterSkus(skus);
        setComputed(false); setResults([]);
        addToast(`${skus.length} SKUs loaded from master`, 'success');
      } catch { addToast('Failed to parse master file', 'error'); }
      setImporting(false);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const importVendor = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setImporting(true);
    const newVendors: typeof vendorFiles = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json<Record<string, any>>(ws);
        newVendors.push({ name: file.name, rows: raw });
      } catch { addToast(`Failed to parse ${file.name}`, 'error'); }
    }
    if (newVendors.length > 0) {
      setVendorFiles(prev => [...prev, ...newVendors]);
      setComputed(false); setResults([]);
      addToast(`${newVendors.length} vendor file${newVendors.length > 1 ? 's' : ''} added (${newVendors.reduce((s, v) => s + v.rows.length, 0)} rows)`, 'success');
    }
    setImporting(false);
    e.target.value = '';
  };

  const importBlocked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBlockedFile(file.name);
    setImporting(true);
    const reader = new FileReader();
    reader.onerror = () => { addToast('Failed to read blocked file', 'error'); setImporting(false); };
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json<Record<string, any>>(ws);
        const map: Record<string, number> = {};
        let count = 0;
        for (const r of raw) {
          const sku = String(r['Sku Code'] || r['sku code'] || r['SKU CODE'] || r.sku || r.SKU || r.Sku || '').trim().toUpperCase();
          if (!sku) continue;
          const val = Number(r['Blocked (Committed)'] || r['blocked (committed)'] || r['BLOCKED (COMMITTED)'] || r.blocked || r.BLOCKED || r.Blocked || 0);
          if (val > 0) { map[sku] = (map[sku] || 0) + val; count++; }
        }
        setBlockedMap(map);
        setComputed(false); setResults([]);
        addToast(`${count} blocked values loaded from ${Object.keys(map).length} SKUs`, 'success');
      } catch { addToast('Failed to parse blocked file', 'error'); }
      setImporting(false);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const compute = () => {
    if (masterSkus.length === 0) { addToast('Import master file first', 'error'); return; }
    if (vendorFiles.length === 0) { addToast('Import at least one vendor file', 'error'); return; }
    const vendorMaps = vendorFiles.map(v => {
      const m = new Map<string, Record<string, number | string>>();
      for (const r of v.rows) { const s = String(r.sku || r.SKU || r.Sku || '').trim().toUpperCase(); if (s) m.set(s, r); }
      return m;
    });
    const res: OdResult[] = [];
    let cntNotFound = 0, cntOos = 0, cntLast = 0, cntBlocked = 0;
    for (const rawSku of masterSkus) {
      const sku = rawSku.toUpperCase();
      let total = 0; let naCount = 0; let oosCount = 0; let vendorCount = 0;
      for (const vm of vendorMaps) {
        const row = vm.get(sku);
        if (!row) { naCount++; continue; }
        const qtyRaw = row.qty ?? row.QTY ?? row.Qty ?? row.quantity ?? '';
        const qtyStr = String(qtyRaw).trim();
        if (qtyStr.toUpperCase() === 'NA' || qtyStr === '') { naCount++; continue; }
        if (qtyStr.toLowerCase().includes('out of stock') || qtyStr.toLowerCase().includes('out_of_stock')) { oosCount++; vendorCount++; continue; }
        const num = Number(qtyStr);
        if (isNaN(num) || num <= 0) { oosCount++; vendorCount++; continue; }
        total += num; vendorCount++;
      }
      const vs = virtualStock[sku] || 0;
      const blocked = blockedMap[sku] || 0;
      const finalTotal = total + vs - blocked;
      let flag: OdResult['flag'] = 'ok';
      if (vendorFiles.length > 0 && naCount === vendorFiles.length) flag = 'not_found';
      else if (blocked > 0 && finalTotal <= 0) flag = 'blocked';
      else if (total === 0 && oosCount > 0 && vs === 0) flag = 'oos';
      else if (finalTotal === 1) flag = 'last';
      if (flag === 'not_found') cntNotFound++; else if (flag === 'oos') cntOos++; else if (flag === 'last') cntLast++; else if (flag === 'blocked') cntBlocked++;
      res.push({ sku, total: finalTotal, vendorCount, naCount, oosCount, blocked, flag });
    }
    setResults(res);
    setComputed(true);
    addToast(`Computed ${res.length} SKUs — ${cntNotFound} not found, ${cntOos} out of stock, ${cntLast} last qty${cntBlocked > 0 ? `, ${cntBlocked} blocked` : ''}`, 'success');
    if (Object.keys(blockedMap).length === 0) addToast('Results exclude blocked inventory — no blocked sheet imported', 'error');
  };

  const exportXls = () => {
    if (results.length === 0) return;
    const data = results.map(r => ({ SKU: r.sku, Quantity: r.flag === 'oos' ? 'Out of Stock' : r.flag === 'not_found' ? 'Not Found' : r.total }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Odette Export');
    XLSX.writeFile(wb, `Odette_Export_${new Date().toISOString().slice(0, 10)}.xls`);
  };

  const filtered = results.filter(r => {
    if (filter !== 'all' && r.flag !== filter) return false;
    if (search && !r.sku.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const flagColor = (f: OdResult['flag']) => f === 'oos' ? T.re : f === 'blocked' ? '#F97316' : f === 'not_found' ? T.tx3 : f === 'last' ? T.yl : T.gr;
  const flagLabel = (f: OdResult['flag']) => f === 'oos' ? 'Out of Stock' : f === 'blocked' ? 'Blocked' : f === 'not_found' ? 'Not Found' : f === 'last' ? 'Last Qty' : '';

  return (
    <div style={{ animation: 'fi .15s ease' }}>
      {/* Step 1: Master */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div onClick={() => !importing && masterRef.current?.click()} style={{ ...S.btnPrimary, opacity: importing ? 0.5 : 1, pointerEvents: importing ? 'none' : 'auto' }}>{importing ? 'Loading...' : 'Import Master SKUs'}</div>
        <div onClick={() => !importing && vendorRef.current?.click()} style={{ ...S.btnGhost, opacity: importing ? 0.5 : 1, pointerEvents: importing ? 'none' : 'auto' }}>+ Add Vendor Files</div>
        <div onClick={() => !importing && blockedRef.current?.click()} style={{ ...S.btnGhost, color: T.yl, border: '1px solid rgba(245,158,11,.2)', background: 'rgba(245,158,11,.06)', opacity: importing ? 0.5 : 1, pointerEvents: importing ? 'none' : 'auto' }}>{blockedFile ? 'Replace Blocked' : 'Blocked Inventory'}</div>
        {masterSkus.length > 0 && vendorFiles.length > 0 && <div onClick={compute} style={{ ...S.btnSuccess, cursor: 'pointer' }}>Compute</div>}
        {computed && results.length > 0 && <div onClick={exportXls} style={{ ...S.btnGhost, color: T.bl, border: '1px solid rgba(56,189,248,.2)', background: 'rgba(56,189,248,.06)' }}>Export XLS</div>}
        {computed && results.length > 0 && <div onClick={pushToSheet} style={{ ...S.btnPrimary, background: T.gr, color: '#fff', fontWeight: 700, opacity: pushing ? 0.5 : 1, pointerEvents: pushing ? 'none' : 'auto' }}>{pushing ? 'Pushing...' : 'Push to Sheet'}</div>}
        {(masterSkus.length > 0 || vendorFiles.length > 0 || blockedFile) && <div onClick={() => { setMasterSkus([]); setMasterFile(''); setVendorFiles([]); setBlockedFile(''); setBlockedMap({}); setResults([]); setComputed(false); }} style={{ ...S.btnDanger, cursor: 'pointer' }}>Reset</div>}
      </div>
      <input ref={masterRef} type="file" accept=".xlsx,.xls,.csv" onChange={importMaster} style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', opacity: 0 }} />
      <input ref={vendorRef} type="file" accept=".xlsx,.xls,.csv" multiple onChange={importVendor} style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', opacity: 0 }} />
      <input ref={blockedRef} type="file" accept=".xlsx,.xls,.csv" onChange={importBlocked} style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', opacity: 0 }} />

      {/* Status chips */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {masterFile && <span style={{ padding: '3px 10px', borderRadius: 5, fontSize: 10, fontWeight: 600, background: T.ac3, color: T.ac2 }}>Master: {masterSkus.length} SKUs</span>}
        {vendorFiles.map((v, i) => <span key={i} style={{ padding: '3px 10px', borderRadius: 5, fontSize: 10, fontWeight: 500, background: 'rgba(255,255,255,.04)', color: T.tx2, border: `1px solid ${T.bd}` }}>{v.name} ({v.rows.length})</span>)}
        {blockedFile && <span style={{ padding: '3px 10px', borderRadius: 5, fontSize: 10, fontWeight: 600, background: 'rgba(245,158,11,.08)', color: T.yl, border: '1px solid rgba(245,158,11,.2)' }}>Blocked: {Object.keys(blockedMap).length} SKUs</span>}
      </div>

      {/* Results */}
      {computed && results.length > 0 && <>
        {/* Summary — clickable filters */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {([
            { key: 'all' as const, label: 'Total', count: results.length, color: T.tx2 },
            { key: 'ok' as const, label: 'In Stock', count: results.filter(r => r.flag === 'ok').length, color: T.gr },
            { key: 'last' as const, label: 'Last Qty', count: results.filter(r => r.flag === 'last').length, color: T.yl },
            { key: 'oos' as const, label: 'Out of Stock', count: results.filter(r => r.flag === 'oos').length, color: T.re },
            { key: 'not_found' as const, label: 'Not Found', count: results.filter(r => r.flag === 'not_found').length, color: T.tx3 },
            { key: 'blocked' as const, label: 'Blocked', count: results.filter(r => r.flag === 'blocked').length, color: '#F97316' },
          ]).map(s => (
            <div key={s.key} onClick={() => setFilter(filter === s.key ? 'all' : s.key)} style={{ padding: '8px 14px', background: filter === s.key ? `${s.color}12` : 'rgba(255,255,255,0.02)', border: `1px solid ${filter === s.key ? `${s.color}44` : T.bd}`, borderRadius: 8, textAlign: 'center', cursor: 'pointer', transition: 'all .15s' }}>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: T.mono, color: s.color }}>{s.count}</div>
              <div style={{ fontSize: 9, color: T.tx3, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 10, maxWidth: 280 }}>
          <svg viewBox="0 0 24 24" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, fill: 'none', stroke: T.tx3, strokeWidth: 1.8, strokeLinecap: 'round' as const, opacity: 0.5 }}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search SKU…" style={{ ...S.fSearch, width: '100%' }} />
        </div>

        {/* Filter export */}
        {filter !== 'all' && <div style={{ display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: T.tx2 }}>Showing: <b style={{ color: flagColor(filter) }}>{flagLabel(filter) || 'In Stock'}</b> ({filtered.length})</span>
          <div onClick={() => { const data = filtered.map(r => ({ SKU: r.sku, Quantity: r.flag === 'oos' ? 'Out of Stock' : r.flag === 'not_found' ? 'Not Found' : r.total })); const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Filtered'); XLSX.writeFile(wb, `Odette_${filter}_${new Date().toISOString().slice(0, 10)}.xls`); }} style={{ ...S.btnSm, cursor: 'pointer', color: T.bl, border: '1px solid rgba(56,189,248,.2)', background: 'rgba(56,189,248,.06)', borderRadius: 5, padding: '4px 10px', fontSize: 10 }}>Export {filtered.length}</div>
          <div onClick={() => setFilter('all')} style={{ ...S.btnSm, cursor: 'pointer', color: T.tx3, border: `1px solid ${T.bd}`, borderRadius: 5, padding: '4px 10px', fontSize: 10 }}>Clear</div>
        </div>}

        {/* Table */}
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', borderRadius: 8, border: `1px solid ${T.bd}` }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 400 }}>
            <thead><tr>
              <th style={S.thStyle}>SKU</th><th style={S.thStyle}>Qty</th><th style={S.thStyle}>Vendors</th><th style={S.thStyle}>Status</th>
            </tr></thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={`${r.sku}-${i}`}>
                  <td style={{ ...S.tdStyle, fontFamily: T.mono, fontWeight: 600 }}>{r.sku}</td>
                  <td style={{ ...S.tdStyle, fontFamily: T.mono, fontWeight: 700, color: r.flag === 'blocked' ? '#F97316' : r.total < 0 ? T.re : flagColor(r.flag) }}>{r.flag === 'not_found' ? '--' : r.flag === 'oos' ? 'Out of Stock' : r.total}</td>
                  <td style={{ ...S.tdStyle, fontSize: 10, color: T.tx3 }}>{r.vendorCount}/{vendorFiles.length}{r.naCount > 0 ? ` (${r.naCount} N/A)` : ''}</td>
                  <td style={S.tdStyle}>{flagLabel(r.flag) && <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 600, color: flagColor(r.flag), background: `${flagColor(r.flag)}18` }}>{flagLabel(r.flag)}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>}

      {!computed && masterSkus.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: T.tx3, fontSize: 12 }}>Import a master SKU file, then add vendor files to compute.</div>}
      {!computed && masterSkus.length > 0 && vendorFiles.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: T.tx3, fontSize: 12 }}>Master loaded. Now add vendor files.</div>}
      {!computed && masterSkus.length > 0 && vendorFiles.length > 0 && <div style={{ padding: 30, textAlign: 'center', color: T.yl, fontSize: 12 }}>Ready. Click "Compute" to aggregate.</div>}
    </div>
  );
}
