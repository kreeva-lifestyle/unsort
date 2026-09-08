// RateCard Studio → Catalog downloads: pick a catalog from the master sheet,
// find its folder in Dropbox, and download ONE zip holding only the SKU
// folders whose design is active. Works signed in and on the seller link.
import { useCallback, useEffect, useRef, useState } from 'react';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import CatalogPicker from '../ratecard/CatalogPicker';
import { catalogFolder, catalogList, fetchFolderZip, CatalogCandidate, CatalogResult } from './api';
import { buildPack, mb, PackProgress } from './packZip';
import FolderList from './FolderList';

const BIG = 400 * 1024 * 1024;

export default function CatalogDownloads({ addToast, shareToken }: { addToast: (m: string, t?: string) => void; shareToken?: string }) {
  const [catalog, setCatalog] = useState('');
  const [finding, setFinding] = useState(false);
  const [candidates, setCandidates] = useState<CatalogCandidate[] | null>(null);
  const [result, setResult] = useState<CatalogResult | null>(null);
  const [prog, setProg] = useState<PackProgress | null>(null);
  const [pack, setPack] = useState<{ url: string; name: string; size: number } | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const source = useCallback(() => catalogList(shareToken), [shareToken]);
  useEffect(() => () => { ctrl.current?.abort(); if (pack) URL.revokeObjectURL(pack.url); }, [pack]);

  const find = async (name: string, path?: string) => {
    setFinding(true); setCandidates(null); setResult(null); setPack(null); setCatalog(name);
    const { result: r, candidates: c, error } = await catalogFolder(name, shareToken, path);
    setFinding(false);
    if (error) { addToast(error, 'error'); return; }
    if (c) { setCandidates(c); return; }
    if (r) setResult(r);
  };

  const download = async () => {
    if (!result || prog) return;
    const active = result.items.filter(i => i.status === 'active');
    if (active.length === 0) { addToast('No active design in this catalog folder', 'error'); return; }
    const ac = new AbortController(); ctrl.current = ac;
    setPack(null); setProg({ done: 0, total: active.length, bytes: 0, current: null });
    try {
      const blob = await buildPack(active, (p, s, onBytes) => fetchFolderZip(p, shareToken, s, onBytes), setProg, ac.signal);
      const url = URL.createObjectURL(blob);
      const name = `${result.folder.name} (active).zip`;
      setPack({ url, name, size: blob.size });
      const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      addToast(`${name} ready — ${active.length} design${active.length === 1 ? '' : 's'}, ${mb(blob.size)}`, 'success');
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') addToast('Download cancelled', 'info');
      else addToast(friendlyError(e), 'error');
    }
    setProg(null); ctrl.current = null;
  };

  const busy = finding || !!prog;
  const pct = prog ? Math.round((prog.done / Math.max(1, prog.total)) * 100) : 0;

  return (
    <div style={{ animation: 'fi .15s ease', maxWidth: 560 }}>
      <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: 16, marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.tx, marginBottom: 2 }}>Catalog downloads</div>
        <div style={{ fontSize: 11, color: T.tx2, lineHeight: 1.5, marginBottom: 10 }}>Pick a catalog. Its folder is found in Dropbox and one zip is built with the photos of every <span style={{ color: T.gr }}>active</span> design — inactive designs are left out.</div>
        <CatalogPicker shareToken={shareToken} source={source} disabled={busy} addToast={addToast} onPick={n => find(n)} onlyActive hint="Only catalogs with at least one active design are listed." />
        {finding && <div style={{ fontSize: 11, color: T.tx3 }}>Looking for “{catalog}” in Dropbox…</div>}
        {candidates && (
          <div style={{ marginTop: 6 }}>
            <div style={{ fontSize: 11, color: T.yl, marginBottom: 6 }}>“{catalog}” exists in {candidates.length} places — which folder?</div>
            {candidates.map(c => (
              <button key={c.path} type="button" className="touch44" onClick={() => find(catalog, c.path)} style={{ ...S.btnGhost, width: '100%', textAlign: 'left', marginBottom: 6, minHeight: 44, fontFamily: T.mono, fontSize: 11 }}>{c.display}</button>
            ))}
          </div>
        )}
        {result && <FolderList r={result} />}
        {result && result.totals.bytes > BIG && !prog && (
          <div style={{ fontSize: 11, color: T.yl, background: 'oklch(0.78 0.18 75 / .08)', border: '1px solid oklch(0.78 0.18 75 / .25)', borderRadius: 8, padding: '7px 10px', marginTop: 8 }}>
            About {mb(result.totals.bytes)} — the pack is assembled on this device, so a computer is a safer place to download it than a phone.
          </div>
        )}
        {prog && (
          <div style={{ marginTop: 10 }}>
            <div style={{ height: 6, borderRadius: 3, background: T.glass2, overflow: 'hidden' }}><div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg, ${T.ac}, ${T.ac2})`, transition: 'width .2s' }} /></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: T.tx3, marginTop: 4, fontFamily: T.mono }}>
              <span>{prog.done} / {prog.total}{prog.current ? ` · ${prog.current}` : ''}</span><span>{mb(prog.bytes)} fetched</span>
            </div>
          </div>
        )}
        {result && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button type="button" className="touch44" onClick={download} disabled={busy || result.totals.active === 0}
              style={{ ...S.btnPrimary, minHeight: 44, flex: 1, pointerEvents: busy ? 'none' : 'auto', opacity: busy || result.totals.active === 0 ? 0.5 : 1 }}>
              {prog ? 'Building pack…' : `Download active (${result.totals.active})`}
            </button>
            {prog && <button type="button" className="touch44" onClick={() => ctrl.current?.abort()} style={{ ...S.btnDanger, minHeight: 44 }}>Cancel</button>}
            {pack && !prog && <a href={pack.url} download={pack.name} className="touch44" style={{ ...S.btnGhost, minHeight: 44, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>Save again · {mb(pack.size)}</a>}
          </div>
        )}
      </div>
    </div>
  );
}
