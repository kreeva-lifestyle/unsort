// Dropbox Link Generator — type a SKU (or paste many / import Excel) and get
// view-only Dropbox links. COMBINE = one link for the SKU's folder, SEPARATE =
// a link per image inside it. Both are still fetched per generate so the toggle
// stays instant, but only the mode ON SCREEN is awaited — see genOne.
// Admin/manager/operator can also write the folder link straight into the
// offline master sheet's IMAGE column. Folder search happens server-side.
import { useState, useEffect, useRef } from 'react';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import { useAuth } from '../../../hooks/useAuth';
import { call, GenRoot } from './api';
import { useSheetSave } from './useSheetSave';
import { runBulk, parseSkuText, parseSkuFile, exportBulkXlsx, BulkRow, BULK_CAP } from './bulk';
import { useGenOne, Mode } from './useGenOne';
import LinkResult from './LinkResult';
import RootSettings from './RootSettings';
import FolderAskModal from './FolderAskModal';
import SkuInput from '../../ui/SkuInput';

export default function DropboxLinkGenerator({ addToast }: { addToast: (m: string, t?: string) => void }) {
  const { profile } = useAuth();
  const canSave = ['admin', 'manager', 'operator'].includes((profile?.role as string) || '');
  const [mode, setMode] = useState<Mode>('combine');
  const [sku, setSku] = useState('');
  // Folder choice is asked in a POPUP before EVERY search (owner's rule — no
  // remembered pick, no toolbar select). roots feeds the popup's options.
  const [roots, setRoots] = useState<GenRoot[]>([]);
  const { busy, results, pending, genOne } = useGenOne(mode, sku, addToast);
  const { savingSheet, bulkSaving, saveToSheet, saveAllToSheet } = useSheetSave(addToast);
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
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const fileRef = useRef<HTMLInputElement>(null);

  const refreshRoots = () => call({ action: 'linkgen_roots', op: 'list' }).then(({ data }) => {
    if (!data.ok) return;
    const enabled = ((data.roots || []) as GenRoot[]).filter(r => r.enabled !== false);
    setRoots(enabled);
    setRootCount(enabled.length);
  }).catch(() => {});
  useEffect(() => { refreshRoots(); }, []);

  const copy = async (text: string, what = 'Link') => {
    try { await navigator.clipboard.writeText(text); addToast(`${what} copied`, 'success'); }
    catch { addToast('Could not copy — long-press the link instead', 'error'); }
  };

  // ASK-FIRST gate (owner's rule): with several Settings folders, the folder
  // popup comes before EVERY search. The pending run waits for the answer.
  const [pendingGen, setPendingGen] = useState<{ kind: 'one' } | { kind: 'bulk'; skus: string[] } | null>(null);
  const mustAsk = roots.length > 1;

  const doBulk = async (skus: string[], rootOverride = '') => {
    setBulkBusy(true); setBulkMode(mode); setProgress({ done: 0, total: skus.length });
    const rows = await runBulk(skus, mode, (r, done) => { setBulk(r); setProgress({ done, total: skus.length }); }, rootOverride);
    const ok = rows.filter(r => r.status === 'ok').length;
    addToast(`${ok} of ${rows.length} SKUs got links${ok < rows.length ? ' — see the list' : ''}`, ok > 0 ? 'success' : 'error');
    setBulkBusy(false);
  };
  const startBulk = (skusIn: string[]) => {
    let skus = skusIn;
    if (skus.length > BULK_CAP) { addToast(`${skus.length} SKUs — doing the first ${BULK_CAP}`, 'info'); skus = skus.slice(0, BULK_CAP); }
    if (mustAsk) { setPendingGen({ kind: 'bulk', skus }); return; }
    doBulk(skus);
  };
  const requestGenOne = () => { if (mustAsk) { setPendingGen({ kind: 'one' }); return; } genOne(); };
  const onAskPick = (url: string) => {
    const p = pendingGen;
    setPendingGen(null);
    if (!p) return;
    if (p.kind === 'one') genOne(undefined, url);
    else doBulk(p.skus, url);
  };
  const runPaste = () => { const skus = parseSkuText(pasteText); if (!skus.length) { addToast('Paste at least one SKU', 'error'); return; } startBulk(skus); };
  const importFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = ev => { try { const skus = parseSkuFile(ev.target?.result as ArrayBuffer); if (!skus.length) { addToast('Column A has no SKUs', 'error'); return; } startBulk(skus); } catch (e) { addToast(friendlyError(e), 'error'); } };
    reader.readAsArrayBuffer(file);
  };

  const modeBtn = (m: Mode, label: string, hint: string) => (
    <button onClick={() => setMode(m)} title={hint}
      style={{ ...S.btnGhost, minHeight: 36, border: `1px solid ${mode === m ? 'oklch(0.55 0.22 265 / .5)' : T.bd2}`, background: mode === m ? 'oklch(0.55 0.22 265 / .12)' : 'transparent', color: mode === m ? T.ac2 : T.tx3, fontWeight: 600 }}>
      {label}
    </button>
  );
  const active = results ? results[mode] : null;
  // Toggled to the mode still being fetched in the background: show that it's
  // loading rather than falling through to the "enter a SKU" empty state.
  const activeLoading = !active && !busy && pending === mode && !!results;
  const saveUrl = results?.combine?.ok ? results.combine.links?.[0]?.url : undefined;
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div style={{ animation: 'fi .15s ease' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {modeBtn('combine', 'Combine', 'One link for the whole SKU folder')}
        {modeBtn('separate', 'Separate', 'A link for every image inside the SKU folder')}
        <span style={{ fontSize: 10, color: T.tx3 }}>{mode === 'combine' ? 'One link per SKU (whole folder)' : 'One link per image in the folder'} · tap to switch</span>
        <button onClick={() => setShowSettings(s => !s)} style={{ ...S.btnGhost, minHeight: 36, marginLeft: 'auto' }}>{showSettings ? 'Close Settings' : 'Settings'}</button>
      </div>
      {rootCount === 0 && (
        <div style={{ background: 'oklch(0.78 0.18 75 / .06)', border: '1px solid oklch(0.78 0.18 75 / .25)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 11, color: T.tx2 }}>
          No search folders configured yet — open Settings and add the Dropbox folder link(s) to search inside.
        </div>
      )}

      {/* flex-start, not the usual center: SkuInput is a two-row block (input +
          size chips / title line) whose input sits at the TOP. Without this the
          row defaults to `stretch` and every button grows to the full height of
          that block the moment a SKU resolves. Centring would instead drop them
          below the input they sit next to. */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <SkuInput value={sku} onChange={setSku} onKeyDown={e => { if (e.key === 'Enter') requestGenOne(); }} placeholder="Enter SKU e.g. 15003" style={{ ...S.fInput, width: 200, fontFamily: T.mono }} />
        {/* minHeight 36 matches S.fInput's height — the btn recipes set none and
            land at ~32px. Same as modeBtn above. */}
        <button onClick={requestGenOne} disabled={busy || !sku.trim()} style={{ ...S.btnPrimary, minHeight: 36, pointerEvents: busy ? 'none' : 'auto', opacity: busy || !sku.trim() ? 0.5 : 1 }}>{busy ? 'Generating…' : 'Generate Link'}</button>
        <button onClick={() => setShowPaste(p => !p)} style={{ ...S.btnGhost, minHeight: 36, color: T.ac2, border: '1px solid oklch(0.55 0.22 265 / .2)' }}>{showPaste ? 'Hide paste' : 'Paste SKUs'}</button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ''; }} />
        <button onClick={() => fileRef.current?.click()} disabled={bulkBusy} style={{ ...S.btnGhost, minHeight: 36, color: T.bl, border: '1px solid oklch(0.77 0.14 230 / .2)', background: 'oklch(0.77 0.14 230 / .06)', pointerEvents: bulkBusy ? 'none' : 'auto', opacity: bulkBusy ? 0.5 : 1 }}>{bulkBusy ? `Bulk… ${progress.done}/${progress.total}` : 'Bulk from Excel'}</button>
        {bulk && bulk.length > 0 && !bulkBusy && <button onClick={() => exportBulkXlsx(bulk)} style={{ ...S.btnGhost, minHeight: 36, color: T.gr, border: '1px solid oklch(0.72 0.19 145 / .2)', background: 'oklch(0.72 0.19 145 / .06)' }}>Export {bulk.length}</button>}
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

      {/* Save-to-sheet only in Combine view (owner's rule) — the sheet's IMAGE
          column takes the FOLDER link, and offering it while per-image links
          are on screen invited saving the wrong thing. Bulk gates the same. */}
      {active && <LinkResult result={active} saveUrl={mode === 'combine' ? saveUrl : undefined} canSave={canSave} saving={savingSheet} busy={busy} onPickCandidate={genOne} onCopy={copy} onSave={url => saveToSheet(url, active.sku)} />}
      {activeLoading && (
        <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: 14, marginBottom: 12, maxWidth: 720, fontSize: 11, color: T.tx3 }}>
          Generating {mode === 'combine' ? 'the folder link' : 'a link per image'}…
        </div>
      )}

      {bulk && bulk.length > 0 && (
        <>
          {canSave && !bulkBusy && bulkMode === 'combine' && bulk.some(r => r.status === 'ok') && (
            <button onClick={() => saveAllToSheet(bulk)} disabled={bulkSaving} style={{ ...S.btnGhost, marginBottom: 8, color: T.bl, border: '1px solid oklch(0.77 0.14 230 / .25)', background: 'oklch(0.77 0.14 230 / .06)', pointerEvents: bulkSaving ? 'none' : 'auto', opacity: bulkSaving ? 0.5 : 1 }}>{bulkSaving ? 'Saving…' : 'Save all to master sheet'}</button>
          )}
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', borderRadius: 8, border: `1px solid ${T.bd}` }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420 }}>
              <thead><tr>{['SKU', 'Status', 'Links'].map(c => <th key={c} style={{ ...S.thStyle, whiteSpace: 'nowrap' as const }}>{c}</th>)}</tr></thead>
              <tbody>
                {bulk.map((r, i) => (
                  <tr key={i}>
                    <td style={{ ...S.tdStyle, fontFamily: T.mono, fontWeight: 600 }}>{r.sku}</td>
                    <td style={{ ...S.tdStyle, color: r.status === 'ok' ? T.gr : r.status === 'error' ? T.re : T.tx3, fontSize: 11 }}>{r.status === 'pending' ? '…' : r.status === 'ok' ? `✓ ${r.links.length} link${r.links.length === 1 ? '' : 's'}` : r.message}</td>
                    {/* TAB-joined: pastes ACROSS one row (image1..N columns) — see LinkResult. */}
                    <td style={S.tdStyle}>{r.links.length > 0 && <button onClick={() => copy(r.links.map(l => l.url).join('\t'), `${r.sku} links`)} style={{ ...S.btnGhost, padding: '4px 10px', fontSize: 10 }}>Copy</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {!active && !activeLoading && !bulk && <div style={{ padding: 24, textAlign: 'center', color: T.tx3, fontSize: 11 }}>Enter a SKU and press Generate — or paste / import an Excel of SKUs for bulk links.</div>}

      {showSettings && <RootSettings addToast={addToast} onChanged={refreshRoots} />}
      {pendingGen && <FolderAskModal roots={roots} onPick={onAskPick} onClose={() => setPendingGen(null)} />}
    </div>
  );
}
