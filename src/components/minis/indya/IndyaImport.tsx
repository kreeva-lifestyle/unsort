// Indya Import — the owner's flow, numbered on the toolbar:
//   1 import Indya's product master (an HTML table saved as .xls, or the CSV export);
//   2 download the SKU sheet — every row's lookup SKU with the size rules
//     applied — and hand it to the vendors;
//   3 add the stock files the vendors send back (the Odette ones), plus the
//     optional Blocked Inventory and Virtual Stock; the saved SKU map fixes
//     Indya's misspelt codes before every lookup;
//   4 compute;  5 download the SAME file with only the Stock column changed.
// Owns its Back arrow and the Virtual Stock editor (the Trackly shape) so
// Minis.tsx stays small.
import { useState, useMemo, useCallback } from 'react';
import { T, S, alpha } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import { downloadFile } from '../../../lib/downloadFile';
import { saveWorkbook } from '../../../lib/xlsxDownload';
import { exportName, fileDate } from '../../../lib/exportName';
import ConfirmModal, { useConfirm } from '../../ui/ConfirmModal';
import VirtualStock from '../VirtualStock';
import IndyaSkuMap from './IndyaSkuMap';
import { sniffMaster, latin1, parseMasterHtml, rewriteMasterBytes, type MasterRow, type MasterKind } from './indyaMaster';
import { parseMasterCsv } from './indyaMasterCsv';
import { readVendorFile, readBlockedFile, readBytes, type VendorFile, type Corrections } from './indyaFiles';
import { computeIndya, type ComputeResult, type Flag } from './indyaCompute';
import { exportSkuSheet } from './indyaSkuSheet';
import IndyaToolbar from './IndyaToolbar';
import IndyaTable, { flagLabel } from './IndyaTable';
import IndyaUnknown from './IndyaUnknown';
import IndyaHint from './IndyaHint';
import IndyaCoverage from './IndyaCoverage';

type Filter = 'all' | Flag | 'shared' | 'unstitched' | 'stripped' | 'corrected' | 'lehenga';
const chip = (bg: string, color: string, border = 'transparent'): React.CSSProperties => ({ padding: '3px 10px', borderRadius: 5, fontSize: 10, fontWeight: 600, background: bg, color, border: `1px solid ${border}` });

