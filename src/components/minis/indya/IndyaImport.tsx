// Indya Import — fill the Stock column of Indya's Product Master Report from
// our own stock sheets, then export it back in the SAME format for re-upload.
//
// Import the Indya report (their .xls is really an HTML table — SheetJS reads
// it) plus any number of stock sheets, the way Odette Import takes many vendor
// files. Matching strips the size suffix from VendorSKU and uses the Size
// column instead (owner's rule), but the EXPORT carries Indya's original SKU,
// VendorSKU and Size back verbatim — their codes contain mistakes and must
// stay exactly as they were for a row to be findable on their side.
import { useState, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import { exportName, fileDate } from '../../../lib/exportName';
import { rowKey, fillRows, type IndyaRow, type StockRow, type Filled } from './indyaMatch';
import { parseIndyaSheet, parseStockSheet } from './indyaParse';
import IndyaResults from './IndyaResults';

export default function IndyaImport({ addToast }: { addToast: (m: string, t?: string) => void }) {
  const indyaRef = useRef<HTMLInputElement>(null);
  const stockRef = useRef<HTMLInputElement>(null);
  const [indyaFiles, setIndyaFiles] = useState<{ name: string; rows: IndyaRow[] }[]>([]);
  const [stockFiles, setStockFiles] = useState<{ name: string; rows: StockRow[]; sized: boolean; note: string }[]>([]);
  const [spreadDesign, setSpreadDesign] = useState(false);
  // Unstitched rows are ignored (owner's rule). Default: leave them out of the
  // export so Indya keeps its current figure; opt in to send 0 instead.
  const [zeroIgnored, setZeroIgnored] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Filled[] | null>(null);

  const allRows = useMemo(() => indyaFiles.flatMap(f => f.rows), [indyaFiles]);

  const importIndya = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    const added: typeof indyaFiles = [];
    for (const file of [...list]) {
      try {
        added.push({ name: file.name, rows: parseIndyaSheet(await file.arrayBuffer()) });
      } catch (e) { addToast(`${file.name}: ${friendlyError(e)}`, 'error'); }
    }
    if (added.length) {
      setIndyaFiles(prev => [...prev, ...added]);
      setResult(null);
      addToast(`${added.length} Indya sheet${added.length > 1 ? 's' : ''} loaded — ${added.reduce((s, f) => s + f.rows.length, 0)} rows`, 'success');
    }
    setBusy(false);
  };

  const importStock = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    const added: typeof stockFiles = [];
    for (const file of [...list]) {
      try {
        const p = parseStockSheet(await file.arrayBuffer());
        added.push({ name: file.name, ...p });
      } catch (e) { addToast(`${file.name}: ${friendlyError(e)}`, 'error'); }
    }
    if (added.length) {
      setStockFiles(prev => [...prev, ...added]);
      setResult(null);
      const unsized = added.filter(f => !f.sized).length;
      addToast(`${added.length} stock sheet${added.length > 1 ? 's' : ''} added${unsized ? ` — ${unsized} without a size column` : ''}`, unsized ? 'error' : 'success');
    }
    setBusy(false);
  };

  const compute = () => {
    if (!allRows.length) { addToast('Import the Indya sheet first', 'error'); return; }
    if (!stockFiles.length) { addToast('Import at least one stock sheet', 'error'); return; }
    const stock = stockFiles.flatMap(f => f.rows);
    const filled = fillRows(allRows, stock, spreadDesign);
    setResult(filled);
    const m = filled.filter(r => r.match === 'size').length;
    const d = filled.filter(r => r.match === 'design').length;
    const ig = filled.filter(r => r.match === 'ignored').length;
    const n = filled.length - m - d - ig;
    addToast(`${filled.length} rows — ${m} matched by size${d ? `, ${d} by design` : ''}, ${n} not found${ig ? `, ${ig} Unstitched ignored` : ''}`, m === 0 ? 'error' : 'success');
  };

  const exportXlsx = () => {
    if (!result?.length) { addToast('Nothing to export — compute first', 'error'); return; }
    // Indya's own four columns, their codes untouched, only Stock replaced.
    // Unstitched rows are dropped unless the owner asked for an explicit 0.
    const out = zeroIgnored ? result : result.filter(r => r.match !== 'ignored');
    if (!out.length) { addToast('Every row was ignored — nothing to export', 'error'); return; }
    const data = out.map(r => ({ SKU: r.sku, VendorSKU: r.vendorSku, Size: r.size, Stock: r.newStock }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Stock');
    XLSX.writeFile(wb, exportName('Indya-Stock', [fileDate()], 'xlsx'));
    const held = result.length - data.length;
    addToast(`Exported ${data.length} rows — upload this to Indya${held ? ` (${held} Unstitched left out, untouched)` : ''}`, 'success');
  };

  const stats = useMemo(() => {
    if (!result) return null;
    const size = result.filter(r => r.match === 'size').length;
    const design = result.filter(r => r.match === 'design').length;
    const ignored = result.filter(r => r.match === 'ignored').length;
    const none = result.length - size - design - ignored;
    const inStock = result.filter(r => r.newStock > 0).length;
    // Two Indya listings of one design (TF-343 and TF-343-XL both exist) get
    // the same figure — true, but worth saying so it is never a surprise.
    const seen = new Map<string, number>();
    for (const r of result) {
      if (r.match === 'ignored') continue;
      const k = rowKey(r.vendorSku, r.size);
      seen.set(k, (seen.get(k) || 0) + 1);
    }
    const shared = [...seen.values()].filter(n => n > 1).reduce((a, b) => a + b, 0);
    return { size, design, none, ignored, inStock, shared };
  }, [result]);

  const fileChip = (name: string, sub: string, onRemove: () => void, warn = false) => (
    <div key={name + sub} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, border: `1px solid ${warn ? 'oklch(0.78 0.18 75 / .3)' : T.bd}`, background: warn ? 'oklch(0.78 0.18 75 / .05)' : 'rgba(255,255,255,0.02)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: T.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
        <div style={{ fontSize: 9.5, color: warn ? T.yl : T.tx3, marginTop: 1 }}>{sub}</div>
      </div>
      <span onClick={onRemove} aria-label="Remove" style={{ cursor: 'pointer', color: T.tx3, fontSize: 15, lineHeight: 1, padding: '2px 4px' }}>&#215;</span>
    </div>
  );

  return (
    <div style={{ fontFamily: T.sans, color: T.tx }}>
      <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: 16, marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: T.tx3, lineHeight: 1.6, marginBottom: 12 }}>
          Fill Indya&rsquo;s stock column from our stock sheets. Codes are compared with the size suffix removed (TF-343-XL &rarr; TF-343) and the Size column used instead &mdash; but the exported file keeps Indya&rsquo;s original SKU, VendorSKU and Size exactly as they came.
        </div>

        <div className="challan-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={{ ...S.fLabel, display: 'block', marginBottom: 4 }}>1 · Indya sheet(s)</label>
            <input ref={indyaRef} type="file" accept=".xls,.xlsx,.csv,.htm,.html" multiple style={{ display: 'none' }}
              onChange={e => { importIndya(e.target.files); e.target.value = ''; }} />
            <button onClick={() => indyaRef.current?.click()} disabled={busy} style={{ ...S.btnGhost, width: '100%', minHeight: 40, color: T.ac2, border: `1px solid ${T.ac3}` }}>
              {indyaFiles.length ? `${allRows.length} rows loaded — add more` : 'Choose Product Master Report'}
            </button>
          </div>
          <div>
            <label style={{ ...S.fLabel, display: 'block', marginBottom: 4 }}>2 · Stock sheet(s)</label>
            <input ref={stockRef} type="file" accept=".xls,.xlsx,.csv" multiple style={{ display: 'none' }}
              onChange={e => { importStock(e.target.files); e.target.value = ''; }} />
            <button onClick={() => stockRef.current?.click()} disabled={busy} style={{ ...S.btnGhost, width: '100%', minHeight: 40, color: T.bl, border: '1px solid oklch(0.77 0.14 230 / .25)' }}>
              {stockFiles.length ? `${stockFiles.length} sheet${stockFiles.length > 1 ? 's' : ''} — add more` : 'Choose stock sheets'}
            </button>
          </div>
        </div>

        {(indyaFiles.length > 0 || stockFiles.length > 0) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
            {indyaFiles.map((f, i) => fileChip(f.name, `Indya · ${f.rows.length} rows`, () => { setIndyaFiles(p => p.filter((_, j) => j !== i)); setResult(null); }))}
            {stockFiles.map((f, i) => fileChip(f.name, `Stock · ${f.rows.length} rows · ${f.note}`, () => { setStockFiles(p => p.filter((_, j) => j !== i)); setResult(null); }, !f.sized))}
          </div>
        )}

        {stockFiles.some(f => !f.sized) && (
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={spreadDesign} onChange={e => { setSpreadDesign(e.target.checked); setResult(null); }} style={{ marginTop: 2 }} />
            <span style={{ fontSize: 10.5, color: T.tx2, lineHeight: 1.5 }}>
              Use design-level stock for every size when a sheet has no size column.
              <b style={{ color: T.yl }}> Off by default</b> — a design total copied onto each size tells Indya there is more stock than exists.
            </span>
          </label>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <button onClick={compute} disabled={busy || !allRows.length || !stockFiles.length}
            style={{ ...S.btnPrimary, minHeight: 40, flex: 1, minWidth: 150, opacity: busy || !allRows.length || !stockFiles.length ? 0.5 : 1 }}>
            {busy ? 'Reading…' : 'Match & fill stock'}
          </button>
          {result && <button onClick={exportXlsx} style={{ ...S.btnGhost, minHeight: 40, color: T.gr, border: '1px solid oklch(0.72 0.19 145 / .25)', background: 'oklch(0.72 0.19 145 / .06)' }}>Export for Indya</button>}
        </div>
      </div>

      {result && stats && <IndyaResults result={result} stats={stats} zeroIgnored={zeroIgnored} onZeroIgnored={setZeroIgnored} />}

    </div>
  );
}
