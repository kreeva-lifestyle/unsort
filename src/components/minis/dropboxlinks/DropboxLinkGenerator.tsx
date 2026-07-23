// Dropbox Link Generator — type a SKU (or paste many / import Excel) and get
// view-only Dropbox links. COMBINE = one link for the SKU's folder, SEPARATE =
// a link per image inside it; both are generated together so the toggle is
// instant. Admin/manager/operator can also write the folder link straight into
// the offline master sheet's IMAGE column. Folder search happens server-side.
import { useState, useEffect, useRef } from 'react';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import { useAuth } from '../../../hooks/useAuth';
import { call, explainGen, GenResult, WriteResult } from './api';
import { runBulk, parseSkuText, parseSkuFile, exportBulkXlsx, BulkRow, BULK_CAP } from './bulk';
import LinkResult from './LinkResult';
import RootSettings from './RootSettings';

type Mode = 'combine' | 'separate';
type Pair = { combine: GenResult | null; separate: GenResult | null };

export default function DropboxLinkGenerator({ addToast }: { addToast: (m: string, t?: string) => void }) {
  const { profile } = useAuth();
  const canSave = ['admin', 'manager', 'operator'].includes((profile?.role as string) || '');
  const [mode, setMode] = useState<Mode>('combine');
  const [sku, setSku] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Pair | null>(null);
  const [savingSheet, setSavingSheet] = useState(false);
  const [rootCount, setRootCount] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [bulk, setBulk] = useState<BulkRow[] | null>(null);
  // Mode the CURRENT bulk results were generated with — the Save-all gate must
  // check this, not the live toggle, or links minted in Separate mode (one per
  // image) could be written into the master sheet as if they were folder links.
  const [bulkMode, setBulkMode] = useState<Mode>('combine');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const fileRef = useRef<HTMLInputElement>(null);

  const refreshRoots = () => call({ action: 'linkgen_roots', op: 'list' }).then(({ data }) => {
    if (data.ok) setRootCount((data.roots || []).filter((r: any) => r.enabled !== false).length);
  }).catch(() => {});
  useEffect(() => { refreshRoots(); }, []);

  // Generate BOTH modes at once so switching Combine/Separate needs no refetch.
  const genOne = async (folderPath?: string) => {
    const cur = results?.combine?.sku || results?.separate?.sku || '';
    const s = (folderPath ? cur || sku : sku).trim().toUpperCase();
    if (busy || !s) return;
    setBusy(true); if (!folderPath) setResults(null);
    try {
      const [c, sep] = await Promise.all([
        call({ action: 'linkgen', sku: s, mode: 'combine', folder: folderPath || undefined }),
        call({ action: 'linkgen', sku: s, mode: 'separate', folder: folderPath || undefined }),
      ]);
      const toRes = (r: { status: number; data: any }): GenResult =>
        r.data.ok ? r.data : { ok: false, sku: s, error: explainGen(r.data, r.status), folder: r.data.folder, candidates: r.data.candidates };
      setResults({ combine: toRes(c), separate: toRes(sep) });
      const act = mode === 'combine' ? c : sep;
      if (c.data.ok && sep.data.ok) addToast(`Links ready for ${s} — Combine & Separate`, 'success');
      else if (c.data.ok || sep.data.ok) addToast(`${c.data.ok ? 'Combine' : 'Separate'} links ready for ${s} — ${c.data.ok ? 'Separate' : 'Combine'} failed`, 'info');
      else addToast(explainGen(act.data, act.status), act.data?.candidates?.length ? 'info' : 'error');
    } catch (e) { addToast(friendlyError(e), 'error'); }
    setBusy(false);
  };

  const copy = async (text: string, what = 'Link') => {
    try { await navigator.clipboard.writeText(text); addToast(`${what} copied`, 'success'); }
    catch { addToast('Could not copy — long-press the link instead', 'error'); }
  };

  const startBulk = async (skusIn: string[]) => {
    let skus = skusIn;
    if (skus.length > BULK_CAP) { addToast(`${skus.length} SKUs — doing the first ${BULK_CAP}`, 'info'); skus = skus.slice(0, BULK_CAP); }
    setBulkBusy(true); setBulkMode(mode); setProgress({ done: 0, total: skus.length });
    const rows = await runBulk(skus, mode, (r, done) => { setBulk(r); setProgress({ done, total: skus.length }); });
    const ok = rows.filter(r => r.status === 'ok').length;
    addToast(`${ok} of ${rows.length} SKUs got links${ok < rows.length ? ' — see the list' : ''}`, ok > 0 ? 'success' : 'error');
    setBulkBusy(false);
  };
  const runPaste = () => { const skus = parseSkuText(pasteText); if (!skus.length) { addToast('Paste at least one SKU', 'error'); return; } startBulk(skus); };
  const importFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = ev => { try { const skus = parseSkuFile(ev.target?.result as ArrayBuffer); if (!skus.length) { addToast('Column A has no SKUs', 'error'); return; } startBulk(skus); } catch (e) { addToast(friendlyError(e), 'error'); } };
    reader.readAsArrayBuffer(file);
  };

  const saveToSheet = async (url: string, sku0: string) => {
    if (savingSheet) return; setSavingSheet(true);
    try {
      const { data } = await call({ action: 'linkgen_writesheet', items: [{ sku: sku0, url }] }) as { data: WriteResult };
      if (data.ok) addToast(`Saved to ${data.written?.[0]?.tab || 'sheet'} ${data.written?.[0]?.cell?.split('!')[1] || ''}`.trim(), 'success');
      else if (data.error === 'sku_not_found') addToast(`${sku0} is not in the master sheet`, 'error');
      else if (data.error === 'sku_ambiguous') addToast(`${sku0} exists in BOTH master tabs — update the sheet manually to be safe`, 'error');
      else addToast(friendlyError(data.error || 'Could not save to the sheet'), 'error');
    } catch (e) { addToast(friendlyError(e), 'error'); }
    setSavingSheet(false);
  };
  const saveAllToSheet = async () => {
    if (bulkSaving || !bulk) return;
    const items = bulk.filter(r => r.status === 'ok' && r.links[0]?.url).map(r => ({ sku: r.sku, url: r.links[0].url }));
    if (!items.length) { addToast('No folder links to save', 'error'); return; }
    setBulkSaving(true);
    try {
      const { data } = await call({ action: 'linkgen_writesheet', items }) as { data: WriteResult };
      const skipped = [
        data.notFound?.length ? `${data.notFound.length} not in sheet` : '',
        data.ambiguous?.length ? `${data.ambiguous.length} in both tabs (skipped: ${data.ambiguous.join(', ')})` : '',
      ].filter(Boolean).join(' · ');
      if (data.ok) addToast(`Saved ${data.skuCount ?? data.count} SKU${(data.skuCount ?? data.count) === 1 ? '' : 's'} to the master sheet${skipped ? ` — ${skipped}` : ''}`, 'success');
      else if (data.error === 'sku_not_found' || data.error === 'sku_ambiguous') addToast(`Nothing saved — ${skipped || 'no matching SKUs in the master sheet'}`, 'error');
      else addToast(friendlyError(data.error || 'Could not save to the sheet'), 'error');
    } catch (e) { addToast(friendlyError(e), 'error'); }
    setBulkSaving(false);
  };

  const modeBtn = (m: Mode, label: string, hint: string) => (
    <button onClick={() => setMode(m)} title={hint}
      style={{ ...S.btnGhost, minHeight: 36, border: `1px solid ${mode === m ? 'oklch(0.55 0.22 265 / .5)' : T.bd2}`, background: mode === m ? 'oklch(0.55 0.22 265 / .12)' : 'transparent', color: mode === m ? T.ac2 : T.tx3, fontWeight: 600 }}>
      {label}
    </button>
  );
  const active = results ? results[mode] : null;
  const saveUrl = results?.combine?.ok ? results.combine.links?.[0]?.url : undefined;
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div style={{ animation: 'fi .15s ease' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {modeBtn('combine', 'Combine', 'One link for the whole SKU folder')}
        {modeBtn('separate', 'Separate', 'A link for every image inside the SKU folder')}
        <span style={{ fontSize: 10, color: T.tx3 }}>{mode === 'combine' ? 'One link per SKU (whole folder)' : 'One link per image in the folder'} · both are ready — tap to switch</span>
        <button onClick={() => setShowSettings(s => !s)} style={{ ...S.btnGhost, marginLeft: 'auto' }}>{showSettings ? 'Close Settings' : 'Settings'}</button>
      </div>
      {rootCount === 0 && (
        <div style={{ background: 'oklch(0.78 0.18 75 / .06)', border: '1px solid oklch(0.78 0.18 75 / .25)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 11, color: T.tx2 }}>
          No search folders configured yet — open Settings and add the Dropbox folder link(s) to search inside.
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input value={sku} onChange={e => setSku(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') genOne(); }} placeholder="Enter SKU e.g. 15003" style={{ ...S.fInput, width: 200, fontFamily: T.mono }} />
        <button onClick={() => genOne()} disabled={busy || !sku.trim()} style={{ ...S.btnPrimary, pointerEvents: busy ? 'none' : 'auto', opacity: busy || !sku.trim() ? 0.5 : 1 }}>{busy ? 'Generating…' : 'Generate Link'}</button>
        <button onClick={() => setShowPaste(p => !p)} style={{ ...S.btnGhost, color: T.ac2, border: '1px solid oklch(0.55 0.22 265 / .2)' }}>{showPaste ? 'Hide paste' : 'Paste SKUs'}</button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ''; }} />
        <button onClick={() => fileRef.current?.click()} disabled={bulkBusy} style={{ ...S.btnGhost, color: T.bl, border: '1px solid oklch(0.77 0.14 230 / .2)', background: 'oklch(0.77 0.14 230 / .06)', pointerEvents: bulkBusy ? 'none' : 'auto', opacity: bulkBusy ? 0.5 : 1 }}>{bulkBusy ? `Bulk… ${progress.done}/${progress.total}` : 'Bulk from Excel'}</button>
        {bulk && bulk.length > 0 && !bulkBusy && <button onClick={() => exportBulkXlsx(bulk)} style={{ ...S.btnGhost, color: T.gr, border: '1px solid oklch(0.72 0.19 145 / .2)', background: 'oklch(0.72 0.19 145 / .06)' }}>Export {bulk.length}</button>}
      </div>

      {showPaste && (
        <div style={{ marginBottom: 12, maxWidth: 520 }}>
          <textarea value={pasteText} onChange={e => setPasteText(e.target.value)} rows={4} placeholder="Paste SKUs — one per line, or separated by comma/space" style={{ ...S.fInput, width: '100%', height: 'auto', fontFamily: T.mono, resize: 'vertical', padding: '8px 12px' }} />
          <button onClick={runPaste} disabled={bulkBusy || !pasteText.trim()} style={{ ...S.btnPrimary, marginTop: 8, pointerEvents: bulkBusy ? 'none' : 'auto', opacity: bulkBusy || !pasteText.trim() ? 0.5 : 1 }}>{bulkBusy ? `Generating… ${progress.done}/${progress.total}` : `Generate ${parseSkuText(pasteText).length || ''} links`.trim()}</button>
        </div>
      )}
      {bulkBusy && progress.total > 0 && (
        <div style={{ maxWidth: 420, height: 6, background: 'rgba(255,255,255,.05)', borderRadius: 3, marginBottom: 12, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#6366F1,#818CF8)', borderRadius: 3, transition: 'width .4s' }} />
        </div>
      )}

      {active && <LinkResult result={active} saveUrl={saveUrl} canSave={canSave} saving={savingSheet} busy={busy} onPickCandidate={genOne} onCopy={copy} onSave={url => saveToSheet(url, active.sku)} />}

      {bulk && bulk.length > 0 && (
        <>
          {canSave && !bulkBusy && bulkMode === 'combine' && bulk.some(r => r.status === 'ok') && (
            <button onClick={saveAllToSheet} disabled={bulkSaving} style={{ ...S.btnGhost, marginBottom: 8, color: T.bl, border: '1px solid oklch(0.77 0.14 230 / .25)', background: 'oklch(0.77 0.14 230 / .06)', pointerEvents: bulkSaving ? 'none' : 'auto', opacity: bulkSaving ? 0.5 : 1 }}>{bulkSaving ? 'Saving…' : 'Save all to master sheet'}</button>
          )}
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', borderRadius: 8, border: `1px solid ${T.bd}` }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420 }}>
              <thead><tr>{['SKU', 'Status', 'Links'].map(c => <th key={c} style={{ ...S.thStyle, whiteSpace: 'nowrap' as const }}>{c}</th>)}</tr></thead>
              <tbody>
                {bulk.map((r, i) => (
                  <tr key={i}>
                    <td style={{ ...S.tdStyle, fontFamily: T.mono, fontWeight: 600 }}>{r.sku}</td>
                    <td style={{ ...S.tdStyle, color: r.status === 'ok' ? T.gr : r.status === 'error' ? T.re : T.tx3, fontSize: 11 }}>{r.status === 'pending' ? '…' : r.status === 'ok' ? `✓ ${r.links.length} link${r.links.length === 1 ? '' : 's'}` : r.message}</td>
                    <td style={S.tdStyle}>{r.links.length > 0 && <button onClick={() => copy(r.links.map(l => l.url).join('\n'), `${r.sku} links`)} style={{ ...S.btnGhost, padding: '4px 10px', fontSize: 10 }}>Copy</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {!active && !bulk && <div style={{ padding: 24, textAlign: 'center', color: T.tx3, fontSize: 11 }}>Enter a SKU and press Generate — or paste / import an Excel of SKUs for bulk links.</div>}

      {showSettings && <RootSettings addToast={addToast} onChanged={refreshRoots} />}
    </div>
  );
}