export default function IndyaImport({ addToast, virtualStock, setVirtualStock, onBack }: {
  addToast: (msg: string, type?: string) => void;
  virtualStock: Record<string, number>;
  setVirtualStock: (s: Record<string, number>) => void;
  onBack: () => void;
}) {
  const [master, setMaster] = useState<{ name: string; bytes: Uint8Array; rows: MasterRow[]; kind: MasterKind } | null>(null);
  const [vendors, setVendors] = useState<VendorFile[]>([]);
  const [blocked, setBlocked] = useState<{ name: string; map: Record<string, number>; count: number } | null>(null);
  const [corr, setCorr] = useState<Corrections | null>(null);   // the saved SKU map, owned by IndyaSkuMap
  const [mapPrefill, setMapPrefill] = useState<{ code: string; n: number } | null>(null);
  const onMapChange = useCallback((c: Corrections) => { setCorr(c.count ? c : null); setResult(null); }, []);
  const [result, setResult] = useState<(ComputeResult & { blob: Blob }) | null>(null);
  const [busy, setBusy] = useState('');
  const [filter, setFilterState] = useState<Filter>('all');
  const [search, setSearchState] = useState('');
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(25);
  const { ask, modalProps } = useConfirm();
  const setFilter = (f: Filter) => { setFilterState(f); setPage(0); };
  const setSearch = (v: string) => { setSearchState(v); setPage(0); };
  const fail = (err: unknown) => addToast(friendlyError(err), 'error');
  const saved = (ok: boolean, msg: string) => addToast(ok ? msg : 'Nothing was saved', ok ? 'success' : 'info');

  const importMaster = async (file: File) => {
    setBusy('master');
    try {
      const bytes = await readBytes(file);
      const kind = sniffMaster(bytes);
      if (typeof kind !== 'string') throw new Error(kind.reason);
      const { rows } = kind === 'csv' ? parseMasterCsv(latin1(bytes)) : parseMasterHtml(latin1(bytes));
      setMaster({ name: file.name, bytes, rows, kind }); setResult(null);
      addToast(`${file.name}: ${rows.length.toLocaleString('en-IN')} rows — next, download the SKU sheet for the vendors`, 'success');
    } catch (err) { fail(err); }
    setBusy('');
  };
  const importVendors = async (files: File[]) => {
    setBusy('vendor');
    const added: VendorFile[] = [];
    for (const f of files) {
      try { const v = await readVendorFile(f); added.push(v); if (v.note) addToast(`${f.name}: ${v.note}`, 'info'); }
      catch (err) { fail(err); }
    }
    if (added.length) { setVendors(prev => [...prev, ...added]); setResult(null); addToast(`${added.length} vendor file${added.length === 1 ? '' : 's'} added (${added.reduce((n, v) => n + v.rows.length, 0).toLocaleString('en-IN')} rows)`, 'success'); }
    setBusy('');
  };
  const importBlocked = async (file: File) => {
    setBusy('blocked');
    try { const b = await readBlockedFile(file); setBlocked(b); setResult(null); addToast(`${b.count} blocked values from ${Object.keys(b.map).length} SKUs`, 'success'); } catch (err) { fail(err); }
    setBusy('');
  };
  const skuSheet = async () => {
    if (!master || busy) return;
    setBusy('skus');
    try { saved(await exportSkuSheet(master.rows, corr), 'SKU sheet ready — send it to the vendors'); } catch (err) { fail(err); }
    setBusy('');
  };
  const compute = () => {
    if (!master || vendors.length === 0 || busy) return;
    setBusy('compute');
    setTimeout(() => {   // let "Computing…" paint before the synchronous work
      try {
        const r = computeIndya(master.rows, vendors, virtualStock, blocked?.map ?? {}, corr);
        const blob = new Blob([rewriteMasterBytes(master.bytes, master.rows, r.stocks, master.kind)], { type: master.kind === 'csv' ? 'text/csv' : 'application/vnd.ms-excel' });
        setResult({ ...r, blob }); setFilter('all'); setSearch('');
        const c = r.counts;
        addToast(`${c.total.toLocaleString('en-IN')} rows — ${(c.ok + c.last).toLocaleString('en-IN')} updated, ${c.unknown} unknown code, ${c.size_missing.toLocaleString('en-IN')} size not stocked, ${c.oos} out of stock${c.blocked ? `, ${c.blocked} blocked` : ''}`, 'success');
        if (!blocked) addToast('No Blocked Inventory sheet — nothing was subtracted', 'info');
      } catch (err) { fail(err); }
      setBusy('');
    }, 30);
  };
  // No await before downloadFile: iOS only shows the share sheet inside the tap's own activation.
  const download = () => {
    if (!result || !master || busy) return;
    setBusy('download');
    downloadFile(result.blob, master.name).then(ok => saved(ok, `${master.name} ready — upload it to Indya`)).catch(fail).finally(() => setBusy(''));
  };
  const exportFilter = async () => {
    if (!filtered.length) { addToast('Nothing to export in this filter', 'error'); return; }
    if (busy) return;
    setBusy('export');
    try {
      const XLSX = await import('xlsx');
      const ws = XLSX.utils.json_to_sheet(filtered.map(r => ({ 'Indya SKU': r.sku, VendorSKU: r.vendorSku, 'Looked up as': r.hitKey ?? r.key, Size: r.size, 'Old stock': r.oldStock, 'New stock': r.out, Status: flagLabel(r.flag), Corrected: r.corrected ?? '' })));
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Indya');
      saved(await saveWorkbook(wb, exportName('Indya', [filter, fileDate()], 'xlsx')), `Exported ${filtered.length.toLocaleString('en-IN')} rows`);
    } catch (err) { fail(err); }
    setBusy('');
  };
  const reset = async () => {
    if (!await ask({ title: 'Clear everything?', message: 'The master, vendor and blocked files and the computed result are dropped. The saved SKU map stays.', confirmLabel: 'Clear', cancelLabel: 'Keep', danger: true })) return;
    setMaster(null); setVendors([]); setBlocked(null); setResult(null); setFilter('all'); setSearch(''); setPerPage(25);
  };

  const filtered = useMemo(() => {
    if (!result) return [];
    const q = search.trim().toUpperCase();
    return result.rows.filter(r =>
      (filter === 'all' || (filter === 'shared' ? r.siblings > 1 : filter === 'unstitched' ? r.unstitched : filter === 'stripped' ? r.stripped : filter === 'corrected' ? !!r.corrected : filter === 'lehenga' ? r.lehenga : r.flag === filter)) &&
      (!q || r.sku.toUpperCase().includes(q) || r.vendorSku.toUpperCase().includes(q) || r.key.includes(q)));
  }, [result, filter, search]);

  const c = result?.counts;
  const counters: { key: Filter; label: string; count: number; color: string }[] = c ? [
    { key: 'all', label: 'Total', count: c.total, color: T.tx2 }, { key: 'ok', label: 'Updated', count: c.ok, color: T.gr }, { key: 'last', label: 'Last qty', count: c.last, color: T.yl },
    { key: 'unknown', label: 'Unknown code', count: c.unknown, color: T.re }, { key: 'size_missing', label: 'Size not stocked', count: c.size_missing, color: T.tx3 }, { key: 'oversize', label: 'Above XXL', count: c.oversize, color: T.tx3 },
    { key: 'oos', label: 'Out of stock', count: c.oos, color: T.re }, { key: 'shared', label: 'Shared code', count: c.shared, color: T.ac2 },
    { key: 'blocked', label: 'Blocked', count: c.blocked, color: '#F97316' }, { key: 'unstitched', label: 'Unstitched', count: c.unstitched, color: T.tx3 },
    { key: 'stripped', label: 'Stripped', count: c.stripped, color: T.yl }, ...(c.lehenga ? [{ key: 'lehenga' as Filter, label: 'Lehenga', count: c.lehenga, color: T.gr }] : []), ...(c.corrected ? [{ key: 'corrected' as Filter, label: 'Corrected', count: c.corrected, color: T.bl }] : []),
  ] : [];

  return (
    <div style={{ animation: 'fi .15s ease' }}>
      <div style={{ marginBottom: 14 }}>
        <button type="button" onClick={onBack} style={{ ...S.btnGhost, padding: '6px 10px' }} aria-label="Back">
          <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' }}><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
        </button>
      </div>
      <VirtualStock stock={virtualStock} setStock={setVirtualStock} addToast={addToast} />
      <IndyaSkuMap addToast={addToast} onChange={onMapChange} prefill={mapPrefill} />

      <IndyaToolbar busy={busy} hasMaster={!!master} hasVendors={vendors.length > 0} hasBlocked={!!blocked} hasResult={!!result} anything={!!(master || vendors.length || blocked)}
        onMaster={importMaster} onVendors={importVendors} onBlocked={importBlocked} onSkuSheet={skuSheet} onCompute={compute} onDownload={download} onReset={reset} />

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {master && <span style={chip(T.ac3, T.ac2)}>Master: {master.rows.length.toLocaleString('en-IN')} rows</span>}
        {vendors.map((v, i) => <span key={i} style={chip('rgba(255,255,255,.04)', T.tx2, T.bd)}>{v.name} ({v.rows.length.toLocaleString('en-IN')})</span>)}
        {corr && <span style={chip('oklch(0.77 0.14 230 / .08)', T.bl, 'oklch(0.77 0.14 230 / .2)')}>SKU map: {corr.count} fix{corr.count === 1 ? '' : 'es'}</span>}
        {blocked && <span style={chip('oklch(0.78 0.18 75 / .08)', T.yl, 'oklch(0.78 0.18 75 / .2)')}>Blocked: {Object.keys(blocked.map).length} SKUs</span>}
      </div>
      <IndyaHint />

      {result && c && <>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {counters.map(s => (
            <button type="button" key={s.key} onClick={() => setFilter(filter === s.key ? 'all' : s.key)} style={{ padding: '8px 14px', minHeight: 44, background: filter === s.key ? alpha(s.color, 0.07) : 'rgba(255,255,255,0.02)', border: `1px solid ${filter === s.key ? alpha(s.color, 0.27) : T.bd}`, borderRadius: 8, textAlign: 'center', cursor: 'pointer' }}>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: T.mono, color: s.color }}>{s.count.toLocaleString('en-IN')}</div>
              <div style={{ fontSize: 9, color: T.tx3, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</div>
            </button>
          ))}
        </div>
        <IndyaUnknown bases={result.unknownBases} onPick={b => { setFilter('unknown'); setSearch(b); }} onMap={b => { setMapPrefill({ code: b, n: Date.now() }); window.scrollTo({ top: 0, behavior: 'smooth' }); document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' }); }} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 180, maxWidth: 320 }}>
            <svg viewBox="0 0 24 24" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, fill: 'none', stroke: T.tx3, strokeWidth: 1.8, opacity: 0.5 }}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search Indya SKU or code…" style={{ ...S.fSearch, width: '100%' }} />
          </div>
          {filter !== 'all' && <>
            <span style={{ fontSize: 11, color: T.tx2 }}>Showing <b style={{ color: counters.find(x => x.key === filter)?.color }}>{counters.find(x => x.key === filter)?.label}</b> ({filtered.length.toLocaleString('en-IN')})</span>
            <button type="button" className="touch44" onClick={exportFilter} style={{ ...S.btnGhost, ...S.btnSm, color: T.bl, border: '1px solid oklch(0.77 0.14 230 / .2)', opacity: busy ? 0.5 : 1, pointerEvents: busy ? 'none' : 'auto' }}>{busy === 'export' ? 'Exporting…' : `Export ${filtered.length.toLocaleString('en-IN')}`}</button>
            <button type="button" className="touch44" onClick={() => setFilter('all')} style={{ ...S.btnGhost, ...S.btnSm, color: T.tx3 }}>Clear</button>
          </>}
        </div>
        <IndyaTable rows={filtered} page={page} perPage={perPage} onPage={setPage} onPerPage={n => { setPerPage(n); setPage(0); }} />
      </>}

      {!result && !master && <div style={{ padding: 40, textAlign: 'center', color: T.tx3, fontSize: 12 }}>Import Indya’s product master. Then download the SKU sheet for the vendors, and add the stock files they send back.</div>}
      {!result && master && vendors.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: T.tx3, fontSize: 12 }}>Master loaded. Download the SKU sheet for the vendors, then add the stock files they return.</div>}
      {!result && master && vendors.length > 0 && <div style={{ padding: 30, textAlign: 'center', color: T.yl, fontSize: 12 }}>Ready. Tap Compute.</div>}
      <IndyaCoverage master={master?.rows ?? null} corrections={corr} addToast={addToast} />
      <ConfirmModal {...modalProps} />
    </div>
  );
}
