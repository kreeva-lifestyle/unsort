/* eslint-disable */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://ulphprdnswznfztawbvg.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVscGhwcmRuc3d6bmZ6dGF3YnZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNjE4NzYsImV4cCI6MjA4OTkzNzg3Nn0.RRNY3KQhYnkJzSfh-GRoTCgdhDQNhE7kJJrpTq2n_K0');

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

const btnSm: React.CSSProperties = { padding: '3px 7px', fontSize: 10, borderRadius: 4, border: `1px solid ${T.bd2}`, cursor: 'pointer', fontFamily: "'Inter',sans-serif", fontWeight: 500, color: T.tx2, background: 'rgba(26,31,46,.5)', whiteSpace: 'nowrap' };
const inp: React.CSSProperties = {
  background: 'rgba(26,31,46,.8)', border: `1px solid ${T.bd2}`, borderRadius: 6,
  color: T.tx, fontFamily: T.sans, fontSize: 12, padding: '7px 10px',
  outline: 'none', boxSizing: 'border-box', transition: 'border-color .2s',
};
const thS: React.CSSProperties = {
  fontSize: 10, color: T.tx3, padding: '8px 10px', textAlign: 'left',
  fontWeight: 600, borderBottom: `1px solid ${T.bd}`, background: T.s2,
  whiteSpace: 'nowrap', fontFamily: T.sans,
};
const tdS: React.CSSProperties = { padding: '8px 10px', fontSize: 12, borderBottom: `1px solid ${T.bd}`, color: T.tx, fontFamily: T.sans };
const fLabel: React.CSSProperties = { fontSize: 11, color: T.tx3, marginBottom: 4, display: 'block', fontWeight: 500, fontFamily: T.sans };

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

