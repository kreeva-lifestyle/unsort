import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { numericKeyDown } from '../lib/numericInput';
import { printOrQueue } from '../lib/printQueue';
import { supabase } from '../lib/supabase';
import { useNotifications } from '../hooks/useNotifications';
import BrandTagModalNew from '../components/ui/BrandTagModal';
import ConfirmModal, { useConfirm } from '../components/ui/ConfirmModal';
import ActionSheet from '../components/ui/ActionSheet';
import { friendlyError } from '../lib/friendlyError';
import type { BrandTagInsert } from '../types/database';


// ── Design Tokens ──────────────────────────────────────────────────────────────
import { T, S, Icon } from '../lib/theme';
import { useBackClose } from '../hooks/useBackClose';
import { exportName, fileDate } from '../lib/exportName';
import { useModalLock } from '../hooks/useModalLock';
import { TAG_COLUMNS, toRow, blankRow, sampleRow, validateRow, fmtMrp, type BrandTagRow, type BrandTagDb } from '../components/brandtags/tagModel';
import { SIZE_OPTIONS, PRODUCT_OPTIONS, COLOR_OPTIONS, QTY_OPTIONS } from '../components/brandtags/tagOptions';
import { buildLabelsHtml } from '../components/brandtags/labelPrint';
import { matchOrderSheet, type OrderRow } from '../components/brandtags/orderSheet';
import { readSheet, saveSheet, rowsFromSheet, importProblems, importTags, importSummary } from '../components/brandtags/importTags';
import { useTagLive } from '../components/brandtags/useTagLive';
import { useCopies } from '../components/brandtags/useCopies';

