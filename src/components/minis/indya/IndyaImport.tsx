// Indya Import — Indya's product master (an HTML table saved as .xls) comes
// in, our vendor stock sheets (the Odette ones) plus the optional Correct-SKU
// sheet, Blocked Inventory and Virtual Stock go in, and the SAME file goes
// back out with only the Stock column changed. Owns its Back arrow and the
// Virtual Stock editor (the Trackly shape) so Minis.tsx stays small.
import { useState, useRef, useMemo } from 'react';
import { T, S, alpha } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import { downloadFile } from '../../../lib/downloadFile';
import { saveWorkbook } from '../../../lib/xlsxDownload';
import { exportName, fileDate } from '../../../lib/exportName';
import ConfirmModal, { useConfirm } from '../../ui/ConfirmModal';
import VirtualStock from '../VirtualStock';
import { looksLikeHtmlReport, latin1, parseMasterHtml, rewriteMasterBytes, type MasterRow } from './indyaMaster';
import { readVendorFile, readBlockedFile, readCorrectionFile, MAX_FILE_BYTES, type VendorFile, type Corrections } from './indyaFiles';
import { computeIndya, type ComputeResult, type Flag } from './indyaCompute';
import IndyaTable, { flagLabel } from './IndyaTable';
import IndyaUnknown from './IndyaUnknown';

type Filter = 'all' | Flag | 'shared' | 'unstitched' | 'stripped' | 'corrected';
const ACCEPT = '.xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv';
const hidden = { position: 'absolute' as const, width: 0, height: 0, overflow: 'hidden' as const, opacity: 0 };
const chip = (bg: string, color: string, border = 'transparent'): React.CSSProperties => ({ padding: '3px 10px', borderRadius: 5, fontSize: 10, fontWeight: 600, background: bg, color, border: `1px solid ${border}` });

