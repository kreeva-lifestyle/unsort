import { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import JsBarcode from 'jsbarcode';

const T = {
  bg: '#0a0d14', s: '#12161f', s2: '#1a1f2e', s3: '#232a3b',
  bd: '#1e2536', bd2: '#2d3548',
  tx: '#eaf0f6', tx2: '#8899b4', tx3: '#4f6080',
  ac: '#8b5cf6', ac2: '#a78bfa', gr: '#34d399', re: '#f87171', bl: '#60a5fa', yl: '#fbbf24',
};
const btn = (bg: string, color: string, extra?: any) => ({ padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 600 as const, fontFamily: "'Inter',sans-serif", background: bg, color, display: 'inline-flex' as const, alignItems: 'center' as const, gap: 4, whiteSpace: 'nowrap' as const, backdropFilter: 'blur(4px)', ...extra });
const inp = { background: 'rgba(26,31,46,.8)', border: `1px solid ${T.bd2}`, borderRadius: 6, color: T.tx, fontFamily: "'Inter',sans-serif", fontSize: 12, padding: '6px 10px', outline: 'none' };

interface Row { brand: string; ean: string; sku: string; qty: string; mrp: number; size: string; product: string; color: string; mktd: string; jioCode: string; copies: number; selected: boolean; }

const defaultRow: Row = { brand: 'BRAND NAME: TANUKA', ean: '8905738880431', sku: 'TNDRS177-S', qty: 'INCLUDES: 1 U Top, 1 U Bottom, 1 U Dupatta', mrp: 6800, size: 'S', product: 'PRODUCT DESC: Co-ord Set', color: 'Pink', mktd: 'Arya Designs, 16, Amba Bhuvan, Nr. Kasanagar Circle, Opp. Kumar Gurukul Vidhyalaya Katargam, Surat-395004', jioCode: '702342013006', copies: 0, selected: false };

const fmtMrp = (v: number) => '₹' + v.toLocaleString('en-IN');

// Label component
const Label = ({ r }: { r: Row }) => {
  const bcRef = useRef<SVGSVGElement>(null);
  useEffect(() => { if (bcRef.current) try { JsBarcode(bcRef.current, r.jioCode || '0', { format: 'CODE128', width: 1.2, height: 35, displayValue: true, text: r.sku, fontSize: 8, margin: 2, textMargin: 1 }); } catch {} }, [r.jioCode, r.sku]);
  return (
    <div className="bt-label" style={{ width: '2.95in', height: '1.97in', display: 'flex', fontFamily: "'Inter',sans-serif", background: '#fff', color: '#000', overflow: 'hidden', border: '1px solid #ddd', borderRadius: 2, pageBreakInside: 'avoid' as const }}>
      <div style={{ flex: 1, padding: '6px 8px 4px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0 }}>
        <div>
          <p style={{ margin: 0, fontSize: '9.5pt', fontWeight: 700, lineHeight: 1.2 }}>{r.brand}</p>
          <p style={{ margin: '2px 0', fontSize: '9pt', fontWeight: 700, lineHeight: 1.2 }}>SKU: {r.sku}</p>
          <p style={{ margin: '1px 0', fontSize: '8.5pt', lineHeight: 1.2 }}>{r.product}</p>
          <p style={{ margin: '1px 0', fontSize: '8pt', lineHeight: 1.2, wordBreak: 'break-word' as const }}>{r.qty}</p>
          <p style={{ margin: '1px 0', fontSize: '8.5pt', lineHeight: 1.2 }}>SIZE: {r.size}</p>
          <p style={{ margin: '1px 0', fontSize: '8.5pt', lineHeight: 1.2 }}>COLOR: {r.color}</p>
          <p style={{ margin: '1px 0', fontSize: '9pt', fontWeight: 700, lineHeight: 1.2 }}>MRP: {fmtMrp(r.mrp)}</p>
          <p style={{ margin: '1px 0', fontSize: '7pt', lineHeight: 1.15, wordBreak: 'break-word' as const, color: '#333' }}>MKTD & DIST. BY: {r.mktd}</p>
          <p style={{ margin: '1px 0', fontSize: '8pt', lineHeight: 1.2 }}>JIO CODE: {r.jioCode}</p>
        </div>
        <div style={{ textAlign: 'center', marginTop: 2 }}>
          <svg ref={bcRef} style={{ width: '90%', height: 38 }} />
        </div>
      </div>
      <div style={{ width: 38, background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ writingMode: 'vertical-rl' as const, transform: 'rotate(180deg)', fontSize: '10pt', fontWeight: 700, letterSpacing: 1, whiteSpace: 'nowrap' as const, color: '#000' }}>EAN: {r.sku}</span>
      </div>
    </div>
  );
};

export default function BrandTagPrinter() {
  const [rows, setRows] = useState<Row[]>([{ ...defaultRow }]);
  const [search, setSearch] = useState('');
  const [sizeF, setSizeF] = useState('all');
  const [colorF, setColorF] = useState('all');
  const [modal, setModal] = useState<{ idx: number; row: Row } | null>(null);
  const [printRows, setPrintRows] = useState<Row[]>([]);
  const [globalCopies, setGlobalCopies] = useState('1');
  const fileRef = useRef<HTMLInputElement>(null);

  const sizes = [...new Set(rows.map(r => r.size).filter(Boolean))];
  const colors = [...new Set(rows.map(r => r.color).filter(Boolean))];

  const filtered = rows.filter(r => {
    if (sizeF !== 'all' && r.size !== sizeF) return false;
    if (colorF !== 'all' && r.color !== colorF) return false;
    if (search) { const q = search.toLowerCase(); return [r.brand, r.ean, r.sku, r.qty, r.product, r.color, r.size, r.jioCode].some(f => (f || '').toLowerCase().includes(q)); }
    return true;
  });

  const importExcel = (e: any) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target?.result, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json<any>(ws);
      const parsed: Row[] = data.map((d: any) => ({
        brand: d['BRAND NAME'] || '', ean: String(d['EAN'] || ''), sku: String(d['SKU'] || ''),
        qty: d['QTY'] || '', mrp: Number(d['MRP']) || 0, size: d['SIZE'] || '',
        product: d['PRODUCT'] || '', color: d['Color'] || '', mktd: d['MKTD & DIST. BY'] || '',
        jioCode: String(d['Jio Code'] || ''), copies: Number(d['COPIES']) || 0, selected: false,
      }));
      setRows(parsed);
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const exportExcel = () => {
    const data = rows.map(r => ({ 'BRAND NAME': r.brand, 'EAN': r.ean, 'SKU': r.sku, 'QTY': r.qty, 'MRP': r.mrp, 'SIZE': r.size, 'PRODUCT': r.product, 'Color': r.color, 'MKTD & DIST. BY': r.mktd, 'Jio Code': r.jioCode, 'COPIES': r.copies }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Brand Tags');
    XLSX.writeFile(wb, 'brand-tags.xlsx');
  };

  const updateRow = (idx: number, field: string, val: any) => setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r));
  const deleteRow = (idx: number) => { if (confirm(`Delete SKU: ${rows[idx].sku}?`)) setRows(prev => prev.filter((_, i) => i !== idx)); };

  const doPrint = (labels: Row[]) => { setPrintRows(labels); setTimeout(() => { window.print(); setTimeout(() => setPrintRows([]), 500); }, 100); };
  const printOne = (r: Row) => doPrint([r]);
  const printBulk = () => { const labels: Row[] = []; rows.forEach(r => { if (r.copies > 0) for (let i = 0; i < r.copies; i++) labels.push(r); }); if (labels.length === 0) { alert('Set copies > 0 for at least one row'); return; } doPrint(labels); };
  const testPrint = () => doPrint([rows[0] || defaultRow]);

  const toggleAll = () => { const allSel = filtered.every(r => r.selected); setRows(prev => prev.map(r => ({ ...r, selected: allSel ? false : filtered.includes(r) ? true : r.selected }))); };
  const applyGlobalCopies = () => { const n = parseInt(globalCopies) || 0; setRows(prev => prev.map(r => r.selected ? { ...r, copies: n } : r)); };

  const saveModal = () => { if (!modal) return; setRows(prev => { if (modal.idx === -1) return [...prev, { ...modal.row, selected: false }]; return prev.map((r, i) => i === modal.idx ? { ...modal.row, selected: r.selected } : r); }); setModal(null); };

  const thS = { fontSize: 9, color: T.tx3, padding: '6px 8px', textAlign: 'left' as const, fontWeight: 600, borderBottom: `1px solid ${T.bd}`, background: T.s2, whiteSpace: 'nowrap' as const };
  const tdS = { padding: '5px 8px', fontSize: 11, borderBottom: `1px solid ${T.bd}`, color: T.tx };

  return (
    <div className="page-pad" style={{ padding: '16px 18px', fontFamily: "'Inter',sans-serif" }}>
      {/* Print area */}
      <div className="bt-print-area" style={{ display: 'none' }}>
        {printRows.map((r, i) => <Label key={i} r={r} />)}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12, alignItems: 'center' }}>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={importExcel} style={{ display: 'none' }} />
        <span onClick={() => fileRef.current?.click()} style={btn('rgba(96,165,250,.12)', T.bl)}>Import Excel</span>
        <span onClick={exportExcel} style={btn('rgba(52,211,153,.12)', T.gr)}>Export Excel</span>
        <span onClick={testPrint} style={btn('rgba(251,191,36,.12)', T.yl)}>Test Print</span>
        <span onClick={printBulk} style={btn(`linear-gradient(135deg,${T.ac}dd,${T.ac2}cc)`, '#fff')}>Print Selected</span>
        <span onClick={() => setModal({ idx: -1, row: { ...defaultRow, brand: '', ean: '', sku: '', qty: '', mrp: 0, size: '', product: '', color: '', mktd: defaultRow.mktd, jioCode: '', copies: 0, selected: false } })} style={btn(`linear-gradient(135deg,${T.ac}dd,${T.ac2}cc)`, '#fff')}>+ Add SKU</span>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10, alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search SKU, EAN, brand..." style={{ ...inp, flex: 1, minWidth: 140 }} />
        <select value={sizeF} onChange={e => setSizeF(e.target.value)} style={{ ...inp, width: 100, cursor: 'pointer' }}><option value="all">All sizes</option>{sizes.map(s => <option key={s} value={s}>{s}</option>)}</select>
        <select value={colorF} onChange={e => setColorF(e.target.value)} style={{ ...inp, width: 110, cursor: 'pointer' }}><option value="all">All colors</option>{colors.map(c => <option key={c} value={c}>{c}</option>)}</select>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input value={globalCopies} onChange={e => setGlobalCopies(e.target.value)} style={{ ...inp, width: 40, textAlign: 'center' }} />
          <span onClick={applyGlobalCopies} style={btn('rgba(139,92,246,.15)', T.ac2)}>Apply to selected</span>
        </div>
      </div>

      {/* Table */}
      <div style={{ background: T.s, border: `1px solid ${T.bd}`, borderRadius: 8, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
          <thead><tr>
            <th style={thS}><input type="checkbox" checked={filtered.length > 0 && filtered.every(r => r.selected)} onChange={toggleAll} /></th>
            <th style={thS}>Brand</th><th style={thS}>EAN</th><th style={thS}>SKU</th><th style={thS}>Includes</th>
            <th style={thS}>MRP</th><th style={thS}>Size</th><th style={thS}>Product</th><th style={thS}>Color</th>
            <th style={thS}>Jio Code</th><th style={thS}>Copies</th><th style={thS}>Actions</th>
          </tr></thead>
          <tbody>{filtered.map((r) => {
            const ri = rows.indexOf(r);
            return <tr key={ri}>
              <td style={tdS}><input type="checkbox" checked={r.selected} onChange={() => updateRow(ri, 'selected', !r.selected)} /></td>
              <td style={{ ...tdS, fontSize: 10, maxWidth: 100 }}>{r.brand.replace('BRAND NAME: ', '')}</td>
              <td style={{ ...tdS, fontFamily: "'JetBrains Mono',monospace", fontSize: 10 }}>{r.ean}</td>
              <td style={{ ...tdS, fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 600 }}>{r.sku}</td>
              <td style={{ ...tdS, fontSize: 10, maxWidth: 120 }}>{r.qty.replace('INCLUDES: ', '')}</td>
              <td style={{ ...tdS, fontFamily: "'JetBrains Mono',monospace", fontSize: 10 }}>{fmtMrp(r.mrp)}</td>
              <td style={tdS}>{r.size}</td>
              <td style={tdS}>{r.product.replace('PRODUCT DESC: ', '')}</td>
              <td style={tdS}>{r.color}</td>
              <td style={{ ...tdS, fontFamily: "'JetBrains Mono',monospace", fontSize: 10 }}>{r.jioCode}</td>
              <td style={tdS}><input type="number" min={0} value={r.copies} onChange={e => updateRow(ri, 'copies', parseInt(e.target.value) || 0)} style={{ ...inp, width: 48, textAlign: 'center', padding: '3px 4px' }} /></td>
              <td style={tdS}>
                <div style={{ display: 'flex', gap: 3 }}>
                  <span onClick={() => setModal({ idx: ri, row: { ...r } })} style={btn('rgba(96,165,250,.1)', T.bl)}>Edit</span>
                  <span onClick={() => printOne(r)} style={btn('rgba(139,92,246,.12)', T.ac2)}>Print</span>
                  <span onClick={() => deleteRow(ri)} style={btn('rgba(248,113,113,.08)', T.re)}>Del</span>
                </div>
              </td>
            </tr>;
          })}</tbody>
        </table>
        {filtered.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: T.tx3, fontSize: 12 }}>No data. Import an Excel file or add SKUs manually.</div>}
      </div>

      {/* Add/Edit Modal */}
      {modal && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, backdropFilter: 'blur(8px)', padding: 8 }}>
        <div className="modal-inner" style={{ background: 'rgba(18,22,31,.95)', border: `1px solid ${T.bd2}`, borderRadius: 12, width: 460, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 16px 48px rgba(0,0,0,.5)' }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${T.bd}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>{modal.idx === -1 ? 'Add' : 'Edit'} SKU</span>
            <span onClick={() => setModal(null)} style={{ cursor: 'pointer', color: T.tx3, fontSize: 16 }}>✕</span>
          </div>
          <div style={{ padding: 14, display: 'grid', gap: 10 }}>
            {[
              { k: 'brand', l: 'Brand name', p: 'BRAND NAME: FUSIONIC' },
              { k: 'ean', l: 'EAN', p: '8905738898139' },
              { k: 'sku', l: 'SKU', p: 'TF-167' },
              { k: 'qty', l: 'Includes (QTY)', p: 'INCLUDES: 1 U Lehenga, 1 U Blouse' },
              { k: 'mrp', l: 'MRP', p: '6800', type: 'number' },
              { k: 'size', l: 'Size', p: 'Free Size' },
              { k: 'product', l: 'Product desc', p: 'PRODUCT DESC: Lehenga Choli' },
              { k: 'color', l: 'Color', p: 'Yellow' },
              { k: 'mktd', l: 'MKTD & Dist. by', p: 'Address...' },
              { k: 'jioCode', l: 'Jio Code', p: '464991219001' },
            ].map(f => <div key={f.k}><label style={{ fontSize: 11, color: T.tx3, marginBottom: 3, display: 'block' }}>{f.l}</label><input value={(modal.row as any)[f.k]} onChange={e => setModal({ ...modal, row: { ...modal.row, [f.k]: f.type === 'number' ? Number(e.target.value) : e.target.value } })} placeholder={f.p} type={f.type || 'text'} style={{ ...inp, width: '100%' }} /></div>)}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, paddingTop: 6, borderTop: `1px solid ${T.bd}` }}>
              <span onClick={() => setModal(null)} style={btn('transparent', T.tx2, { border: `1px solid ${T.bd2}` })}>Cancel</span>
              <span onClick={saveModal} style={btn(`linear-gradient(135deg,${T.ac}dd,${T.ac2}cc)`, '#fff')}>Save</span>
            </div>
          </div>
        </div>
      </div>}

      {/* Print CSS */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .bt-print-area, .bt-print-area * { visibility: visible; }
          .bt-print-area { display: flex !important; flex-wrap: wrap; position: fixed; top: 0; left: 0; z-index: 9999; background: #fff; }
          .bt-label { margin: 0; border: none !important; page-break-inside: avoid; }
          @page { size: 2.95in 1.97in; margin: 0; }
        }
      `}</style>
    </div>
  );
}
