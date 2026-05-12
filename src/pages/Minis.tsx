import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { T, S } from '../lib/theme';
import { useNotifications } from '../hooks/useNotifications';

const SIZE_MAP: Record<number, string> = { 34: 'XS', 36: 'S', 38: 'M', 40: 'L', 42: 'XL', 44: 'XXL' };

interface UtsavRow { relid: string; vendorno: string; stock: number; leadtime: number; block: number; designno: string; size: number; catalogname: string; updateddate: string; aryaSku: string }

export default function Minis() {
  const { addToast } = useNotifications();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<UtsavRow[]>([]);
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

        const parsed: UtsavRow[] = [];
        for (const r of raw) {
          const designno = String(r.designno || r.DESIGNNO || r.DesignNo || '').trim();
          const sizeNum = Number(r.size || r.SIZE || r.Size || 0);
          const sizeName = SIZE_MAP[sizeNum] || '';
          const aryaSku = designno && sizeNum > 0 && sizeName ? `${designno}-${sizeName}` : '';

          parsed.push({
            relid: String(r.relid || r.RELID || ''),
            vendorno: String(r.vendorno || r.VENDORNO || ''),
            stock: Number(r.stock || r.STOCK || 0),
            leadtime: Number(r.leadtime || r.LEADTIME || 0),
            block: Number(r.block || r.BLOCK || 0),
            designno,
            size: sizeNum,
            catalogname: String(r.catalogname || r.CATALOGNAME || ''),
            updateddate: String(r.updateddate || r.UPDATEDDATE || ''),
            aryaSku,
          });
        }
        setRows(parsed);
        addToast(`${parsed.length} rows imported`, 'success');
      } catch (err: any) {
        addToast('Failed to parse file — check format', 'error');
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const exportCsv = () => {
    if (rows.length === 0) return;
    const header = 'relid,vendorno,stock,leadtime,block,ARYA SKU';
    const csvRows = rows.map(r =>
      `${r.relid},${r.vendorno},${r.stock},${r.leadtime},${r.block},${r.aryaSku}`
    );
    const csv = header + '\n' + csvRows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Utsav_Export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const th: React.CSSProperties = S.thStyle;
  const td: React.CSSProperties = S.tdStyle;

  return (
    <div className="page-pad" style={{ padding: '14px 16px', animation: 'fi .15s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ fontSize: 14, fontWeight: 700, fontFamily: T.sora, color: T.tx }}>Minis</span>
      </div>

      {/* Utsav Import */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>Utsav Import</div>
            <div style={{ fontSize: 10, color: T.tx3, marginTop: 2 }}>Import vendor Excel, get CSV with ARYA SKU column</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <div onClick={() => fileRef.current?.click()} style={S.btnPrimary}>Import Excel</div>
            {rows.length > 0 && <div onClick={exportCsv} style={{ ...S.btnGhost, color: T.gr, border: '1px solid rgba(34,197,94,.2)', background: 'rgba(34,197,94,.06)' }}>Export CSV</div>}
          </div>
        </div>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleImport} style={{ display: 'none' }} />

        {fileName && <div style={{ fontSize: 10, color: T.tx3, marginBottom: 8 }}>File: {fileName} -- {rows.length} rows</div>}

        {/* Size mapping reference */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: rows.length > 0 ? 12 : 0 }}>
          {Object.entries(SIZE_MAP).map(([num, name]) => (
            <span key={num} style={{ padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 600, background: 'rgba(99,102,241,.08)', color: T.ac2, fontFamily: T.mono }}>{num}={name}</span>
          ))}
        </div>

        {/* Preview table */}
        {rows.length > 0 && <div style={{ overflowX: 'auto', borderRadius: 8, border: `1px solid ${T.bd}`, marginTop: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
            <thead><tr>
              <th style={th}>Rel ID</th>
              <th style={th}>Vendor</th>
              <th style={th}>Stock</th>
              <th style={th}>Lead</th>
              <th style={th}>Block</th>
              <th style={th}>Design No</th>
              <th style={th}>Size</th>
              <th style={{ ...th, color: T.ac2 }}>ARYA SKU</th>
            </tr></thead>
            <tbody>
              {rows.slice(0, 50).map((r, i) => (
                <tr key={i}>
                  <td style={{ ...td, fontFamily: T.mono, fontSize: 10 }}>{r.relid}</td>
                  <td style={{ ...td, fontFamily: T.mono, fontSize: 10 }}>{r.vendorno}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{r.stock}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{r.leadtime}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{r.block}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{r.designno}</td>
                  <td style={td}>{r.size > 0 ? `${r.size} (${SIZE_MAP[r.size] || '?'})` : '0'}</td>
                  <td style={{ ...td, fontFamily: T.mono, fontWeight: 600, color: r.aryaSku ? T.ac2 : T.tx3 }}>{r.aryaSku || '--'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 50 && <div style={{ padding: '8px 14px', fontSize: 10, color: T.tx3, borderTop: `1px solid ${T.bd}`, textAlign: 'center' }}>Showing 50 of {rows.length} rows. Full data included in CSV export.</div>}
        </div>}
      </div>
    </div>
  );
}