const btnGhost: React.CSSProperties = S.btnGhost;
const btnSm: React.CSSProperties = { ...S.btnGhost, ...S.btnSm };
const inp: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.bd}`, borderRadius: 8,
  color: T.tx, fontFamily: T.sans, fontSize: 13, padding: '8px 12px', height: 36,
  outline: 'none', boxSizing: 'border-box', transition: T.transition,
};
const thS: React.CSSProperties = {
  fontSize: 10, color: T.tx3, padding: '11px 14px', textAlign: 'left',
  fontWeight: 600, borderBottom: `1px solid ${T.bd}`, background: 'rgba(255,255,255,0.015)',
  whiteSpace: 'nowrap', fontFamily: T.sans, textTransform: 'uppercase', letterSpacing: '0.1em',
};
const tdS: React.CSSProperties = { padding: '11px 14px', fontSize: 13, borderBottom: `1px solid ${T.bd}`, color: T.tx2, fontFamily: T.sans };

// ── Main Component ─────────────────────────────────────────────────────────────
export default function BrandTagPrinter() {
  const { addToast } = useNotifications();
  const { ask, modalProps: confirmModalProps } = useConfirm();
  // Server-side pagination + filtering
  const [rows, setRows] = useState<BrandTagRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  // refreshMsg removed — refresh moved inline
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState('');
  // Print-preview iframe (in-app, replaces popup window per audit P0)
  const [printHtml, setPrintHtml] = useState<string | null>(null);
  const [printCount, setPrintCount] = useState(0);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const printIframeRef = useRef<HTMLIFrameElement | null>(null);
  const openLabelPrint = useCallback((labels: BrandTagRow[]) => {
    if (labels.length === 0) return;
    setPrintCount(labels.length);
    setPrintHtml(buildLabelsHtml(labels));
  }, []);
  const [search, setSearch] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [sizeFilter, setSizeFilter] = useState('');
  const [modalRow, setModalRow] = useState<BrandTagRow | null>(null);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const fileRef = useRef<HTMLInputElement>(null);
  const orderFileRef = useRef<HTMLInputElement>(null);
  const [orderRows, setOrderRows] = useState<OrderRow[] | null>(null);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderLoadMsg, setOrderLoadMsg] = useState('');
  const [orderPage, setOrderPage] = useState(0);
  const [orderPerPage, setOrderPerPage] = useState(10);
  const [confirmDel, setConfirmDel] = useState<{ id: string; sku: string } | null>(null);
  // Phones hide the Actions column (.bt-actions-col); a row tap opens this
  // sheet instead so Edit / Print / Delete stay reachable.
  const [sheetRow, setSheetRow] = useState<BrandTagRow | null>(null);
  const [btPage, setBtPage] = useState(0);
  const [btPerPage, setBtPerPage] = useState(10);


  // Fetch current page from Supabase (server-side pagination)
  const fetchPage = useCallback(async () => {
    let query = supabase.from('brand_tags').select(TAG_COLUMNS, { count: 'estimated' });
    if (search) query = query.ilike('search_text', `%${search.toLowerCase().replace(/[%_]/g, '\\$&')}%`);
    if (brandFilter) query = query.ilike('brand', `%${brandFilter.replace(/[%_]/g, '\\$&')}%`);
    if (sizeFilter) query = query.eq('size', sizeFilter);
    const from = btPage * btPerPage;
    const { data, count, error } = await query.order('created_at', { ascending: false }).range(from, from + btPerPage - 1);
    if (error) { addToast(friendlyError(error), 'error'); setLoading(false); return; }
    if (data) setRows((data as BrandTagDb[]).map(toRow));
    if (count !== null) setTotalCount(count);
    setLoading(false);
  }, [btPage, btPerPage, search, brandFilter, sizeFilter, addToast]);
  useEffect(() => { fetchPage(); }, [fetchPage]);

  // Lock body scroll when any modal/popup is open
  useModalLock(!!modalRow || !!orderRows || !!confirmDel);
  useBackClose(!!orderRows, () => setOrderRows(null));
  useBackClose(!!modalRow, () => setModalRow(null));
  useBackClose(!!confirmDel, () => setConfirmDel(null));
  useBackClose(!!printHtml, () => setPrintHtml(null));

  // Copies + / − (saved once the taps stop) and live updates from other screens.
  const { bump, isBusy } = useCopies(setRows, addToast);
  useTagLive(setRows, setTotalCount, isBusy);

  // Debounce search to avoid hammering DB on every keystroke
  const searchTimeout = useRef<any>(null);
  const handleSearch = (val: string) => {
    setSearch(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => setBtPage(0), 300);
  };

  // Reset page on filter change
  useEffect(() => { setBtPage(0); }, [brandFilter, sizeFilter]);

  const [dynamicBrands, setDynamicBrands] = useState<string[]>([]);
  useEffect(() => {
    supabase.from('brands').select('name').eq('is_active', true).order('name').then(({ data }) => {
      setDynamicBrands((data || []).map((r: any) => r.name as string));
    });
  }, []);
  const brandOptions = dynamicBrands;
  const totalPages = Math.ceil(totalCount / btPerPage);

  // ── Import Excel (addToast in deps for fresh closure) ──
  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      // Warn on refresh during import
      const beforeUnload = (ev: BeforeUnloadEvent) => { ev.preventDefault(); return ''; };
      try {
        const json = await readSheet(evt.target?.result as ArrayBuffer);
        if (!json) { addToast('Excel file has no sheets', 'error'); return; }
        const imported = rowsFromSheet(json);
        if (imported.length === 0) {
          addToast('No rows found. Check that column headers match the expected format.', 'error');
          return;
        }
        // Validate all rows - reject file if any row has missing data
        const problems = importProblems(imported);
        if (problems.length > 0) {
          // Actionable error report — user can fix in Excel and re-import (audit P2)
          await saveSheet(problems, 'Import Errors', exportName('Brand-Tags-Import-Errors', [fileDate()], 'xlsx'));
          addToast(`Import rejected — ${problems.length} row(s) missing data. Error report downloaded.`, 'error');
          return;
        }
        window.addEventListener('beforeunload', beforeUnload);
        setImporting(true);
        const res = await importTags(imported, (done, total) => setImportProgress(`${done} / ${total}`));
        res.errors.forEach((msg, i) => addToast(`Batch ${res.failedBatches[i]} failed — ${msg}`, 'error'));
        addToast(res.failed > 0
          ? `Import done with errors: ${res.failed} of ${imported.length} rows failed (batch${res.failedBatches.length > 1 ? 'es' : ''} ${res.failedBatches.join(', ')}). Saved: ${importSummary(res)}.`
          : `Import complete — ${importSummary(res)}.`, res.failed > 0 ? 'error' : 'success');
        fetchPage();
      } catch (err: any) {
        const errMsg = err?.message || '';
        if (errMsg.toLowerCase().includes('column') || errMsg.toLowerCase().includes('header')) {
          addToast('Invalid columns. Expected headers: SKU, JIO, Brand, Size. Check your template.', 'error');
        } else if (errMsg.toLowerCase().includes('zip') || errMsg.toLowerCase().includes('format')) {
          addToast('File format unsupported. Use .xlsx, .xls, or .csv (not encrypted).', 'error');
        } else {
          addToast('Failed to parse Excel — ' + friendlyError(err), 'error');
        }
      } finally {
        window.removeEventListener('beforeunload', beforeUnload);
        setImporting(false);
        setImportProgress('');
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }, [addToast, fetchPage]);

  // ── Export Excel ──
  const handleExport = useCallback(async () => {
    if (rows.length === 0) { addToast('Nothing to export — add or import SKUs first', 'error'); return; }
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
    try {
      if (await saveSheet(data, 'Brand Tags', exportName('Brand-Tags', [fileDate()], 'xlsx'))) addToast(`Exported ${rows.length} brand tag${rows.length !== 1 ? 's' : ''}`, 'success');
    } catch (err) { addToast(friendlyError(err), 'error'); }
  }, [rows, addToast]);

  // ── Row Mutations ──

  const deleteRow = useCallback((id: string, sku: string) => {
    setConfirmDel({ id, sku });
  }, []);
  const actuallyDelete = useCallback(async () => {
    if (!confirmDel) return;
    const { id, sku } = confirmDel;
    setConfirmDel(null);
    const { error } = await supabase.from('brand_tags').delete().eq('id', id);
    if (error) { addToast(`Delete failed — ${friendlyError(error)}`, 'error'); return; }
    addToast(`Deleted ${sku}`, 'success');
    fetchPage();
  }, [confirmDel, addToast, fetchPage]);

  // ── Modal Open/Save ──
  const openAdd = useCallback(() => {
    setModalMode('add');
    setModalRow(blankRow());
  }, []);

  const openEdit = useCallback((row: BrandTagRow) => {
    setModalMode('edit');
    setModalRow({ ...row });
  }, []);

  // Resolves only after the write lands, so the modal's "Saving…" state is
  // real and a failed save keeps the form open instead of losing the edits.
  const handleModalSave = useCallback(async (updated: BrandTagRow): Promise<boolean> => {
    const dbRow: BrandTagInsert = { brand: updated.brand, ean: updated.ean, sku: updated.sku, qty: updated.qty, mrp: updated.mrp, size: updated.size, product: updated.product, color: updated.color, mktd: updated.mktd, jio_code: updated.jioCode, copies: updated.copies };
    const { error } = modalMode === 'add'
      ? await supabase.from('brand_tags').insert(dbRow)
      : await supabase.from('brand_tags').update({ ...dbRow, updated_at: new Date().toISOString() }).eq('id', updated.id);
    if (error) { addToast((modalMode === 'add' ? 'Save failed — ' : 'Update failed — ') + friendlyError(error), 'error'); return false; }
    addToast(`SKU ${updated.sku} ${modalMode === 'add' ? 'added' : 'updated'}`, 'success');
    fetchPage();
    setModalRow(null);
    return true;
  }, [modalMode, fetchPage, addToast]);

  // ── Print Handlers ──
  const printSingle = useCallback((row: BrandTagRow) => {
    const bad = validateRow(row);
    if (bad) { addToast(`Cannot print — "${bad}" is missing for SKU: ${row.sku || 'empty'}`, 'error'); return; }
    openLabelPrint([row]);
  }, [addToast]);

  // ── Order Sheet Import ──
  const handleOrderImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        setOrderLoading(true);
        setOrderLoadMsg('Parsing file...');
        const json = (await readSheet(evt.target?.result as ArrayBuffer)) || [];
        setOrderLoadMsg(`${json.length} rows parsed. Matching against master labels...`);
        const parsed = await matchOrderSheet(json);
        setOrderRows(parsed); setOrderPage(0);
        setOrderLoading(false); setOrderLoadMsg('');
      } catch (e: any) { addToast('Failed to parse order sheet — ' + friendlyError(e), 'error'); setOrderLoading(false); setOrderLoadMsg(''); }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }, [addToast]);

  const updateOrderCopies = (sku: string, brand: string, copies: number) => {
    setOrderRows(prev => prev ? prev.map(r => (r.sku === sku && r.brand === brand) ? { ...r, copies: Math.max(0, copies) } : r) : null);
  };

  const printOrderLabels = (items: OrderRow[]) => {
    const labels: BrandTagRow[] = [];
    items.forEach(r => {
      if (!r.found || !r.masterData || r.copies <= 0) return;
      for (let i = 0; i < r.copies; i++) labels.push({ ...r.masterData, brand: `BRAND NAME: ${r.brand}`, copies: 1 });
    });
    if (labels.length === 0) { addToast('No printable labels. Ensure SKUs exist in master data and copies > 0.', 'error'); return; }
    openLabelPrint(labels);
  };

  const printTestLabel = useCallback(() => {
    openLabelPrint([rows[0] || sampleRow()]);
  }, [rows]);


  // ── Select All / Set All Copies ──

  // Server-side pagination handles btPage/btPerPage - defined above

  return (
    <div className="page-pad" style={{ fontFamily: T.sans, color: T.tx, padding: '14px 16px' }}>
      {loading && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div className="spinner" />
      </div>}
      {!loading && <>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, color: T.tx3 }}>{totalCount} master tags · 1.97 × 2.97 in label · CODE128 barcode</div>
          {importing && <span style={{ fontSize: 10, color: T.yl, marginTop: 4, fontWeight: 600, display: 'block' }}>Importing {importProgress}...</span>}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {orderLoading && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, color: T.yl }}><span style={{ width: 10, height: 10, border: '1.5px solid oklch(0.78 0.18 75 / .2)', borderTopColor: T.yl, borderRadius: '50%', animation: 'btnSpin .6s linear infinite', flexShrink: 0 }} />{orderLoadMsg}</span>}
          <input ref={orderFileRef} type="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', opacity: 0 }} onChange={handleOrderImport} />
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', opacity: 0 }} onChange={handleImport} />
          <div style={{ position: 'relative' }}>
            <button type="button" style={S.btnGhost} onClick={() => setMoreMenuOpen(o => !o)}>
              <svg viewBox="0 0 24 24" style={{ width: 13, height: 13, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 }}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
              Import / Export
            </button>
            {moreMenuOpen && (
              <>
                <div onClick={() => setMoreMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 50 }} />
                <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 51, background: 'rgba(14,18,30,0.98)', border: `1px solid ${T.bd2}`, borderRadius: 8, boxShadow: '0 10px 32px rgba(0,0,0,.55)', minWidth: 180, padding: 4 }}>
                  {[
                    { label: 'Import order sheet', action: () => orderFileRef.current?.click() },
                    { label: 'Import from Excel', action: () => fileRef.current?.click() },
                    { label: 'Export to Excel', action: handleExport },
                    { label: 'Test print', action: printTestLabel },
                  ].map((opt, i) => (
                    <div key={i} className="touch44" onClick={() => { setMoreMenuOpen(false); opt.action(); }} style={{ padding: '8px 14px', cursor: 'pointer', fontSize: 12, color: T.tx2, borderRadius: 5, transition: 'all .12s', whiteSpace: 'nowrap' }} onMouseEnter={e => { e.currentTarget.style.background = 'oklch(0.55 0.22 265 / .08)'; e.currentTarget.style.color = T.tx; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.tx2; }}>{opt.label}</div>
                  ))}
                </div>
              </>
            )}
          </div>
          <button style={S.btnGhost} onClick={openAdd}>+ Add tag</button>
          <button style={{ ...S.btnPrimary, background: T.gr, color: '#fff', fontWeight: 700, boxShadow: `0 2px 12px oklch(0.72 0.19 145 / 0.4)`, padding: '8px 16px' }} onClick={() => { const toPrint: BrandTagRow[] = []; rows.forEach(r => { for (let i = 0; i < (r.copies || 0); i++) toPrint.push(r); }); if (toPrint.length > 0) openLabelPrint(toPrint); else addToast('Set copies > 0 on rows to print', 'error'); }}>
            <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'none', stroke: 'currentColor', strokeWidth: 2 }}><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z" /></svg>
            Print{(() => { const c = rows.reduce((s, r) => s + (r.copies || 0), 0); return c > 0 ? ` (${c})` : ''; })()}
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
          <svg viewBox="0 0 24 24" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, fill: 'none', stroke: T.tx3, strokeWidth: 1.8, opacity: 0.5 }}><path d="M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35" /></svg>
          <input type="text" placeholder="Search SKU, product, EAN..." value={search} onChange={e => handleSearch(e.target.value)} style={{ ...S.fSearch, background: 'transparent', border: 'none' }} />
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' as any, flexWrap: 'nowrap' }}>
          <button onClick={() => setBrandFilter('')} style={{ padding: '6px 14px', borderRadius: 6, border: `1px solid ${!brandFilter ? T.ac : T.bd}`, cursor: 'pointer', fontSize: 11, fontWeight: 500, background: !brandFilter ? 'oklch(0.55 0.22 265 / .08)' : 'transparent', color: !brandFilter ? T.ac2 : T.tx2, fontFamily: T.sans, transition: T.transition, whiteSpace: 'nowrap', flexShrink: 0 }}>All</button>
          {brandOptions.map(b => (
            <button key={b} onClick={() => setBrandFilter(brandFilter === b ? '' : b)} style={{ padding: '6px 14px', borderRadius: 6, border: `1px solid ${brandFilter === b ? T.ac : T.bd}`, cursor: 'pointer', fontSize: 11, fontWeight: 500, background: brandFilter === b ? 'oklch(0.55 0.22 265 / .08)' : 'transparent', color: brandFilter === b ? T.ac2 : T.tx2, fontFamily: T.sans, transition: T.transition, whiteSpace: 'nowrap', flexShrink: 0 }}>{b}</button>
          ))}
          <select value={sizeFilter} onChange={e => setSizeFilter(e.target.value)} style={{ background: 'transparent', border: `1px solid ${T.bd}`, borderRadius: 6, color: T.tx, fontFamily: T.sans, fontSize: 11, padding: '6px 10px', outline: 'none', cursor: 'pointer', flexShrink: 0 }}><option value="">All sizes</option>{SIZE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}</select>
        </div>
      </div>

      {/* Table */}
      <div className="mobile-only" style={{ display: 'none', fontSize: 10, color: T.tx3, marginBottom: 6 }}>Tap a row to edit, print or delete it</div>
      <div style={{ overflowX: 'auto', border: `1px solid ${T.bd}`, borderRadius: 8, background: 'rgba(255,255,255,0.015)', marginBottom: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead><tr>
            {['Brand', 'SKU · Product', 'Size', 'Color', 'MRP', 'Jio Code', 'Copies', 'Actions'].map(h => (
              <th key={h} style={thS} className={h === 'Actions' ? 'bt-actions-col' : undefined}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {rows.length === 0 && !loading && <tr><td colSpan={8} style={{ padding: 16, textAlign: 'center', color: T.tx3, fontSize: 11 }}>No rows. Import Excel or add SKUs.</td></tr>}
            {rows.map(row => (
              <tr key={row.id} className="bt-row" onClick={() => { if (window.innerWidth <= 768) setSheetRow(row); }} style={{ transition: 'background .1s' }} onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.015)'; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                <td style={tdS}><span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: 'oklch(0.55 0.22 265 / .10)', color: T.ac2 }}>{row.brand.replace(/^BRAND NAME:\s*/i, '')}</span></td>
                <td style={tdS}><div style={{ fontFamily: T.mono, fontSize: 11, color: T.tx3 }}>{row.sku}</div><div style={{ fontWeight: 500, color: T.tx, marginTop: 1 }}>{row.product.replace(/^PRODUCT DESC:\s*/i, '')}</div></td>
                <td style={tdS}>{row.size}</td>
                <td style={tdS}>{row.color}</td>
                <td style={{ ...tdS, fontFamily: T.mono, fontSize: 12, whiteSpace: 'nowrap', fontWeight: 600 }}>{fmtMrp(row.mrp)}</td>
                <td style={{ ...tdS, fontFamily: T.mono, fontSize: 11, color: T.tx3 }}>{row.jioCode}</td>
                <td style={{ ...tdS, whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 0 }} onClick={e => e.stopPropagation()}>
                    <button type="button" onClick={() => bump(row, -1)} style={{ width: 36, height: 36, border: `1px solid ${T.bd}`, background: 'rgba(255,255,255,0.03)', color: T.tx3, cursor: 'pointer', borderRadius: '6px 0 0 6px', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-label="Decrease copies" className="step44">−</button>
                    <span className="step44-val" style={{ width: 32, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', borderTop: `1px solid ${T.bd}`, borderBottom: `1px solid ${T.bd}`, fontFamily: T.mono, fontSize: 12, fontWeight: 600, color: row.copies > 0 ? T.ac2 : T.tx3, background: row.copies > 0 ? 'oklch(0.55 0.22 265 / .06)' : 'transparent' }}>{row.copies || 0}</span>
                    <button type="button" onClick={() => bump(row, 1)} style={{ width: 36, height: 36, border: `1px solid ${T.bd}`, background: 'rgba(255,255,255,0.03)', color: T.tx3, cursor: 'pointer', borderRadius: '0 6px 6px 0', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-label="Increase copies" className="step44">+</button>
                  </div>
                </td>
                <td style={{ ...tdS, whiteSpace: 'nowrap' }} className="bt-actions-col">
                  <div style={{ display: 'flex', gap: 3 }}>
                    <button style={btnSm} onClick={() => openEdit(row)}>Edit</button>
                    <button style={{ ...btnSm, color: T.bl }} onClick={() => printSingle(row)}>Print</button>
                    <button style={{ ...btnSm, color: T.re }} onClick={() => deleteRow(row.id, row.sku)} aria-label="Delete">×</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pager" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 10, fontSize: 11 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {totalPages > 1 && <>
            <button onClick={() => setBtPage(Math.max(0, btPage - 1))} disabled={btPage === 0} style={{ ...S.btnGhost, ...S.btnSm, opacity: btPage === 0 ? 0.3 : 1 }} aria-label="Previous page">Prev</button>
            <span style={{ fontSize: 10, color: T.tx3 }}>{btPage + 1} / {totalPages}</span>
            <button onClick={() => setBtPage(Math.min(totalPages - 1, btPage + 1))} disabled={btPage >= totalPages - 1} style={{ ...S.btnGhost, ...S.btnSm, opacity: btPage >= totalPages - 1 ? 0.3 : 1 }} aria-label="Next page">Next</button>
          </>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: T.tx3 }}>{totalCount} items</span>
          <select value={btPerPage} onChange={e => { setBtPerPage(Number(e.target.value)); setBtPage(0); }} style={{ ...S.fInput, width: 'auto', padding: '4px 8px', fontSize: 11, height: 28, cursor: 'pointer' }}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select>
        </div>
      </div>

      {/* ── Order Sheet Preview ── */}
      {orderRows && (() => {
        const ready = orderRows.filter(r => r.found);
        const missing = orderRows.filter(r => !r.found);
        const totalCopies = ready.reduce((s, r) => s + r.copies, 0);
        const opp = orderPerPage;
        const otp = Math.ceil(orderRows.length / opp);
        const opaged = orderRows.slice(orderPage * opp, (orderPage + 1) * opp);
        return <div onClick={() => setOrderRows(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.80)', zIndex: 200, backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8 }}>
          <div className="modal-inner" onClick={e => e.stopPropagation()} style={{ background: 'rgba(14,18,30,0.96)', border: `1px solid ${T.bd2}`, borderRadius: 14, width: '95vw', maxWidth: 1100, maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', backdropFilter: 'blur(32px)' }}>
            <div style={{ padding: '10px 14px', borderBottom: `1px solid ${T.bd}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 600, color: T.tx, fontFamily: T.sora }}>Order Sheet Preview</span>
                <span style={{ fontSize: 10, color: T.tx3, marginLeft: 8 }}>{ready.length} ready</span>
                <span style={{ fontSize: 10, color: T.gr, marginLeft: 5 }}>{totalCopies} labels</span>
                {missing.length > 0 && <span style={{ fontSize: 10, color: T.re, marginLeft: 5 }}>{missing.length} missing</span>}
              </div>
              <div style={{ display: 'flex', gap: 5 }}>
                {missing.length === 0
                  ? <button style={{ ...S.btnSuccessSolid, padding: '8px 16px' }} onClick={() => printOrderLabels(ready)}>Print All ({totalCopies})</button>
                  : <button style={{ ...S.btnSuccessSolid, padding: '8px 16px' }} onClick={async () => { if (await ask({ title: `Print ${ready.length} ready label${ready.length === 1 ? '' : 's'}?`, message: `${totalCopies} cop${totalCopies === 1 ? 'y' : 'ies'} will print. ${missing.length} missing SKU${missing.length === 1 ? '' : 's'} will be skipped — resolve ${missing.length === 1 ? 'it' : 'them'} later and re-run.`, confirmLabel: 'Print' })) printOrderLabels(ready); }}>Print Ready ({totalCopies}) · Skip {missing.length}</button>
                }
                <button style={btnGhost} onClick={() => {
                  const exportData = (orderRows || []).map(r => ({
                    'Marketplace': r.marketplace, 'SKU': r.sku, 'Brand': r.brand,
                    'Product': r.found ? r.masterData?.product.replace(/^PRODUCT DESC:\s*/i, '') : '', 'Color': r.found ? r.masterData?.color : '',
                    'Size': r.found ? r.masterData?.size : '', 'MRP': r.found ? r.masterData?.mrp : '',
                    'Copies': r.copies, 'Status': r.found ? 'Ready' : 'Missing',
                  }));
                  saveSheet(exportData, 'Order Preview', exportName('Brand-Tags-Order', [orderRows?.[0]?.marketplace, fileDate()], 'xlsx'))
                    .catch(err => addToast(friendlyError(err), 'error'));
                }}>Export</button>
                <button onClick={() => setOrderRows(null)} style={S.btnIcon} aria-label="Close">✕</button>
              </div>
            </div>
            {missing.length > 0 && <div style={{ padding: '8px 14px', background: 'rgba(248,113,113,.05)', borderBottom: `1px solid rgba(248,113,113,.12)`, display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 10, color: T.re, lineHeight: 1.5 }}>
              <span style={{ display: 'inline-flex', flexShrink: 0, marginTop: 1 }}><Icon name="alert" size={13} /></span>
              <div><strong>{missing.length} SKU{missing.length > 1 ? 's' : ''} not found in master data.</strong> Printing is blocked until all SKUs are resolved. Go to the Brand Tags table, add the missing SKU{missing.length > 1 ? 's' : ''} ({missing.map(m => m.sku).join(', ')}), then re-import this order sheet.</div>
            </div>}
            <div style={{ flex: 1, overflow: 'auto', padding: '0' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead><tr>
                  {['#', 'Marketplace', 'SKU', 'Brand', 'Product', 'Color', 'Size', 'MRP', 'Copies', 'Status'].map(h => <th key={h} style={thS}>{h}</th>)}
                </tr></thead>
                <tbody>{opaged.map((r, i) => (
                  <tr key={r.sku} style={{ transition: 'background .1s', background: !r.found ? 'rgba(248,113,113,.04)' : 'transparent' }} onMouseEnter={e => { e.currentTarget.style.background = T.s2; }} onMouseLeave={e => { e.currentTarget.style.background = !r.found ? 'rgba(248,113,113,.04)' : 'transparent'; }}>
                    <td style={{ ...tdS, color: T.tx3 }}>{orderPage * opp + i + 1}</td>
                    <td style={tdS}>{r.marketplace}</td>
                    <td style={{ ...tdS, fontWeight: 500 }}>{r.sku}</td>
                    <td style={tdS}>{r.brand}</td>
                    <td style={tdS}>{r.found ? r.masterData?.product.replace(/^PRODUCT DESC:\s*/i, '') : '—'}</td>
                    <td style={tdS}>{r.found ? r.masterData?.color : '—'}</td>
                    <td style={tdS}>{r.found ? r.masterData?.size : '—'}</td>
                    <td style={{ ...tdS, whiteSpace: 'nowrap' }}>{r.found ? fmtMrp(r.masterData?.mrp || 0) : '—'}</td>
                    <td style={tdS}><input type="number" min={0} value={r.copies} onKeyDown={e => numericKeyDown(e)} onChange={e => updateOrderCopies(r.sku, r.brand, Number(e.target.value))} style={{ ...inp, width: 40, textAlign: 'center', padding: '4px', fontSize: 12 }} /></td>
                    <td style={tdS}>{r.found ? <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 500, background: 'rgba(52,211,153,.12)', color: T.gr }}>Ready</span> : <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 500, background: 'rgba(248,113,113,.12)', color: T.re }}>Missing</span>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="pager" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '8px 0', borderTop: `1px solid ${T.bd}`, fontSize: 11 }}>
              <select value={orderPerPage} onChange={e => { setOrderPerPage(Number(e.target.value)); setOrderPage(0); }} style={{ ...inp, width: 'auto', padding: '4px 8px', fontSize: 11, height: 28, cursor: 'pointer' }}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option></select>
              <span style={{ color: T.tx3 }}>rows</span>
              {otp > 1 && <>
                <button onClick={() => setOrderPage(Math.max(0, orderPage - 1))} disabled={orderPage === 0} style={{ ...btnSm, opacity: orderPage === 0 ? 0.3 : 1 }} aria-label="Previous page">Prev</button>
                <span style={{ color: T.tx3 }}>{orderPage + 1} / {otp}</span>
                <button onClick={() => setOrderPage(Math.min(otp - 1, orderPage + 1))} disabled={orderPage >= otp - 1} style={{ ...btnSm, opacity: orderPage >= otp - 1 ? 0.3 : 1 }} aria-label="Next page">Next</button>
              </>}
            </div>
          </div>
        </div>;
      })()}

      {/* ── Delete confirm modal (replaces window.confirm per audit P0) ── */}
      {confirmDel && createPortal(
        <div style={S.modalOverlay}>
          <div className="modal-inner" style={{ background: 'rgba(14,18,30,.96)', border: `1px solid ${T.bd2}`, borderRadius: 14, padding: '20px 18px', textAlign: 'center' as const, maxWidth: 340, width: '100%' }}>
            <div style={{ marginBottom: 6 }}><svg viewBox="0 0 24 24" style={{ width: 28, height: 28, fill: 'none', stroke: T.yl, strokeWidth: 2, strokeLinejoin: 'round' }}><path d="M12 2L2 22h20L12 2z" /><path d="M12 9v5" strokeLinecap="round" /><circle cx="12" cy="17" r=".5" fill={T.yl} /></svg></div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.tx, fontFamily: T.sora, marginBottom: 4 }}>Delete this SKU?</div>
            <div style={{ fontSize: 11, color: T.tx3, marginBottom: 14, fontFamily: T.mono }}>{confirmDel.sku || '(empty SKU)'}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setConfirmDel(null)} style={{ ...S.btnGhost, flex: 1, justifyContent: 'center' }}>Cancel</button>
              <button onClick={actuallyDelete} style={{ ...S.btnDangerSolid, flex: 1, justifyContent: 'center' }}>Delete</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Add / Edit Modal ── */}
      {modalRow && (
        <BrandTagModalNew
          mode={modalMode as 'add' | 'edit'}
          initial={modalRow}
          onSave={handleModalSave}
          onClose={() => setModalRow(null)}
          brandOptions={brandOptions}
          productOptions={PRODUCT_OPTIONS}
          sizeOptions={SIZE_OPTIONS}
          colorOptions={COLOR_OPTIONS}
          qtyOptions={QTY_OPTIONS}
          validateRow={validateRow}
        />
      )}

      {/* ── Label Print Preview (iframe-based; no popup required) ── */}
      {printHtml && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: T.bg, display: 'flex', flexDirection: 'column', overscrollBehavior: 'contain' }}>
          <div style={{ padding: '12px 16px', paddingTop: 'max(12px, env(safe-area-inset-top))', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,.08)', background: 'rgba(8,11,20,.95)', backdropFilter: 'blur(20px)' }}>
            <div>
              <span style={{ fontSize: 13, fontWeight: 600, color: T.tx, fontFamily: "'Sora',sans-serif" }}>Label Print Preview</span>
              <div style={{ fontSize: 10, color: T.tx3 }}>{printCount} label{printCount === 1 ? '' : 's'}</div>
            </div>
            <button onClick={() => setPrintHtml(null)} style={S.btnIcon} aria-label="Close">&times;</button>
          </div>
          <iframe ref={printIframeRef} title="Label print preview" srcDoc={printHtml} style={{ flex: 1, width: '100%', border: 'none', background: '#fff' }} />
          <div style={{ padding: '10px 16px', paddingBottom: 'max(10px, env(safe-area-inset-bottom))', background: 'rgba(8,11,20,.95)', borderTop: '1px solid rgba(255,255,255,.08)', display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button onClick={() => setPrintHtml(null)} style={{ padding: '10px 24px', borderRadius: 8, border: '1px solid rgba(255,255,255,.08)', background: 'rgba(255,255,255,.04)', color: T.tx2, fontSize: 13, cursor: 'pointer', fontWeight: 500, flex: 1, maxWidth: 160 }}>Close</button>
            <button onClick={() => printOrQueue('label_small', printHtml!, { width: 1.97, height: 2.97 }, 'Brand Tags', undefined, addToast, printIframeRef.current)} style={{ ...S.btnPrimary, ...S.btnLg, flex: 1, maxWidth: 160 }}>Print</button>
          </div>
        </div>,
        document.body
      )}
      </>}
      <ConfirmModal {...confirmModalProps} />
      <ActionSheet
        open={!!sheetRow}
        title={sheetRow?.sku || ''}
        subtitle={sheetRow ? sheetRow.product.replace(/^PRODUCT DESC:\s*/i, '') : undefined}
        onClose={() => setSheetRow(null)}
        actions={sheetRow ? [
          { label: 'Edit tag', onClick: () => openEdit(sheetRow) },
          { label: 'Print this label', color: T.bl, onClick: () => printSingle(sheetRow) },
          { label: 'Delete', danger: true, onClick: () => deleteRow(sheetRow.id, sheetRow.sku) },
        ] : []}
      />
    </div>
  );
}
