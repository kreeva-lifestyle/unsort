import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { T, S } from '../../lib/theme';

const CBAZAAR_SIZE_MAP: Record<string, string> = {
  'XS (Extra small)': 'XS', 'S (Small)': 'S', 'M (Medium)': 'M',
  'L (Large)': 'L', 'XL (Extra large)': 'XL', 'XXL (Double extra large)': 'XXL',
};

interface CbRow { catalogue: string; designNo: string; sizeRaw: string; sizeShort: string; productCategory: string; productName: string; readyToShipQty: number; leadTime: number; supplierCost: number; aryaSku: string }

export default function CbazaarImport({ addToast }: { addToast: (msg: string, type?: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<CbRow[]>([]);
  const [fileName, setFileName] = useState('');

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
        const parsed: CbRow[] = [];
        for (const r of raw) {
          const designNo = String(r['Design No(view only)'] || r['Design No'] || r.designno || r.DesignNo || '').trim();
          const sizeRaw = String(r['Size(view only)'] || r['Size'] || r.size || '').trim();
          const sizeShort = CBAZAAR_SIZE_MAP[sizeRaw] || '';
          const isNA = sizeRaw === '-NA-' || sizeRaw === 'NA' || sizeRaw === '-na-' || !sizeRaw;
          const aryaSku = designNo ? (isNA ? designNo : (sizeShort ? `${designNo}-${sizeShort}` : designNo)) : '';
          parsed.push({
            catalogue: String(r['Catalogue'] || r.catalogue || '').trim(),
            designNo,
            sizeRaw,
            sizeShort: isNA ? '-' : (sizeShort || '?'),
            productCategory: String(r['Product Category'] || r['Product C'] || '').trim(),
            productName: String(r['Product Name'] || r['Product N'] || '').trim(),
            readyToShipQty: Number(r['ReadyToShipQty'] || 0),
            leadTime: Number(r['LeadTime'] || r.leadtime || 0),
            supplierCost: Number(r['SupplierCost'] || r['SupplierC'] || 0),
            aryaSku,
          });
        }
        setRows(parsed);
        addToast(`${parsed.length} rows imported`, 'success');
      } catch { addToast('Failed to parse file — check format', 'error'); }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const exportCsv = () => {
    if (rows.length === 0) return;
    const esc = (s: string) => s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    const header = 'Catalogue,Design No,Size,Product Category,Product Name,ReadyToShipQty,LeadTime,SupplierCost,ARYA SKU';
    const csvRows = rows.map(r => `${esc(r.catalogue)},${esc(r.designNo)},${esc(r.sizeRaw)},${esc(r.productCategory)},${esc(r.productName)},${r.readyToShipQty},${r.leadTime},${r.supplierCost},${esc(r.aryaSku)}`);
    const blob = new Blob([header + '\n' + csvRows.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Cbazaar_Export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <div style={{ animation: 'fi .15s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 12, flexWrap: 'wrap', gap: 6 }}>
        <div onClick={() => fileRef.current?.click()} style={S.btnPrimary}>Import Excel</div>
        {rows.length > 0 && <div onClick={exportCsv} style={{ ...S.btnGhost, color: T.gr, border: '1px solid rgba(34,197,94,.2)', background: 'rgba(34,197,94,.06)' }}>Export CSV</div>}
        {rows.length > 0 && <div onClick={() => { setRows([]); setFileName(''); }} style={{ ...S.btnGhost, color: T.re, border: '1px solid rgba(239,68,68,.2)', background: 'rgba(239,68,68,.06)' }}>Close</div>}
      </div>
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleImport} style={{ display: 'none' }} />
      {fileName && <div style={{ fontSize: 10, color: T.tx3, marginBottom: 8 }}>File: {fileName} -- {rows.length} rows</div>}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: rows.length > 0 ? 12 : 0 }}>
        {Object.entries(CBAZAAR_SIZE_MAP).map(([, short]) => (
          <span key={short} style={{ padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 600, background: 'rgba(99,102,241,.08)', color: T.ac2, fontFamily: T.mono }}>{short}</span>
        ))}
        <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 600, background: 'rgba(255,255,255,.04)', color: T.tx3, fontFamily: T.mono }}>-NA- = no size</span>
      </div>

      {rows.length > 0 && <div style={{ overflowX: 'auto', borderRadius: 8, border: `1px solid ${T.bd}`, marginTop: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
          <thead><tr>
            <th style={S.thStyle}>Catalogue</th><th style={S.thStyle}>Design No</th><th style={S.thStyle}>Size</th>
            <th style={S.thStyle}>Category</th><th style={S.thStyle}>Ship Qty</th><th style={S.thStyle}>Lead</th>
            <th style={S.thStyle}>Cost</th><th style={{ ...S.thStyle, color: T.ac2 }}>ARYA SKU</th>
          </tr></thead>
          <tbody>
            {rows.slice(0, 50).map((r, i) => (
              <tr key={i}>
                <td style={S.tdStyle}>{r.catalogue}</td>
                <td style={{ ...S.tdStyle, fontFamily: T.mono, fontWeight: 600 }}>{r.designNo}</td>
                <td style={S.tdStyle}>{r.sizeShort}</td>
                <td style={S.tdStyle}>{r.productCategory}</td>
                <td style={{ ...S.tdStyle, textAlign: 'right' }}>{r.readyToShipQty}</td>
                <td style={{ ...S.tdStyle, textAlign: 'right' }}>{r.leadTime}</td>
                <td style={{ ...S.tdStyle, textAlign: 'right', fontFamily: T.mono }}>{r.supplierCost}</td>
                <td style={{ ...S.tdStyle, fontFamily: T.mono, fontWeight: 600, color: r.aryaSku ? T.ac2 : T.tx3 }}>{r.aryaSku || '--'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > 50 && <div style={{ padding: '8px 14px', fontSize: 10, color: T.tx3, borderTop: `1px solid ${T.bd}`, textAlign: 'center' }}>Showing 50 of {rows.length} rows.</div>}
      </div>}
      {rows.length === 0 && !fileName && <div style={{ padding: 40, textAlign: 'center', color: T.tx3, fontSize: 12 }}>Click "Import Excel" to upload a Cbazaar vendor file.</div>}
    </div>
  );
}