// ── Print function: renders labels into a new window for clean printing ───────
const printLabelsInWindow = (labels: BrandTagRow[]) => {
  const win = window.open('', '_blank', 'width=300,height=500');
  if (!win) { alert('Popup blocked. Allow popups for this site.'); return; }

  const html = labels.map(r => {
    const brand = r.brand.replace(/^BRAND NAME:\s*/i, '').trim().toUpperCase();
    const product = r.product.replace(/^PRODUCT DESC:\s*/i, '').trim();
    const qty = r.qty.replace(/^INCLUDES:\s*/i, '').trim();
    const mrp = '\u20B9' + r.mrp.toLocaleString('en-IN');
    return `<div class="label">
  <div class="main">
    <div class="row b" style="font-size:9pt">BRAND NAME: ${brand}</div>
    <div class="row b" style="font-size:8.5pt">SKU: ${r.sku}</div>
    <div class="row" style="font-size:7.5pt">PRODUCT DESC: ${product}</div>
    <div class="row" style="font-size:7pt">INCLUDES: ${qty}</div>
    <div class="row" style="font-size:7.5pt">SIZE: ${r.size}</div>
    <div class="row" style="font-size:7.5pt">COLOR: ${r.color}</div>
    <div class="row b" style="font-size:8.5pt">MRP: ${mrp}</div>
    <div class="row sm">MKTD &amp; DIST. BY: ${r.mktd}</div>
    <div class="row" style="font-size:7pt;font-family:monospace">JIO CODE: ${r.jioCode}</div>
    <div class="barcode"><svg id="bc-${r.id}"></svg></div>
  </div>
  <div class="ean"><span>EAN: ${r.sku}</span></div>
</div>`;
  }).join('');

  win.document.write(`<!DOCTYPE html><html><head>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,Helvetica,sans-serif;background:#fff;color:#000}
.label{width:1.97in;height:2.97in;display:flex;overflow:hidden;page-break-after:always}
.main{flex:1;padding:6px 7px 4px;display:flex;flex-direction:column}
.row{line-height:1.35;margin-bottom:2px}
.b{font-weight:700}
.sm{font-size:6pt;line-height:1.25;color:#222}
.barcode{margin-top:auto;text-align:center;padding:4px 0 2px}
.barcode svg{width:100%;height:36px}
.ean{width:26px;min-width:26px;background:#e8e8e8;display:flex;align-items:center;justify-content:center}
.ean span{writing-mode:vertical-rl;transform:rotate(180deg);white-space:nowrap;font-weight:900;font-size:9pt;font-family:Arial,sans-serif;color:#000;letter-spacing:1px}
@media print{
  @page{margin:0;size:1.97in 2.97in}
  body{margin:0}
  .label{width:100%;height:100%;border:none}
}
@media screen{.label{border:1px solid #ccc;margin:8px auto}}
</style>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
</head><body>${html}
<script>
document.querySelectorAll('.barcode svg').forEach(function(svg){
  var id=svg.id.replace('bc-','');
  var row=${JSON.stringify(labels.map(r=>({id:r.id,jio:r.jioCode,sku:r.sku})))}.find(function(r){return r.id===id});
  if(row&&row.jio)try{JsBarcode(svg,row.jio,{format:'CODE128',width:1.5,height:34,displayValue:true,text:row.sku,fontSize:8,font:'Arial',margin:0,textMargin:1})}catch(e){}
});
setTimeout(function(){window.print()},600);
<\/script></body></html>`);
  win.document.close();
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
  const [rows, setRows] = useState<BrandTagRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState('');
  const [search, setSearch] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [sizeFilter, setSizeFilter] = useState('');
  const [colorFilter, setColorFilter] = useState('');
  const [modalRow, setModalRow] = useState<BrandTagRow | null>(null);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [globalCopies, setGlobalCopies] = useState(1);
  const fileRef = useRef<HTMLInputElement>(null);

  // Fetch from Supabase + realtime
  const fetchRows = useCallback(async () => {
    // Supabase default limit is 1000 - fetch ALL rows by paginating
    const allRows: any[] = [];
    const pageSize = 1000;
    let from = 0;
    let hasMore = true;
    while (hasMore) {
      const { data } = await supabase.from('brand_tags').select('*').order('created_at', { ascending: false }).range(from, from + pageSize - 1);
      if (data && data.length > 0) { allRows.push(...data); from += pageSize; }
      if (!data || data.length < pageSize) hasMore = false;
    }
    setRows(allRows.map(d => ({ id: d.id, brand: d.brand, ean: d.ean, sku: d.sku, qty: d.qty, mrp: Number(d.mrp), size: d.size, product: d.product, color: d.color, mktd: d.mktd, jioCode: d.jio_code, copies: d.copies })));
  }, []);
  useEffect(() => {
    fetchRows();
    const ch = supabase.channel('bt-sync').on('postgres_changes', { event: '*', schema: 'public', table: 'brand_tags' }, fetchRows).subscribe();

    // Resume interrupted import from localStorage queue
    const queueKey = 'bt_import_queue';
    const saved = localStorage.getItem(queueKey);
    if (saved) {
      try {
        const q = JSON.parse(saved);
        if (q.data && q.startIdx < q.total) {
          const remaining = q.data.slice(q.startIdx);
          if (remaining.length > 0 && confirm(`Found interrupted import: ${q.startIdx} of ${q.total} done. Resume remaining ${remaining.length} rows?`)) {
            (async () => {
              setImporting(true);
              const batchSize = 500;
              for (let i = 0; i < remaining.length; i += batchSize) {
                const batch = remaining.slice(i, i + batchSize);
                await supabase.from('brand_tags').upsert(batch, { onConflict: 'ean,sku,size', ignoreDuplicates: false });
                const done = q.startIdx + Math.min(i + batchSize, remaining.length);
                setImportProgress(`${done} / ${q.total}`);
                localStorage.setItem(queueKey, JSON.stringify({ ...q, startIdx: done }));
              }
              localStorage.removeItem(queueKey);
              setImporting(false); setImportProgress('');
              alert('Resumed import complete!');
              fetchRows();
            })();
          } else {
            localStorage.removeItem(queueKey);
          }
        } else {
          localStorage.removeItem(queueKey);
        }
      } catch { localStorage.removeItem(queueKey); }
    }

    return () => { supabase.removeChannel(ch); };
  }, [fetchRows]);

  // Auto-populated filter options
  const uniqueBrands = useMemo(() => [...new Set(rows.map(r => r.brand.replace(/^BRAND NAME:\s*/i, '').trim()).filter(Boolean))].sort(), [rows]);
  const uniqueSizes = useMemo(() => [...new Set(rows.map(r => r.size).filter(Boolean))].sort(), [rows]);
  const uniqueColors = useMemo(() => [...new Set(rows.map(r => r.color).filter(Boolean))].sort(), [rows]);

  // Filter rows (AND logic: search + size + color)
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return rows.filter(r => {
      if (q && ![r.brand, r.ean, r.sku, r.product, r.color, r.size, r.jioCode, r.qty]
        .some(v => v.toLowerCase().includes(q))) return false;
      if (brandFilter && !r.brand.toLowerCase().includes(brandFilter.toLowerCase())) return false;
      if (sizeFilter && r.size !== sizeFilter) return false;
      if (colorFilter && r.color !== colorFilter) return false;
      return true;
    });
  }, [rows, search, brandFilter, sizeFilter, colorFilter]);

  // ── Import Excel ──
  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
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
        // Smart import with queue persistence
        const toUpsert = imported.map(r => ({
          brand: r.brand, ean: r.ean, sku: r.sku, qty: r.qty, mrp: r.mrp,
          size: r.size, product: r.product, color: r.color, mktd: r.mktd,
          jio_code: r.jioCode, copies: r.copies,
          updated_at: new Date().toISOString(),
        }));

        // Save queue to localStorage so refresh can resume
        const queueKey = 'bt_import_queue';
        localStorage.setItem(queueKey, JSON.stringify({ data: toUpsert, startIdx: 0, total: toUpsert.length }));

        // Warn on refresh during import
        const beforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); return ''; };
        window.addEventListener('beforeunload', beforeUnload);
        setImporting(true);

        const batchSize = 500;
        let failed = 0;
        for (let i = 0; i < toUpsert.length; i += batchSize) {
          const batch = toUpsert.slice(i, i + batchSize);
          const { error } = await supabase.from('brand_tags')
            .upsert(batch, { onConflict: 'ean,sku,size', ignoreDuplicates: false });
          if (error) failed += batch.length;
          const done = Math.min(i + batchSize, toUpsert.length);
          setImportProgress(`${done} / ${toUpsert.length}`);
          // Update queue progress so resume knows where to start
          localStorage.setItem(queueKey, JSON.stringify({ data: toUpsert, startIdx: done, total: toUpsert.length }));
        }

        localStorage.removeItem(queueKey);
        window.removeEventListener('beforeunload', beforeUnload);
        setImporting(false);
        setImportProgress('');
        alert(`Import complete! ${toUpsert.length} rows processed.${failed > 0 ? ` ${failed} failed.` : ''}`);
        fetchRows();
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
    const c = Math.max(0, copies);
    setRows(prev => prev.map(r => r.id === id ? { ...r, copies: c } : r));
    supabase.from('brand_tags').update({ copies: c }).eq('id', id);
  }, []);

  const deleteRow = useCallback((id: string, sku: string) => {
    if (!window.confirm(`Delete SKU: ${sku || 'this row'}?`)) return;
    supabase.from('brand_tags').delete().eq('id', id).then(() => fetchRows());
  }, [fetchRows]);

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
    const dbRow = { brand: updated.brand, ean: updated.ean, sku: updated.sku, qty: updated.qty, mrp: updated.mrp, size: updated.size, product: updated.product, color: updated.color, mktd: updated.mktd, jio_code: updated.jioCode, copies: updated.copies };
    if (modalMode === 'add') {
      supabase.from('brand_tags').insert(dbRow).then(() => fetchRows());
    } else {
      supabase.from('brand_tags').update({ ...dbRow, updated_at: new Date().toISOString() }).eq('id', updated.id).then(() => fetchRows());
    }
    setModalRow(null);
  }, [modalMode, fetchRows]);

  // ── Print Handlers ──
  const printSingle = useCallback((row: BrandTagRow) => {
    const bad = validateRow(row);
    if (bad) { alert(`Cannot print — "${bad}" is missing for SKU: ${row.sku || 'empty'}`); return; }
    printLabelsInWindow([row]);
  }, []);

  const printTestLabel = useCallback(() => {
    const s = rows[0] || sampleRow();
    printLabelsInWindow([s]);
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
    if (labels.length === 0) { alert('Set COPIES > 0 for rows you want to print.'); return; }
    printLabelsInWindow(labels);
  }, [rows]);

  // ── Select All / Set All Copies ──
  const handleSetAllCopies = useCallback(async () => {
    setRows(prev => prev.map(r => ({ ...r, copies: globalCopies })));
    const ids = rows.map(r => r.id);
    for (const id of ids) await supabase.from('brand_tags').update({ copies: globalCopies }).eq('id', id);
  }, [globalCopies, rows]);

  // Total label count
  const [btPage, setBtPage] = useState(0);
  const [btPerPage, setBtPerPage] = useState(25);
  const btTotalPages = Math.ceil(filtered.length / btPerPage);
  const btPaged = filtered.slice(btPage * btPerPage, (btPage + 1) * btPerPage);
  useEffect(() => { setBtPage(0); }, [search, brandFilter, sizeFilter, colorFilter]);

  return (
    <div style={{ fontFamily: T.sans, color: T.tx, padding: '16px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <span style={{ fontSize: 14, fontWeight: 600, color: T.tx }}>Brand Tags</span>
          <span style={{ fontSize: 12, fontWeight: 500, color: T.tx3, marginLeft: 10 }}>{filtered.length} of {rows.length} rows</span>
          {importing && <span style={{ fontSize: 11, color: T.yl, marginLeft: 10, fontWeight: 600 }}>Importing {importProgress}...</span>}
        </div>
        <div style={{ display: 'flex', gap: 5 }}>
          <button style={btnGhost} onClick={() => fileRef.current?.click()}>Import</button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleImport} />
          <button style={btnGhost} onClick={handleExport}>Export</button>
          <button style={{ ...btnGhost, color: T.yl, borderColor: 'rgba(251,191,36,.15)' }} onClick={printTestLabel}>Test Print</button>
          <button style={{ ...btnPrimary, background: `linear-gradient(135deg,${T.gr}cc,${T.gr}88)` }} onClick={printSelected}>Print Selected</button>
          <button style={btnPrimary} onClick={openAdd}>+ Add SKU</button>
        </div>
      </div>
      <div style={{ background: T.s, border: '1px solid ' + T.bd, borderRadius: 10, padding: '10px 12px', marginBottom: 12, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <input type="text" placeholder="Search brand, SKU, EAN..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...inp, flex: 1, minWidth: 140, padding: '7px 10px' }} />
        <div style={{ width: 1, height: 24, background: T.bd2 }} />
        <select value={brandFilter} onChange={e => setBrandFilter(e.target.value)} style={{ ...inp, width: 'auto', minWidth: 110, padding: '7px 10px', cursor: 'pointer' }}><option value="">All brands</option>{uniqueBrands.map(b => <option key={b} value={b}>{b}</option>)}</select>
        <select value={sizeFilter} onChange={e => setSizeFilter(e.target.value)} style={{ ...inp, width: 'auto', minWidth: 90, padding: '7px 10px', cursor: 'pointer' }}><option value="">All sizes</option>{uniqueSizes.map(s => <option key={s} value={s}>{s}</option>)}</select>
        <select value={colorFilter} onChange={e => setColorFilter(e.target.value)} style={{ ...inp, width: 'auto', minWidth: 100, padding: '7px 10px', cursor: 'pointer' }}><option value="">All colors</option>{uniqueColors.map(c => <option key={c} value={c}>{c}</option>)}</select>
        <div style={{ width: 1, height: 24, background: T.bd2 }} />
        <input type="number" min={0} value={globalCopies} onChange={e => setGlobalCopies(Math.max(0, Number(e.target.value)))} style={{ ...inp, width: 44, textAlign: 'center', fontFamily: T.mono, padding: '5px' }} />
        <button style={btnGhost} onClick={handleSetAllCopies}>Set copies</button>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', border: `1px solid ${T.bd}`, borderRadius: 8, background: T.s, marginBottom: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead><tr>
            {['Brand', 'EAN', 'SKU', 'Includes', 'MRP', 'Size', 'Product', 'Color', 'Jio Code', 'Copies', ''].map(h => (
              <th key={h} style={thS}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={11} style={{ padding: 20, textAlign: 'center', color: T.tx3, fontSize: 11 }}>No rows. Import Excel or add SKUs.</td></tr>}
            {btPaged.map(row => (
              <tr key={row.id} style={{ transition: 'background .1s' }} onMouseEnter={e => { e.currentTarget.style.background = T.s2; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                <td style={tdS}>{row.brand.replace(/^BRAND NAME:\s*/i, '')}</td>
                <td style={tdS}>{row.ean}</td>
                <td style={{ ...tdS, fontWeight: 500 }}>{row.sku}</td>
                <td style={tdS}>{row.qty.replace(/^INCLUDES:\s*/i, '')}</td>
                <td style={{ ...tdS, whiteSpace: 'nowrap' }}>{fmtMrp(row.mrp)}</td>
                <td style={tdS}>{row.size}</td>
                <td style={tdS}>{row.product.replace(/^PRODUCT DESC:\s*/i, '')}</td>
                <td style={tdS}>{row.color}</td>
                <td style={tdS}>{row.jioCode}</td>
                <td style={tdS}><input type="number" min={0} value={row.copies} onChange={e => updateCopies(row.id, Number(e.target.value))} style={{ ...inp, width: 40, textAlign: 'center', padding: '2px', fontSize: 12 }} /></td>
                <td style={{ ...tdS, whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'flex', gap: 3 }}>
                    <button style={btnSm} onClick={() => openEdit(row)}>Edit</button>
                    <button style={{ ...btnSm, color: T.bl }} onClick={() => printSingle(row)}>Print</button>
                    <button style={{ ...btnSm, color: T.re }} onClick={() => deleteRow(row.id, row.sku)}>×</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10, fontSize: 11 }}>
        <select value={btPerPage} onChange={e => { setBtPerPage(Number(e.target.value)); setBtPage(0); }} style={{ ...inp, width: 'auto', padding: '3px 6px', fontSize: 10, cursor: 'pointer' }}><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select>
        <span style={{ color: T.tx3 }}>rows</span>
        {btTotalPages > 1 && <>
          <span onClick={() => setBtPage(Math.max(0, btPage - 1))} style={{ ...btnGhost, padding: '3px 8px', fontSize: 10, opacity: btPage === 0 ? 0.3 : 1, pointerEvents: btPage === 0 ? 'none' : 'auto' }}>Prev</span>
          <span style={{ color: T.tx3 }}>{btPage + 1} / {btTotalPages}</span>
          <span onClick={() => setBtPage(Math.min(btTotalPages - 1, btPage + 1))} style={{ ...btnGhost, padding: '3px 8px', fontSize: 10, opacity: btPage >= btTotalPages - 1 ? 0.3 : 1, pointerEvents: btPage >= btTotalPages - 1 ? 'none' : 'auto' }}>Next</span>
        </>}
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
