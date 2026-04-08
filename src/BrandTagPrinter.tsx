/* eslint-disable */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import JsBarcode from 'jsbarcode';
import * as XLSX from 'xlsx';

// ── Design Tokens ──────────────────────────────────────────────────────────────
const T = {
  bg: '#0a0d14', s: '#12161f', s2: '#1a1f2e', s3: '#232a3b',
  bd: '#1e2536', bd2: '#2d3548',
  tx: '#eaf0f6', tx2: '#8899b4', tx3: '#4f6080',
  ac: '#8b5cf6', ac2: '#a78bfa',
  gr: '#34d399', re: '#f87171', bl: '#60a5fa', yl: '#fbbf24',
  r: 8,
  mono: "'JetBrains Mono', monospace",
  sans: "'Inter', sans-serif",
};

// ── Reusable style helpers ─────────────────────────────────────────────────────
const btnBase: React.CSSProperties = {
  padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
  fontSize: 11, fontWeight: 600, fontFamily: T.sans,
  display: 'inline-flex', alignItems: 'center', gap: 4,
  whiteSpace: 'nowrap', backdropFilter: 'blur(4px)', letterSpacing: 0.2,
};
const btnPrimary: React.CSSProperties = { ...btnBase, background: `linear-gradient(135deg, ${T.ac}dd, ${T.ac2}cc)`, color: '#fff' };
const btnGhost: React.CSSProperties = { ...btnBase, fontWeight: 500, background: 'rgba(26,31,46,.5)', border: `1px solid ${T.bd2}`, color: T.tx2 };
const btnDanger: React.CSSProperties = { ...btnBase, padding: '4px 10px', fontSize: 10, fontWeight: 500, background: 'rgba(248,113,113,.06)', border: '1px solid rgba(248,113,113,.15)', color: T.re };
const btnSm: React.CSSProperties = { padding: '3px 8px', fontSize: 10 };
const inp: React.CSSProperties = {
  background: 'rgba(26,31,46,.8)', border: `1px solid ${T.bd2}`, borderRadius: 6,
  color: T.tx, fontFamily: T.sans, fontSize: 12, padding: '7px 10px',
  outline: 'none', boxSizing: 'border-box', transition: 'border-color .2s',
};
const thS: React.CSSProperties = {
  fontSize: 10, color: T.tx3, padding: '8px 10px', textAlign: 'left',
  fontWeight: 600, borderBottom: `1px solid ${T.bd}`, background: T.s2,
  whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1,
};
const tdS: React.CSSProperties = { padding: '8px 10px', fontSize: 12, borderBottom: `1px solid ${T.bd}`, color: T.tx };
const fLabel: React.CSSProperties = { fontSize: 11, color: T.tx3, marginBottom: 4, display: 'block', fontWeight: 500 };

// ── Types ──────────────────────────────────────────────────────────────────────
interface BrandTagRow {
  id: string;
  brand: string;
  ean: string;
  sku: string;
  qty: string;
  mrp: number;
  size: string;
  product: string;
  color: string;
  mktd: string;
  jioCode: string;
  copies: number;
}

const uid = (): string => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const sampleRow = (): BrandTagRow => ({
  id: uid(),
  brand: 'BRAND NAME: TANUKA',
  ean: '8905738880431',
  sku: 'TNDRS177-S',
  qty: 'INCLUDES: 1 U Top, 1 U Bottom, 1 U Dupatta',
  mrp: 6800,
  size: 'S',
  product: 'PRODUCT DESC: Co-ord Set',
  color: 'Pink',
  mktd: 'Arya Designs, 16, Amba Bhuvan, Nr. Kasanagar Circle, Opp. Kumar Gurukul Vidhyalaya Katargam, Surat-395004',
  jioCode: '702342013006',
  copies: 0,
});

const blankRow = (): BrandTagRow => ({
  id: uid(), brand: '', ean: '', sku: '', qty: '', mrp: 0,
  size: '', product: '', color: '', mktd: '', jioCode: '', copies: 0,
});