export default function IndyaImport({ addToast, virtualStock, setVirtualStock, onBack }: {
  addToast: (msg: string, type?: string) => void;
  virtualStock: Record<string, number>;
  setVirtualStock: (s: Record<string, number>) => void;
  onBack: () => void;
}) {
  const [master, setMaster] = useState<{ name: string; bytes: Uint8Array; rows: MasterRow[] } | null>(null);
  const [vendors, setVendors] = useState<VendorFile[]>([]);
  const [blocked, setBlocked] = useState<{ name: string; map: Record<string, number>; count: number } | null>(null);
  const [corr, setCorr] = useState<Corrections | null>(null);
  const [result, setResult] = useState<(ComputeResult & { blob: Blob }) | null>(null);
  const [busy, setBusy] = useState('');
  const [filter, setFilterState] = useState<Filter>('all');
  const [search, setSearchState] = useState('');
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(25);
  const masterRef = useRef<HTMLInputElement>(null), vendorRef = useRef<HTMLInputElement>(null), blockedRef = useRef<HTMLInputElement>(null), corrRef = useRef<HTMLInputElement>(null);
  const { ask, modalProps } = useConfirm();
  const setFilter = (f: Filter) => { setFilterState(f); setPage(0); };
  const setSearch = (v: string) => { setSearchState(v); setPage(0); };

  const importMaster = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    setBusy('master');
    try {
      if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} is over 15 MB`);
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!looksLikeHtmlReport(bytes)) throw new Error('This is not Indya’s product master report (expected the HTML-table .xls Indya sends)');
      const { rows } = parseMasterHtml(latin1(bytes));
      setMaster({ name: file.name, bytes, rows }); setResult(null);
      addToast(`${file.name}: ${rows.length.toLocaleString('en-IN')} rows`, 'success');
    } catch (err) { addToast(friendlyError(err), 'error'); }
    setBusy('');
  };
  const importVendors = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []); e.target.value = '';
    if (!files.length) return;
    setBusy('vendor');
    const added: VendorFile[] = [];
    for (const f of files) {
      try { const v = await readVendorFile(f); added.push(v); if (v.note) addToast(`${f.name}: ${v.note}`, 'info'); }
      catch (err) { addToast(friendlyError(err), 'error'); }
    }
    if (added.length) { setVendors(prev => [...prev, ...added]); setResult(null); addToast(`${added.length} vendor file${added.length === 1 ? '' : 's'} added (${added.reduce((n, v) => n + v.rows.length, 0).toLocaleString('en-IN')} rows)`, 'success'); }
    setBusy('');
  };
  const importOne = (kind: 'blocked' | 'corr') => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    setBusy(kind);
    try {
      if (kind === 'blocked') { const b = await readBlockedFile(file); setBlocked(b); addToast(`${b.count} blocked values from ${Object.keys(b.map).length} SKUs`, 'success'); }
      else { const c = await readCorrectionFile(file); setCorr(c); addToast(`${c.count} SKU corrections loaded`, 'success'); }
      setResult(null);
    } catch (err) { addToast(friendlyError(err), 'error'); }
    setBusy('');
  };

  const compute = () => {
    if (!master || vendors.length === 0 || busy) return;
    setBusy('compute');
    // Let the "Computing…" label paint before the synchronous work.
    setTimeout(() => {
      try {
        const r = computeIndya(master.rows, vendors, virtualStock, blocked?.map ?? {}, corr);
        const bytes = rewriteMasterBytes(master.bytes, master.rows, r.stocks);
        const blob = new Blob([bytes], { type: 'application/vnd.ms-excel' });
        setResult({ ...r, blob }); setFilter('all'); setSearch('');
        const c = r.counts;
        addToast(`${c.total.toLocaleString('en-IN')} rows — ${(c.ok + c.last).toLocaleString('en-IN')} updated, ${c.unknown} unknown code, ${c.size_missing.toLocaleString('en-IN')} size not stocked, ${c.oos} out of stock${c.blocked ? `, ${c.blocked} blocked` : ''}`, 'success');
        if (!blocked) addToast('No Blocked Inventory sheet — nothing was subtracted', 'info');
      } catch (err) { addToast(friendlyError(err), 'error'); }
      setBusy('');
    }, 30);
  };
  // No await before downloadFile: iOS only shows the share sheet inside the tap's own activation.
  const download = () => {
    if (!result || !master || busy) return;
    setBusy('download');
    downloadFile(result.blob, master.name)
      .then(ok => addToast(ok ? `${master.name} ready — upload it to Indya` : 'Nothing was saved', ok ? 'success' : 'info'))
      .catch(err => addToast(friendlyError(err), 'error'))
      .finally(() => setBusy(''));
  };
  const exportFilter = async () => {
    if (!filtered.length) { addToast('Nothing to export in this filter', 'error'); return; }
    if (busy) return;
    setBusy('export');
    try {
      const XLSX = await import('xlsx');
      const ws = XLSX.utils.json_to_sheet(filtered.map(r => ({ 'Indya SKU': r.sku, VendorSKU: r.vendorSku, 'Looked up as': r.hitKey ?? r.key, Size: r.size, 'Old stock': r.oldStock, 'New stock': r.out, Status: flagLabel(r.flag), Corrected: r.corrected ?? '' })));
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Indya');
      const ok = await saveWorkbook(wb, exportName('Indya', [filter, fileDate()], 'xlsx'));
      addToast(ok ? `Exported ${filtered.length.toLocaleString('en-IN')} rows` : 'Nothing was saved', ok ? 'success' : 'info');
    } catch (err) { addToast(friendlyError(err), 'error'); }
    setBusy('');
  };
  const reset = async () => {
    if (!await ask({ title: 'Clear everything?', message: 'The master, vendor, blocked and correction files and the computed result are dropped. You can import them again.', confirmLabel: 'Clear', cancelLabel: 'Keep', danger: true })) return;
    setMaster(null); setVendors([]); setBlocked(null); setCorr(null); setResult(null); setFilter('all'); setSearch(''); setPerPage(25);
  };

  const filtered = useMemo(() => {
    if (!result) return [];
    const q = search.trim().toUpperCase();
    return result.rows.filter(r =>
      (filter === 'all' || (filter === 'shared' ? r.siblings > 1 : filter === 'unstitched' ? r.unstitched : filter === 'stripped' ? r.stripped : filter === 'corrected' ? !!r.corrected : r.flag === filter)) &&
      (!q || r.sku.toUpperCase().includes(q) || r.vendorSku.toUpperCase().includes(q) || r.key.includes(q)));
  }, [result, filter, search]);

  const c = result?.counts;
  const counters: { key: Filter; label: string; count: number; color: string }[] = c ? [
    { key: 'all', label: 'Total', count: c.total, color: T.tx2 }, { key: 'ok', label: 'Updated', count: c.ok, color: T.gr }, { key: 'last', label: 'Last qty', count: c.last, color: T.yl },
    { key: 'unknown', label: 'Unknown code', count: c.unknown, color: T.re }, { key: 'size_missing', label: 'Size not stocked', count: c.size_missing, color: T.tx3 },
    { key: 'oos', label: 'Out of stock', count: c.oos, color: T.re }, { key: 'shared', label: 'Shared code', count: c.shared, color: T.ac2 },
    { key: 'blocked', label: 'Blocked', count: c.blocked, color: '#F97316' }, { key: 'unstitched', label: 'Unstitched', count: c.unstitched, color: T.tx3 },
    { key: 'stripped', label: 'Stripped', count: c.stripped, color: T.yl }, ...(c.corrected ? [{ key: 'corrected' as Filter, label: 'Corrected', count: c.corrected, color: T.bl }] : []),
  ] : [];
  const bt = (style: React.CSSProperties, disabled = false): React.CSSProperties => ({ ...style, opacity: disabled ? 0.5 : 1, pointerEvents: disabled ? 'none' : 'auto' });

  return (
    <div style={{ animation: 'fi .15s ease' }}>
      <div style={{ marginBottom: 14 }}>
        <button type="button" onClick={onBack} style={{ ...S.btnGhost, padding: '6px 10px' }} aria-label="Back">
          <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' }}><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
        </button>
      </div>
      <VirtualStock stock={virtualStock} setStock={setVirtualStock} addToast={addToast} />

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="touch44" onClick={() => masterRef.current?.click()} style={bt(S.btnPrimary, !!busy)}>{busy === 'master' ? 'Reading…' : master ? 'Replace Indya master' : 'Import Indya master'}</button>
        <button type="button" className="touch44" onClick={() => vendorRef.current?.click()} style={bt(S.btnGhost, !!busy)}>{busy === 'vendor' ? 'Reading…' : '+ Add vendor files'}</button>
        <button type="button" className="touch44" onClick={() => corrRef.current?.click()} style={bt({ ...S.btnGhost, color: T.bl, border: '1px solid oklch(0.77 0.14 230 / .2)', background: 'oklch(0.77 0.14 230 / .06)' }, !!busy)}>{busy === 'corr' ? 'Reading…' : corr ? 'Replace correct-SKU sheet' : 'Correct-SKU sheet'}</button>
        <button type="button" className="touch44" onClick={() => blockedRef.current?.click()} style={bt({ ...S.btnGhost, color: T.yl, border: '1px solid oklch(0.78 0.18 75 / .2)', background: 'oklch(0.78 0.18 75 / .06)' }, !!busy)}>{busy === 'blocked' ? 'Reading…' : blocked ? 'Replace blocked' : 'Blocked inventory'}</button>
        {master && vendors.length > 0 && <button type="button" className="touch44" onClick={compute} style={bt(S.btnSuccess, !!busy)}>{busy === 'compute' ? 'Computing…' : 'Compute'}</button>}
        {result && <button type="button" className="touch44" onClick={download} style={bt({ ...S.btnPrimary, background: T.gr, color: '#fff', fontWeight: 700 }, !!busy)}>{busy === 'download' ? 'Preparing…' : 'Download updated file'}</button>}
        {(master || vendors.length > 0 || blocked || corr) && <button type="button" className="touch44" onClick={reset} style={bt(S.btnDanger, !!busy)}>Reset</button>}
      </div>
      <input ref={masterRef} type="file" accept={ACCEPT} onChange={importMaster} style={hidden} aria-label="Indya master file" />
      <input ref={vendorRef} type="file" accept={ACCEPT} multiple onChange={importVendors} style={hidden} aria-label="Vendor stock files" />
      <input ref={corrRef} type="file" accept={ACCEPT} onChange={importOne('corr')} style={hidden} aria-label="Correct SKU sheet" />
      <input ref={blockedRef} type="file" accept={ACCEPT} onChange={importOne('blocked')} style={hidden} aria-label="Blocked inventory file" />

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {master && <span style={chip(T.ac3, T.ac2)}>Master: {master.rows.length.toLocaleString('en-IN')} rows</span>}
        {vendors.map((v, i) => <span key={i} style={chip('rgba(255,255,255,.04)', T.tx2, T.bd)}>{v.name} ({v.rows.length.toLocaleString('en-IN')})</span>)}
        {corr && <span style={chip('oklch(0.77 0.14 230 / .08)', T.bl, 'oklch(0.77 0.14 230 / .2)')}>Corrections: {corr.count}</span>}
        {blocked && <span style={chip('oklch(0.78 0.18 75 / .08)', T.yl, 'oklch(0.78 0.18 75 / .2)')}>Blocked: {Object.keys(blocked.map).length} SKUs</span>}
      </div>
      <div style={{ fontSize: 10.5, color: T.tx3, marginBottom: 12, lineHeight: 1.5 }}>
        Each row is looked up as <span style={{ fontFamily: T.mono }}>code-SIZE</span>: the code exactly as Indya sent it first, then again with a size stuck on the code dropped; Unstitched uses the bare code; 2XL and XXL are the same; a dashless spelling still matches (shown as “loose match”). A correct-SKU sheet replaces the code before the lookup. Duplicate Indya listings of one product get the same stock. Unknown codes are written as “SKU mismatch”; a known code with no stock in that size is 0.
      </div>

      {result && c && <>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {counters.map(s => (
            <button type="button" key={s.key} onClick={() => setFilter(filter === s.key ? 'all' : s.key)} style={{ padding: '8px 14px', minHeight: 44, background: filter === s.key ? alpha(s.color, 0.07) : 'rgba(255,255,255,0.02)', border: `1px solid ${filter === s.key ? alpha(s.color, 0.27) : T.bd}`, borderRadius: 8, textAlign: 'center', cursor: 'pointer' }}>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: T.mono, color: s.color }}>{s.count.toLocaleString('en-IN')}</div>
              <div style={{ fontSize: 9, color: T.tx3, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</div>
            </button>
          ))}
        </div>
        <IndyaUnknown bases={result.unknownBases} onPick={b => { setFilter('unknown'); setSearch(b); }} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 180, maxWidth: 320 }}>
            <svg viewBox="0 0 24 24" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, fill: 'none', stroke: T.tx3, strokeWidth: 1.8, opacity: 0.5 }}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search Indya SKU or code…" style={{ ...S.fSearch, width: '100%' }} />
          </div>
          {filter !== 'all' && <>
            <span style={{ fontSize: 11, color: T.tx2 }}>Showing <b style={{ color: counters.find(x => x.key === filter)?.color }}>{counters.find(x => x.key === filter)?.label}</b> ({filtered.length.toLocaleString('en-IN')})</span>
            <button type="button" className="touch44" onClick={exportFilter} style={bt({ ...S.btnGhost, ...S.btnSm, color: T.bl, border: '1px solid oklch(0.77 0.14 230 / .2)' }, !!busy)}>{busy === 'export' ? 'Exporting…' : `Export ${filtered.length.toLocaleString('en-IN')}`}</button>
            <button type="button" className="touch44" onClick={() => setFilter('all')} style={{ ...S.btnGhost, ...S.btnSm, color: T.tx3 }}>Clear</button>
          </>}
        </div>
        <IndyaTable rows={filtered} page={page} perPage={perPage} onPage={setPage} onPerPage={n => { setPerPage(n); setPage(0); }} />
      </>}

      {!result && !master && <div style={{ padding: 40, textAlign: 'center', color: T.tx3, fontSize: 12 }}>Import Indya’s product master, then add your vendor stock files.</div>}
      {!result && master && vendors.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: T.tx3, fontSize: 12 }}>Master loaded. Now add vendor files (and the correct-SKU sheet if you have one).</div>}
      {!result && master && vendors.length > 0 && <div style={{ padding: 30, textAlign: 'center', color: T.yl, fontSize: 12 }}>Ready. Tap Compute.</div>}
      <ConfirmModal {...modalProps} />
    </div>
  );
}
