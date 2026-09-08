// RateCard Studio → Catalog downloads: pick a catalog from the master sheet,
// find its folder in Dropbox, and get ONE download link for a pack holding
// only the SKU folders whose design is active. The pack is copied and
// zipped inside Dropbox (see odette-export/catalog.ts) — the app and its
// server never carry the photo bytes. Works signed in and on the seller link.
import { useEffect, useRef, useState } from 'react';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import CatalogPicker from '../ratecard/CatalogPicker';
import { catalogFolder, catalogPack, mb, CatalogCandidate, CatalogResult, PackResult } from './api';
import FolderList from './FolderList';

const POLL_MS = 2000;
const POLL_MAX = 90;   // 3 minutes of copying before we give up

export default function CatalogDownloads({ addToast, shareToken }: { addToast: (m: string, t?: string) => void; shareToken?: string }) {
  const [catalog, setCatalog] = useState('');
  const [finding, setFinding] = useState(false);
  const [candidates, setCandidates] = useState<CatalogCandidate[] | null>(null);
  const [result, setResult] = useState<CatalogResult | null>(null);
  const [packing, setPacking] = useState(false);
  const [pack, setPack] = useState<PackResult | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const find = async (name: string, path?: string) => {
    setFinding(true); setCandidates(null); setResult(null); setPack(null); setCatalog(name);
    const { result: r, candidates: c, error } = await catalogFolder(name, shareToken, path);
    if (!alive.current) return;
    setFinding(false);
    if (error) { addToast(error, 'error'); return; }
    if (c) { setCandidates(c); return; }
    if (r) setResult(r);
  };

  const download = async () => {
    if (!result || packing || result.totals.active === 0) return;
    setPacking(true); setPack(null);
    try {
      let r = await catalogPack(result.folder.name, result.folder.path, shareToken);
      for (let i = 0; r.pending && r.jobId && i < POLL_MAX && alive.current; i++) {
        await new Promise(res => setTimeout(res, POLL_MS));
        r = await catalogPack(result.folder.name, result.folder.path, shareToken, r.jobId);
      }
      if (!alive.current) return;
      if (r.error) throw new Error(r.error);
      if (r.pending || !r.url) throw new Error('Dropbox is still copying — try again in a minute');
      setPack(r);
      addToast(r.reused ? 'Pack ready — Dropbox already had it' : `Pack ready — ${r.count} design${r.count === 1 ? '' : 's'}, ${mb(r.bytes || 0)}`, 'success');
    } catch (e) { addToast(friendlyError(e), 'error'); }
    if (alive.current) setPacking(false);
  };

  const busy = finding || packing;

  return (
    <div style={{ animation: 'fi .15s ease', maxWidth: 560 }}>
      <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: 16, marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.tx, marginBottom: 2 }}>Catalog downloads</div>
        <div style={{ fontSize: 11, color: T.tx2, lineHeight: 1.5, marginBottom: 10 }}>Pick a catalog. Its folder is found in Dropbox and one zip is prepared with the photos of every <span style={{ color: T.gr }}>active</span> design — inactive designs are left out.</div>
        <CatalogPicker shareToken={shareToken} disabled={busy} addToast={addToast} onPick={n => find(n)} onlyActive hint="Type to search. Newest catalogs first; only catalogs with an active design are listed." />
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
        {result && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            {!pack && (
              <button type="button" className="touch44" onClick={download} disabled={busy || result.totals.active === 0}
                style={{ ...S.btnPrimary, minHeight: 44, flex: 1, pointerEvents: busy ? 'none' : 'auto', opacity: busy || result.totals.active === 0 ? 0.5 : 1 }}>
                {packing ? 'Preparing in Dropbox…' : `Prepare pack · ${result.totals.active} active`}
              </button>
            )}
            {pack?.url && (
              <a href={pack.url} target="_blank" rel="noopener noreferrer" className="touch44"
                style={{ ...S.btnPrimary, minHeight: 44, flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
                Download zip · {pack.count} design{pack.count === 1 ? '' : 's'} · {mb(pack.bytes || 0)}
              </a>
            )}
          </div>
        )}
        {packing && <div style={{ fontSize: 10, color: T.tx3, marginTop: 6 }}>Copying the active folders inside Dropbox — nothing downloads yet. Usually a few seconds.</div>}
        {pack?.url && <div style={{ fontSize: 10, color: T.tx3, marginTop: 6, lineHeight: 1.5 }}>Opens Dropbox, which sends the zip straight to you. The pack lives in your Dropbox under “DailyOffice Vendor Packs” and is refreshed automatically when the active designs change.</div>}
      </div>
    </div>
  );
}