const REQUIRED_FIELDS: (keyof BrandTagRow)[] = ['brand', 'ean', 'sku', 'qty', 'size', 'product', 'color', 'mktd', 'jioCode'];
const validateRow = (r: BrandTagRow): string | null => {
  for (const f of REQUIRED_FIELDS) { if (!r[f] || String(r[f]).trim() === '') return f; }
  if (!r.mrp || r.mrp <= 0) return 'mrp';
  return null;
};

const fmtMrp = (v: number): string => '\u20B9' + v.toLocaleString('en-IN');

// ── Print CSS (injected once) ──────────────────────────────────────────────────
const PRINT_CSS_ID = 'bt-print-css';
const ensurePrintCSS = () => {
  if (document.getElementById(PRINT_CSS_ID)) return;
  const el = document.createElement('style');
  el.id = PRINT_CSS_ID;
  el.textContent = `
@media print {
  body > *:not(.bt-print-area) { display: none !important; }
  .bt-print-area { display: block !important; position: static !important; background: #fff !important; }
  .bt-print-area .bt-label {
    width: 1.97in; height: 2.95in;
    page-break-inside: avoid; break-inside: avoid;
    margin: 0; padding: 0; box-sizing: border-box;
    transform: none !important;
  }
  @page { margin: 0; size: 1.97in 2.95in; }
}`;
  document.head.appendChild(el);
};

// ── Label Component (white bg, for printing) ──────────────────────────────────
const BrandTagLabel = ({ row }: { row: BrandTagRow }) => {
  const bcRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!bcRef.current || !row.jioCode) return;
    try {
      JsBarcode(bcRef.current, row.jioCode, {
        format: 'CODE128',
        width: 1,
        height: 28,
        displayValue: true,
        text: row.sku,
        fontSize: 7,
        font: 'JetBrains Mono, monospace',
        margin: 0,
        textMargin: 1,
      });
    } catch (_) { /* invalid barcode value */ }
  }, [row.jioCode, row.sku]);

  const brandText = row.brand.replace(/^BRAND NAME:\s*/i, '').trim() || row.brand;
  const productText = row.product.replace(/^PRODUCT DESC:\s*/i, '').trim() || row.product;

  return (
    <div
      className="bt-label"
      style={{
        width: 189, height: 283, display: 'flex', flexDirection: 'row',
        fontFamily: "'Inter', sans-serif", border: '1px solid #ccc',
        boxSizing: 'border-box', overflow: 'hidden',
        background: '#fff', color: '#000',
      }}
    >
      {/* Main content area */}
      <div style={{
        flex: 1, padding: '5px 5px 3px 5px',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ fontWeight: 700, fontSize: '7.5pt', lineHeight: 1.25, marginBottom: 1 }}>BRAND NAME: {brandText}</div>
        <div style={{ fontWeight: 700, fontSize: '7pt', lineHeight: 1.25, fontFamily: T.mono, marginBottom: 1 }}>SKU: {row.sku}</div>
        <div style={{ fontSize: '6.5pt', lineHeight: 1.2, marginBottom: 1 }}>PRODUCT DESC: {productText}</div>
        <div style={{ fontSize: '6pt', lineHeight: 1.2, wordWrap: 'break-word', overflowWrap: 'break-word', marginBottom: 1 }}>{row.qty}</div>
        <div style={{ fontSize: '6.5pt', lineHeight: 1.25, marginBottom: 1 }}>SIZE: {row.size}</div>
        <div style={{ fontSize: '6.5pt', lineHeight: 1.25, marginBottom: 1 }}>COLOR: {row.color}</div>
        <div style={{ fontWeight: 700, fontSize: '7pt', lineHeight: 1.25, marginBottom: 1 }}>MRP: {fmtMrp(row.mrp)}</div>
        <div style={{ fontSize: '5.5pt', lineHeight: 1.15, wordWrap: 'break-word', overflowWrap: 'break-word', marginBottom: 1, color: '#333' }}>
          MKTD & DIST. BY: {row.mktd}
        </div>
        <div style={{ fontSize: '6pt', lineHeight: 1.2, fontFamily: T.mono, marginBottom: 2 }}>JIO CODE: {row.jioCode}</div>
        <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'center' }}>
          <svg ref={bcRef} style={{ maxWidth: '95%', height: 32 }} />
        </div>
      </div>
      {/* Right EAN strip */}
      <div style={{
        width: 28, minWidth: 28, background: '#f0f0f0',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderLeft: '1px solid #ddd',
      }}>
        <span style={{
          writingMode: 'vertical-rl' as const,
          transform: 'rotate(180deg)',
          whiteSpace: 'nowrap',
          fontWeight: 700, fontSize: '8pt', fontFamily: T.mono, color: '#333',
          letterSpacing: 0.5,
        }}>
          EAN: {row.sku}
        </span>
      </div>
    </div>
  );
};

