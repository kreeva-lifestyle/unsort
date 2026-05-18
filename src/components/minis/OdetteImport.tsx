import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { T, S } from '../../lib/theme';

interface VendorDetail { name: string; status: 'qty' | 'oos' | 'na'; qty: number }
interface OdResult { sku: string; total: number; vendorCount: number; naCount: number; oosCount: number; flag: 'ok' | 'last' | 'oos' | 'not_found'; vendors: VendorDetail[] }

export default function OdetteImport({ addToast, virtualStock }: { addToast: (msg: string, type?: string) => void; virtualStock: Record<string, number> }) {
  const masterRef = useRef<HTMLInputElement>(null);
  const vendorRef = useRef<HTMLInputElement>(null);
  const [masterSkus, setMasterSkus] = useState<string[]>([]);
  const [masterFile, setMasterFile] = useState('');
  const [vendorFiles, setVendorFiles] = useState<{ name: string; rows: Record<string, number | string>[] }[]>([]);
  const [results, setResults] = useState<OdResult[]>([]);
  const [computed, setComputed] = useState(false);
  const [importing, setImporting] = useState(false);
  const [filter, setFilter] = useState<'all' | 'ok' | 'last' | 'oos' | 'not_found'>('all');
  const [expandedSku, setExpandedSku] = useState<string | null>(null);

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
        setMasterSkus([...new Set(skus)]);
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

  const compute = () => {
    if (masterSkus.length === 0) { addToast('Import master file first', 'error'); return; }
    if (vendorFiles.length === 0) { addToast('Import at least one vendor file', 'error'); return; }
    const res: OdResult[] = [];
    for (const rawSku of masterSkus) {
      const sku = rawSku.toUpperCase();
      let total = 0; let naCount = 0; let oosCount = 0; let vendorCount = 0;
      const vendors: VendorDetail[] = [];
      for (const v of vendorFiles) {
        const row = v.rows.find(r => String(r.sku || r.SKU || r.Sku || '').trim().toUpperCase() === sku);
        if (!row) { naCount++; vendors.push({ name: v.name, status: 'na', qty: 0 }); continue; }
        const qtyRaw = row.qty ?? row.QTY ?? row.Qty ?? row.quantity ?? '';
        const qtyStr = String(qtyRaw).trim();
        if (qtyStr.toUpperCase() === 'NA' || qtyStr === '') { naCount++; vendors.push({ name: v.name, status: 'na', qty: 0 }); continue; }
        if (qtyStr.toLowerCase().includes('out of stock') || qtyStr.toLowerCase().includes('out_of_stock')) { oosCount++; vendorCount++; vendors.push({ name: v.name, status: 'oos', qty: 0 }); continue; }
        const num = Number(qtyStr);
        if (isNaN(num) || num <= 0) { oosCount++; vendorCount++; vendors.push({ name: v.name, status: 'oos', qty: 0 }); continue; }
        total += num; vendorCount++; vendors.push({ name: v.name, status: 'qty', qty: num });
      }
      const vs = virtualStock[sku] || 0;
      const finalTotal = total + vs;
      let flag: OdResult['flag'] = 'ok';
      if (naCount === vendorFiles.length) flag = 'not_found';
      else if (total === 0 && oosCount > 0 && vs === 0) flag = 'oos';
      else if (finalTotal === 1) flag = 'last';
      res.push({ sku, total: finalTotal, vendorCount, naCount, oosCount, flag, vendors });
    }
    setResults(res);
    setComputed(true);
    const notFound = res.filter(r => r.flag === 'not_found').length;
    const oos = res.filter(r => r.flag === 'oos').length;
    const last = res.filter(r => r.flag === 'last').length;
    addToast(`Computed ${res.length} SKUs — ${notFound} not found, ${oos} out of stock, ${last} last qty`, 'success');
  };

  const exportXls = () => {
    if (results.length === 0) return;
    const data = results.map(r => ({ SKU: r.sku, Quantity: r.flag === 'oos' ? 'Out of Stock' : r.flag === 'not_found' ? 'Not Found' : r.total }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Odette Export');
    XLSX.writeFile(wb, `Odette_Export_${new Date().toISOString().slice(0, 10)}.xls`);
  };

  const filtered = filter === 'all' ? results : results.filter(r => r.flag === filter);

  const flagColor = (f: OdResult['flag']) => f === 'oos' ? T.re : f === 'not_found' ? T.tx3 : f === 'last' ? T.yl : T.gr;
  const flagLabel = (f: OdResult['flag']) => f === 'oos' ? 'Out of Stock' : f === 'not_found' ? 'Not Found' : f === 'last' ? 'Last Qty' : '';

  return (
    <div style={{ animation: 'fi .15s ease' }}>
      {/* Step 1: Master */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div onClick={() => !importing && masterRef.current?.click()} style={{ ...S.btnPrimary, opacity: importing ? 0.5 : 1, pointerEvents: importing ? 'none' : 'auto' }}>{importing ? 'Loading...' : 'Import Master SKUs'}</div>
        <div onClick={() => !importing && vendorRef.current?.click()} style={{ ...S.btnGhost, opacity: importing ? 0.5 : 1, pointerEvents: importing ? 'none' : 'auto' }}>+ Add Vendor Files</div>
        {masterSkus.length > 0 && vendorFiles.length > 0 && <div onClick={compute} style={{ ...S.btnGhost, color: T.gr, border: '1px solid rgba(34,197,94,.2)', background: 'rgba(34,197,94,.06)' }}>Compute</div>}
        {computed && results.length > 0 && <div onClick={exportXls} style={{ ...S.btnGhost, color: T.bl, border: '1px solid rgba(56,189,248,.2)', background: 'rgba(56,189,248,.06)' }}>Export XLS</div>}
        {(masterSkus.length > 0 || vendorFiles.length > 0) && <div onClick={() => { setMasterSkus([]); setMasterFile(''); setVendorFiles([]); setResults([]); setComputed(false); }} style={{ ...S.btnGhost, color: T.re, border: '1px solid rgba(239,68,68,.2)', background: 'rgba(239,68,68,.06)' }}>Reset</div>}
      </div>
      <input ref={masterRef} type="file" accept=".xlsx,.xls,.csv" onChange={importMaster} style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', opacity: 0 }} />
      <input ref={vendorRef} type="file" accept=".xlsx,.xls,.csv" multiple onChange={importVendor} style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', opacity: 0 }} />

      {/* Status chips */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {masterFile && <span style={{ padding: '3px 10px', borderRadius: 5, fontSize: 10, fontWeight: 600, background: 'rgba(99,102,241,.08)', color: T.ac2 }}>Master: {masterSkus.length} SKUs</span>}
        {vendorFiles.map((v, i) => <span key={i} style={{ padding: '3px 10px', borderRadius: 5, fontSize: 10, fontWeight: 500, background: 'rgba(255,255,255,.04)', color: T.tx2, border: `1px solid ${T.bd}` }}>{v.name} ({v.rows.length})</span>)}
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
          ]).map(s => (
            <div key={s.key} onClick={() => setFilter(filter === s.key ? 'all' : s.key)} style={{ padding: '8px 14px', background: filter === s.key ? `${s.color}12` : 'rgba(255,255,255,0.02)', border: `1px solid ${filter === s.key ? `${s.color}44` : T.bd}`, borderRadius: 8, textAlign: 'center', cursor: 'pointer', transition: 'all .15s' }}>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: T.mono, color: s.color }}>{s.count}</div>
              <div style={{ fontSize: 9, color: T.tx3, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</div>
            </div>
          ))}
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
              {filtered.map(r => (<React.Fragment key={r.sku}>
                <tr onClick={() => setExpandedSku(expandedSku === r.sku ? null : r.sku)} style={{ cursor: 'pointer', transition: 'background .1s' }} onMouseEnter={e => (e.currentTarget.style.background = 'oklch(1 0 0 / 0.02)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ ...S.tdStyle, fontFamily: T.mono, fontWeight: 600 }}>{r.sku} <span style={{ fontSize: 9, color: T.tx3 }}>{expandedSku === r.sku ? '▾' : '▸'}</span></td>
                  <td style={{ ...S.tdStyle, fontFamily: T.mono, fontWeight: 700, color: flagColor(r.flag) }}>{r.flag === 'oos' ? 'Out of Stock' : r.flag === 'not_found' ? '--' : r.total}</td>
                  <td style={{ ...S.tdStyle, fontSize: 10, color: T.tx3 }}>{r.vendorCount}/{vendorFiles.length}{r.naCount > 0 ? ` (${r.naCount} N/A)` : ''}</td>
                  <td style={S.tdStyle}>{flagLabel(r.flag) && <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 600, color: flagColor(r.flag), background: `${flagColor(r.flag)}18` }}>{flagLabel(r.flag)}</span>}</td>
                </tr>
                {expandedSku === r.sku && <tr><td colSpan={4} style={{ padding: '0 14px 10px', borderBottom: `1px solid ${T.bd}` }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingTop: 6 }}>
                    {r.vendors.map((v, i) => (
                      <span key={i} style={{ padding: '3px 10px', borderRadius: 5, fontSize: 10, fontWeight: 600, fontFamily: T.mono, background: v.status === 'qty' ? 'oklch(0.72 0.19 145 / 0.08)' : v.status === 'oos' ? 'oklch(0.63 0.22 25 / 0.08)' : 'oklch(1 0 0 / 0.03)', color: v.status === 'qty' ? T.gr : v.status === 'oos' ? T.re : T.tx3, border: `1px solid ${v.status === 'qty' ? 'oklch(0.72 0.19 145 / 0.15)' : v.status === 'oos' ? 'oklch(0.63 0.22 25 / 0.15)' : T.bd}` }}>
                        {v.name.replace(/\.\w+$/, '')}: {v.status === 'qty' ? v.qty : v.status === 'oos' ? 'OOS' : 'N/A'}
                      </span>
                    ))}
                  </div>
                </td></tr>}
              </React.Fragment>))}
            </tbody>
          </table>
        </div>
      </>}

      {!computed && masterSkus.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: T.tx3, fontSize: 12 }}>Import a master SKU file, then add vendor files to aggregate quantities.</div>}
      {!computed && masterSkus.length > 0 && vendorFiles.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: T.tx3, fontSize: 12 }}>Master loaded. Now add vendor files.</div>}
      {!computed && masterSkus.length > 0 && vendorFiles.length > 0 && <div style={{ padding: 30, textAlign: 'center', color: T.yl, fontSize: 12 }}>Ready to compute. Click "Compute" to aggregate.</div>}
    </div>
  );
}
