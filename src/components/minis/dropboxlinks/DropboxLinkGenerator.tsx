// Dropbox Link Generator — type a SKU (or import an Excel of SKUs) and get
// view-only Dropbox links: COMBINE = one link for the SKU's folder,
// SEPARATE = a link per image directly inside it. Folder search happens
// server-side inside the admin-configured Search Folders.
import { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import { call, thumbUrl, GenResult, GenLink } from './api';
import RootSettings from './RootSettings';

type Mode = 'combine' | 'separate';
interface BulkRow { sku: string; status: 'pending' | 'ok' | 'error'; message?: string; links: GenLink[] }

export default function DropboxLinkGenerator({ addToast }: { addToast: (m: string, t?: string) => void }) {
  const [mode, setMode] = useState<Mode>('combine');
  const [sku, setSku] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GenResult | null>(null);
  const [rootCount, setRootCount] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [bulk, setBulk] = useState<BulkRow[] | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const fileRef = useRef<HTMLInputElement>(null);

  const refreshRoots = () => call({ action: 'linkgen_roots', op: 'list' }).then(({ data }) => {
    if (data.ok) setRootCount((data.roots || []).filter((r: any) => r.enabled !== false).length);
  }).catch(() => {});
  useEffect(() => { refreshRoots(); }, []);

  const explain = (data: any, status: number): string => {
    if (data?.error === 'dropbox_not_connected') return 'Dropbox is not connected — an admin can connect it in Trackly → Image Link Check.';
    if (data?.error === 'no_roots') return 'No search folders configured — open Settings and add the Dropbox folder link(s) to search inside.';
    // Server messages are already human-written ("No folder named…", "Found in
    // 2 places…") — show them VERBATIM; friendlyError only for the unknown.
    const server = String(data?.details || data?.error || '').trim();
    if (server) return server;
    return friendlyError(`Failed (${status})`);
  };

  const genOne = async (folderPath?: string) => {
    const s = (folderPath ? result?.sku || sku : sku).trim().toUpperCase();
    if (busy || !s) return;
    setBusy(true); if (!folderPath) setResult(null);
    try {
      const { status, data } = await call({ action: 'linkgen', sku: s, mode, folder: folderPath || undefined });
      if (!data.ok) {
        setResult({ ok: false, sku: s, error: explain(data, status), folder: data.folder, candidates: data.candidates });
        addToast(data.candidates?.length ? `${s} found in ${data.candidates.length} places — tap the folder you want` : explain(data, status), data.candidates?.length ? 'info' : 'error');
      } else {
        setResult(data);
        if (data.note) addToast(data.note, 'info');
        addToast(`${(data.links || []).filter((l: GenLink) => l.url).length} link${(data.links || []).length === 1 ? '' : 's'} ready for ${s}`, 'success');
      }
    } catch (e) { addToast(friendlyError(e), 'error'); }
    setBusy(false);
  };

  const copy = async (text: string, what = 'Link') => {
    try { await navigator.clipboard.writeText(text); addToast(`${what} copied`, 'success'); }
    catch { addToast('Could not copy — long-press the link instead', 'error'); }
  };

  const importBulk = (file: File) => {
    const reader = new FileReader();
    reader.onload = async ev => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: 'array' });
        const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
        let skus = grid.map(r => String(r?.[0] ?? '').trim().toUpperCase()).filter(Boolean);
        if (skus.length && /SKU|DESIGN|CODE|STYLE/.test(skus[0])) skus = skus.slice(1);
        skus = [...new Set(skus)];
        if (skus.length === 0) { addToast('Column A has no SKUs', 'error'); return; }
        if (skus.length > 300) { addToast(`${skus.length} SKUs found — doing the first 300`, 'info'); skus = skus.slice(0, 300); }
        const rows: BulkRow[] = skus.map(s => ({ sku: s, status: 'pending', links: [] }));
        setBulk(rows); setBulkBusy(true); setProgress({ done: 0, total: rows.length });
        let cursor = 0, done = 0;
        const worker = async () => {
          while (cursor < rows.length) {
            const i = cursor++;
            try {
              const { status, data } = await call({ action: 'linkgen', sku: rows[i].sku, mode });
              if (data.ok) rows[i] = { ...rows[i], status: 'ok', links: (data.links || []).filter((l: GenLink) => l.url), message: data.note };
              else rows[i] = { ...rows[i], status: 'error', message: explain(data, status) };
            } catch (e) { rows[i] = { ...rows[i], status: 'error', message: friendlyError(e) }; }
            done++; setProgress({ done, total: rows.length }); setBulk([...rows]);
          }
        };
        await Promise.all(Array.from({ length: 3 }, () => worker()));
        const ok = rows.filter(r => r.status === 'ok').length;
        addToast(`${ok} of ${rows.length} SKUs got links${ok < rows.length ? ' — see the list for the rest' : ''}`, ok > 0 ? 'success' : 'error');
      } catch (e) { addToast(friendlyError(e), 'error'); }
      setBulkBusy(false);
    };
    reader.readAsArrayBuffer(file);
  };

  const exportBulk = () => {
    if (!bulk || bulk.length === 0) { addToast('Nothing to export', 'error'); return; }
    const maxLinks = Math.max(1, ...bulk.map(r => r.links.length));
    const header = ['SKU', 'STATUS', ...Array.from({ length: maxLinks }, (_, i) => maxLinks === 1 ? 'LINK' : `LINK ${i + 1}`)];
    const rows = bulk.map(r => [r.sku, r.status === 'ok' ? 'OK' : (r.message || 'Failed'), ...r.links.map(l => l.url)]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...rows]), 'Dropbox Links');
    XLSX.writeFile(wb, `Dropbox_Links_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const modeBtn = (m: Mode, label: string, hint: string) => (
    <button onClick={() => { setMode(m); setResult(null); }} title={hint}
      style={{ ...S.btnGhost, minHeight: 36, border: `1px solid ${mode === m ? 'rgba(99,102,241,.5)' : T.bd2}`, background: mode === m ? 'rgba(99,102,241,.12)' : 'transparent', color: mode === m ? T.ac2 : T.tx3, fontWeight: 600 }}>
      {label}
    </button>
  );
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div style={{ animation: 'fi .15s ease' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {modeBtn('combine', 'Combine', 'One link for the whole SKU folder')}
        {modeBtn('separate', 'Separate', 'A link for every image inside the SKU folder')}
        <span style={{ fontSize: 10, color: T.tx3 }}>{mode === 'combine' ? 'One link per SKU (whole folder)' : 'One link per image in the folder'}</span>
        <button onClick={() => setShowSettings(s => !s)} style={{ ...S.btnGhost, marginLeft: 'auto' }}>{showSettings ? 'Close Settings' : 'Settings'}</button>
      </div>
      {rootCount === 0 && (
        <div style={{ background: 'rgba(251,191,36,.06)', border: '1px solid rgba(251,191,36,.25)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 11, color: T.tx2 }}>
          No search folders configured yet — open Settings and add the Dropbox folder link(s) to search inside.
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input value={sku} onChange={e => setSku(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') genOne(); }} placeholder="Enter SKU e.g. 15003" style={{ ...S.fInput, width: 200, fontFamily: T.mono }} />
        <button onClick={() => genOne()} disabled={busy || !sku.trim()} style={{ ...S.btnPrimary, pointerEvents: busy ? 'none' : 'auto', opacity: busy || !sku.trim() ? 0.5 : 1 }}>{busy ? 'Generating…' : 'Generate Link'}</button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) importBulk(f); e.target.value = ''; }} />
        <button onClick={() => fileRef.current?.click()} disabled={bulkBusy} style={{ ...S.btnGhost, color: T.bl, border: '1px solid rgba(56,189,248,.2)', background: 'rgba(56,189,248,.06)', pointerEvents: bulkBusy ? 'none' : 'auto', opacity: bulkBusy ? 0.5 : 1 }}>{bulkBusy ? `Bulk… ${progress.done}/${progress.total}` : 'Bulk from Excel'}</button>
        {bulk && bulk.length > 0 && !bulkBusy && <button onClick={exportBulk} style={{ ...S.btnGhost, color: T.gr, border: '1px solid rgba(34,197,94,.2)', background: 'rgba(34,197,94,.06)' }}>Export {bulk.length}</button>}
      </div>
      {bulkBusy && progress.total > 0 && (
        <div style={{ maxWidth: 420, height: 6, background: 'rgba(255,255,255,.05)', borderRadius: 3, marginBottom: 12, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#6366F1,#818CF8)', borderRadius: 3, transition: 'width .4s' }} />
        </div>
      )}

      {result && (
        <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${result.ok ? 'rgba(34,197,94,.25)' : 'rgba(239,68,68,.25)'}`, borderRadius: 10, padding: 14, marginBottom: 12, maxWidth: 720 }}>
          <div style={{ fontSize: 12, fontWeight: 700, fontFamily: T.mono, color: T.tx, marginBottom: 2 }}>{result.sku}</div>
          {result.folder && <div style={{ fontSize: 10, color: T.tx3, marginBottom: 8 }}>{result.folder}</div>}
          {!result.ok && <div style={{ fontSize: 11, color: result.candidates?.length ? T.yl : T.re, lineHeight: 1.6 }}>{result.error}</div>}
          {(result.candidates || []).map((c, i) => (
            <button key={i} onClick={() => genOne(c.path)} disabled={busy}
              style={{ ...S.btnGhost, display: 'block', width: '100%', textAlign: 'left', marginTop: 8, padding: '9px 12px', fontSize: 11, fontFamily: T.mono, pointerEvents: busy ? 'none' : 'auto', opacity: busy ? 0.5 : 1 }}>
              📁 {c.display}
            </button>
          ))}
          {(result.links || []).map((l, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '7px 0', borderTop: i > 0 ? `1px solid ${T.bd}` : 'none' }}>
              {l.url && /\.(jpe?g|png|webp|heic|heif|gif|bmp|tiff?)$/i.test(l.name) && (
                <img src={thumbUrl(l.url)} alt="" loading="lazy"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, border: `1px solid ${T.bd}`, background: 'rgba(255,255,255,0.03)', flexShrink: 0 }} />
              )}
              <span style={{ flex: 1, fontSize: 11, color: T.tx2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</span>
              {l.url ? <>
                <button onClick={() => copy(l.url)} style={{ ...S.btnGhost, ...{ padding: '4px 10px', fontSize: 10 } }}>Copy</button>
                <a href={l.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: T.bl }}>Open</a>
              </> : <span style={{ fontSize: 10, color: T.re }}>{l.error || 'failed'}</span>}
            </div>
          ))}
          {result.ok && (result.links || []).filter(l => l.url).length > 1 && (
            <button onClick={() => copy((result.links || []).filter(l => l.url).map(l => l.url).join('\n'), 'All links')} style={{ ...S.btnGhost, marginTop: 8, padding: '4px 10px', fontSize: 10 }}>Copy all</button>
          )}
          {result.note && <div style={{ fontSize: 10, color: T.yl, marginTop: 8 }}>{result.note}</div>}
        </div>
      )}

      {bulk && bulk.length > 0 && (
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
      )}
      {!result && !bulk && <div style={{ padding: 24, textAlign: 'center', color: T.tx3, fontSize: 11 }}>Enter a SKU and press Generate — or import an Excel with SKUs in column A for bulk links.</div>}

      {showSettings && <RootSettings addToast={addToast} onChanged={refreshRoots} />}
    </div>
  );
}