// ── Add / Edit Modal ───────────────────────────────────────────────────────────
const MODAL_FIELDS: { key: keyof BrandTagRow; label: string; type?: string; multiline?: boolean }[] = [
  { key: 'brand', label: 'Brand Name' },
  { key: 'ean', label: 'EAN' },
  { key: 'sku', label: 'SKU' },
  { key: 'product', label: 'Product Description' },
  { key: 'qty', label: 'Includes / QTY', multiline: true },
  { key: 'size', label: 'Size' },
  { key: 'color', label: 'Color' },
  { key: 'mrp', label: 'MRP', type: 'number' },
  { key: 'mktd', label: 'MKTD & DIST. BY', multiline: true },
  { key: 'jioCode', label: 'Jio Code' },
];

const BrandTagModal = ({
  title,
  initial,
  onSave,
  onClose,
}: {
  title: string;
  initial: BrandTagRow;
  onSave: (row: BrandTagRow) => void;
  onClose: () => void;
}) => {
  const [form, setForm] = useState<BrandTagRow>({ ...initial });
  const set = (k: keyof BrandTagRow, v: string | number) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 200, backdropFilter: 'blur(8px)', padding: 8,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'rgba(18,22,31,.95)', border: `1px solid ${T.bd2}`,
          borderRadius: 12, width: 520, maxWidth: '100%', maxHeight: '90vh',
          overflowY: 'auto', boxShadow: '0 16px 48px rgba(0,0,0,.5)',
          backdropFilter: 'blur(12px)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '12px 16px', borderBottom: `1px solid ${T.bd}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ color: T.tx, fontSize: 14, fontWeight: 600 }}>{title}</span>
          <button onClick={onClose} style={{ ...btnGhost, ...btnSm }}>Close</button>
        </div>
        {/* Fields */}
        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {MODAL_FIELDS.map(f => (
            <div key={f.key}>
              <label style={fLabel}>{f.label}</label>
              {f.multiline ? (
                <textarea
                  rows={2}
                  style={{ ...inp, width: '100%', resize: 'vertical' }}
                  value={String(form[f.key])}
                  onChange={e => set(f.key, f.type === 'number' ? Number(e.target.value) : e.target.value)}
                />
              ) : (
                <input
                  type={f.type || 'text'}
                  style={{ ...inp, width: '100%' }}
                  value={String(form[f.key])}
                  onChange={e => set(f.key, f.type === 'number' ? Number(e.target.value) : e.target.value)}
                />
              )}
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button style={btnGhost} onClick={onClose}>Cancel</button>
            <button style={btnPrimary} onClick={() => { const bad = validateRow(form); if (bad) { alert(`"${bad}" is required. Please fill all fields.`); return; } onSave(form); }}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Main Component ─────────────────────────────────────────────────────────────
export default function BrandTagPrinter() {
  const [rows, setRows] = useState<BrandTagRow[]>([sampleRow()]);
  const [search, setSearch] = useState('');
  const [sizeFilter, setSizeFilter] = useState('');
  const [colorFilter, setColorFilter] = useState('');
  const [modalRow, setModalRow] = useState<BrandTagRow | null>(null);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [selectAll, setSelectAll] = useState(false);
  const [globalCopies, setGlobalCopies] = useState(1);
  const [printLabels, setPrintLabels] = useState<BrandTagRow[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // Inject print CSS once
  useEffect(() => { ensurePrintCSS(); }, []);

  // Trigger browser print after labels mount
  useEffect(() => {
    if (printLabels.length === 0) return;
    const t = setTimeout(() => {
      window.print();
      setPrintLabels([]);
    }, 400);
    return () => clearTimeout(t);
  }, [printLabels]);

  // Auto-populated filter options
  const uniqueSizes = useMemo(() => [...new Set(rows.map(r => r.size).filter(Boolean))].sort(), [rows]);
  const uniqueColors = useMemo(() => [...new Set(rows.map(r => r.color).filter(Boolean))].sort(), [rows]);

  // Filter rows (AND logic: search + size + color)
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return rows.filter(r => {
      if (q && ![r.brand, r.ean, r.sku, r.product, r.color, r.size, r.jioCode, r.qty]
        .some(v => v.toLowerCase().includes(q))) return false;
      if (sizeFilter && r.size !== sizeFilter) return false;
      if (colorFilter && r.color !== colorFilter) return false;
      return true;
    });
  }, [rows, search, sizeFilter, colorFilter]);

  // ── Import Excel ──
  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json: any[] = XLSX.utils.sheet_to_json(ws);
        const imported: BrandTagRow[] = json.map(d => ({
          id: uid(),
          brand: String(d['BRAND NAME'] ?? ''),
          ean: String(d['EAN'] ?? ''),
          sku: String(d['SKU'] ?? ''),
          qty: String(d['QTY'] ?? ''),
          mrp: Number(d['MRP']) || 0,
          size: String(d['SIZE'] ?? ''),
          product: String(d['PRODUCT'] ?? ''),
          color: String(d['Color'] ?? ''),
          mktd: String(d['MKTD & DIST. BY'] ?? ''),
          jioCode: String(d['Jio Code'] ?? ''),
          copies: Number(d['COPIES']) || 0,
        }));
        if (imported.length === 0) {
          alert('No rows found. Check that column headers match the expected format.');
          return;
        }
        // Validate all rows - reject file if any row has missing data
        const errors: string[] = [];
        imported.forEach((r, i) => {
          const bad = validateRow(r);
          if (bad) errors.push(`Row ${i + 1} (SKU: ${r.sku || 'empty'}): missing "${bad}"`);
        });
        if (errors.length > 0) {
          alert(`Import rejected — ${errors.length} row(s) have missing data:\n\n${errors.slice(0, 10).join('\n')}${errors.length > 10 ? `\n...and ${errors.length - 10} more` : ''}\n\nFix the Excel file and re-import.`);
          return;
        }
        setRows(prev => [...prev, ...imported]);
      } catch (_) {
        alert('Failed to parse Excel file. Ensure it is a valid .xlsx / .xls / .csv file.');
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }, []);

  // ── Export Excel ──
  const handleExport = useCallback(() => {
    const data = rows.map(r => ({
      'BRAND NAME': r.brand,
      'EAN': r.ean,
      'SKU': r.sku,
      'QTY': r.qty,
      'MRP': r.mrp,
      'SIZE': r.size,
      'PRODUCT': r.product,
      'Color': r.color,
      'MKTD & DIST. BY': r.mktd,
      'Jio Code': r.jioCode,
      'COPIES': r.copies,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Brand Tags');
    XLSX.writeFile(wb, 'brand_tags_export.xlsx');
  }, [rows]);

  // ── Row Mutations ──
  const updateCopies = useCallback((id: string, copies: number) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, copies: Math.max(0, copies) } : r));
  }, []);

  const deleteRow = useCallback((id: string, sku: string) => {
    if (!window.confirm(`Delete SKU: ${sku || 'this row'}?`)) return;
    setRows(prev => prev.filter(r => r.id !== id));
  }, []);

  // ── Modal Open/Save ──
  const openAdd = useCallback(() => {
    setModalMode('add');
    setModalRow(blankRow());
  }, []);

  const openEdit = useCallback((row: BrandTagRow) => {
    setModalMode('edit');
    setModalRow({ ...row });
  }, []);

  const handleModalSave = useCallback((updated: BrandTagRow) => {
    if (modalMode === 'add') {
      setRows(prev => [...prev, { ...updated, id: uid() }]);
    } else {
      setRows(prev => prev.map(r => r.id === updated.id ? updated : r));
    }
    setModalRow(null);
  }, [modalMode]);

  // ── Print Handlers ──
  const doPrint = useCallback((labels: BrandTagRow[]) => {
    if (labels.length === 0) {
      alert('No labels to print. Set COPIES > 0 for the rows you want to print.');
      return;
    }
    setPrintLabels(labels);
  }, []);

  const printSingle = useCallback((row: BrandTagRow) => {
    const bad = validateRow(row);
    if (bad) { alert(`Cannot print — "${bad}" is missing for SKU: ${row.sku || 'empty'}`); return; }
    setPrintLabels([row]);
  }, []);

  const printTestLabel = useCallback(() => {
    const s = rows[0] || sampleRow();
    setPrintLabels([s]);
  }, [rows]);

  const printSelected = useCallback(() => {
    const labels: BrandTagRow[] = [];
    const badRows: string[] = [];
    rows.forEach(r => {
      if (r.copies <= 0) return;
      const bad = validateRow(r);
      if (bad) { badRows.push(`${r.sku || 'empty'}: missing "${bad}"`); return; }
      for (let i = 0; i < r.copies; i++) labels.push(r);
    });
    if (badRows.length > 0) { alert(`Cannot print — incomplete data:\n${badRows.join('\n')}`); return; }
    doPrint(labels);
  }, [rows, doPrint]);

  // ── Select All / Set All Copies ──
  const handleSelectAll = useCallback((checked: boolean) => {
    setSelectAll(checked);
    setRows(prev => prev.map(r => ({ ...r, copies: checked ? globalCopies : 0 })));
  }, [globalCopies]);

  const handleSetAllCopies = useCallback(() => {
    setRows(prev => prev.map(r => ({ ...r, copies: globalCopies })));
    setSelectAll(globalCopies > 0);
  }, [globalCopies]);

  // Total label count
  const totalLabels = useMemo(() => rows.reduce((s, r) => s + r.copies, 0), [rows]);

  return (
    <div style={{ fontFamily: T.sans, color: T.tx, minHeight: '100vh' }}>
      {/* ── Hidden Print Area ── */}
      {printLabels.length > 0 && (
        <div
          className="bt-print-area"
          style={{ position: 'fixed', top: 0, left: 0, zIndex: 9999, background: '#fff' }}
        >
          {printLabels.map((r, i) => <BrandTagLabel key={`pl-${i}`} row={r} />)}
        </div>
      )}

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: T.tx, marginRight: 8 }}>Brand Tag Printer</span>
        <button style={btnPrimary} onClick={openAdd}>+ Add SKU</button>
        <button style={{ ...btnGhost, color: T.yl, borderColor: 'rgba(251,191,36,.2)' }} onClick={printTestLabel}>Test Print</button>
        <button
          style={{ ...btnPrimary, background: `linear-gradient(135deg, ${T.gr}cc, ${T.gr}99)` }}
          onClick={printSelected}
        >
          Print Selected
        </button>
        <button style={btnGhost} onClick={() => fileRef.current?.click()}>Import Excel</button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          style={{ display: 'none' }}
          onChange={handleImport}
        />
        <button style={btnGhost} onClick={handleExport}>Export Excel</button>
      </div>

      {/* ── Search + Filters + Select All ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <input
          type="text"
          placeholder="Search brand, SKU, EAN, product..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...inp, width: 240, flex: 'none' }}
        />
        <select
          value={sizeFilter}
          onChange={e => setSizeFilter(e.target.value)}
          style={{ ...inp, width: 100, flex: 'none', cursor: 'pointer' }}
        >
          <option value="">All Sizes</option>
          {uniqueSizes.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={colorFilter}
          onChange={e => setColorFilter(e.target.value)}
          style={{ ...inp, width: 120, flex: 'none', cursor: 'pointer' }}
        >
          <option value="">All Colors</option>
          {uniqueColors.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {/* Select All + Set All Copies */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 11, color: T.tx2, cursor: 'pointer', userSelect: 'none',
          }}>
            <input
              type="checkbox"
              checked={selectAll}
              onChange={e => handleSelectAll(e.target.checked)}
              style={{ accentColor: T.ac }}
            />
            Select All
          </label>
          <input
            type="number"
            min={0}
            value={globalCopies}
            onChange={e => setGlobalCopies(Math.max(0, Number(e.target.value)))}
            style={{ ...inp, width: 54, flex: 'none', textAlign: 'center', fontFamily: T.mono }}
          />
          <button style={{ ...btnGhost, ...btnSm }} onClick={handleSetAllCopies}>Set All Copies</button>
        </div>
      </div>

      {/* ── Data Table ── */}
      <div style={{ overflowX: 'auto', border: `1px solid ${T.bd}`, borderRadius: T.r, background: T.s }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              {['Brand', 'EAN', 'SKU', 'QTY', 'MRP', 'Size', 'Product', 'Color', 'Jio Code', 'Copies', 'Actions'].map(h => (
                <th key={h} style={thS}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={11} style={{ ...tdS, textAlign: 'center', color: T.tx3, padding: 24 }}>
                  No rows found. Add SKUs or import an Excel file.
                </td>
              </tr>
            )}
            {filtered.map(row => (
              <tr
                key={row.id}
                style={{ transition: 'background .15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = T.s2; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                <td style={{ ...tdS, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.brand}>
                  {row.brand}
                </td>
                <td style={{ ...tdS, fontFamily: T.mono, fontSize: 10 }}>{row.ean}</td>
                <td style={{ ...tdS, fontFamily: T.mono, fontSize: 10, fontWeight: 600 }}>{row.sku}</td>
                <td style={{ ...tdS, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.qty}>
                  {row.qty}
                </td>
                <td style={{ ...tdS, fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtMrp(row.mrp)}</td>
                <td style={{ ...tdS, textAlign: 'center' }}>{row.size}</td>
                <td style={{ ...tdS, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.product}>
                  {row.product}
                </td>
                <td style={tdS}>{row.color}</td>
                <td style={{ ...tdS, fontFamily: T.mono, fontSize: 10 }}>{row.jioCode}</td>
                <td style={tdS}>
                  <input
                    type="number"
                    min={0}
                    value={row.copies}
                    onChange={e => updateCopies(row.id, Number(e.target.value))}
                    style={{
                      ...inp, width: 50, textAlign: 'center',
                      padding: '3px 4px', fontSize: 11, fontFamily: T.mono,
                    }}
                  />
                </td>
                <td style={{ ...tdS, whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <button style={{ ...btnGhost, ...btnSm }} onClick={() => openEdit(row)}>Edit</button>
                    <button
                      style={{ ...btnGhost, ...btnSm, color: T.bl, borderColor: 'rgba(96,165,250,.2)' }}
                      onClick={() => printSingle(row)}
                    >
                      Print BT
                    </button>
                    <button style={{ ...btnDanger, ...btnSm }} onClick={() => deleteRow(row.id, row.sku)}>Del</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Summary Footer ── */}
      <div style={{ marginTop: 8, fontSize: 11, color: T.tx3 }}>
        {filtered.length} of {rows.length} row{rows.length !== 1 ? 's' : ''} shown
        {totalLabels > 0 && (
          <span style={{ marginLeft: 12, color: T.tx2 }}>
            Labels to print: <strong style={{ color: T.gr }}>{totalLabels}</strong>
          </span>
        )}
      </div>

      {/* ── Add / Edit Modal ── */}
      {modalRow && (
        <BrandTagModal
          title={modalMode === 'add' ? 'Add New SKU' : `Edit: ${modalRow.sku || 'SKU'}`}
          initial={modalRow}
          onSave={handleModalSave}
          onClose={() => setModalRow(null)}
        />
      )}
    </div>
  );
}
