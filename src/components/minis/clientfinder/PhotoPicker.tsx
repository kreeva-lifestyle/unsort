// Pick which of a SKU's photos to reverse-search.
//
// The photos load BY THEMSELVES once the typed SKU resolves to a real design.
// There used to be a "Load photos" button; it was a step the app could take
// on its own and existed only because the picker was bolted on afterwards.
//
// Loading is gated on the SKU existing in product_catalog (via resolveSku) and
// debounced. That precision is the whole reason this is safe to automate:
// without it, every keystroke would fire a Dropbox folder listing.
//
// Several photos can be selected. Each one searched is a separate Vision call,
// so the count is surfaced on the button in ClientFinder rather than hidden.
import { useState, useEffect, useRef } from 'react';
import { T, S, Icon } from '../../../lib/theme';
import { useProductCatalog, resolveSku } from '../../../hooks/useProductCatalog';
import { call as dbxCall, thumbUrl, explainGen, type GenLink, type GenCandidate } from '../dropboxlinks/api';

const DEBOUNCE_MS = 400;

export default function PhotoPicker({
  sku, selected, onToggle, onReplaceAll,
}: {
  sku: string;
  selected: string[];
  onToggle: (url: string) => void;
  /** Used to pre-select the first photo, and to clear on a new SKU. */
  onReplaceAll: (urls: string[]) => void;
}) {
  const { index } = useProductCatalog();
  const [links, setLinks] = useState<GenLink[] | null>(null);
  const [candidates, setCandidates] = useState<GenCandidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState('');
  const [loadedFor, setLoadedFor] = useState('');

  // The SKU whose photos are on screen. Kept in a ref so the debounce effect
  // does not re-run just because a load finished.
  const loadedRef = useRef('');
  loadedRef.current = loadedFor;

  const load = async (s: string, folder?: string) => {
    if (!s) return;
    setBusy(true); setLinks(null); setCandidates([]); setFailed('');
    try {
      const { status, data } = await dbxCall({ action: 'linkgen', sku: s, mode: 'separate', folder: folder || undefined });
      // Several folders share this SKU — a question, not a failure.
      if (!data?.ok && data?.candidates?.length) { setCandidates(data.candidates); return; }
      if (!data?.ok) { setFailed(explainGen(data, status)); return; }
      const usable = (data.links || []).filter((l: GenLink) => l?.url && !l.error);
      setLinks(usable);
      setLoadedFor(s);
      // Pre-select the FIRST photo only. Selecting all would multiply the cost
      // of a single tap without the user having asked for it.
      onReplaceAll(usable.length ? [usable[0].url] : []);
      if (!usable.length) setFailed(`No photos in the Dropbox folder for ${s}`);
    } catch (e) {
      setFailed((e as Error)?.message || 'Could not load photos');
    } finally {
      setBusy(false);
    }
  };

  // Auto-load, but ONLY for a SKU that actually exists. A folder listing is a
  // real Dropbox round trip; firing one for "DR" or a typo would be waste.
  useEffect(() => {
    const s = sku.trim().toUpperCase();
    if (!s) { setLinks(null); setCandidates([]); setFailed(''); setLoadedFor(''); onReplaceAll([]); return; }
    if (s === loadedRef.current) return;
    if (!resolveSku(index, s)) return;              // not a real design (yet)
    const t = setTimeout(() => { load(s); }, DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sku, index]);

  const shown = links && loadedFor === sku.trim().toUpperCase() ? links : null;

  return (
    <div style={{ marginTop: 10 }}>
      {busy && <div style={{ fontSize: 10, color: T.tx3 }}>Loading photos…</div>}

      {candidates.length > 0 && (
        <div style={{ background: 'rgba(245,158,11,.06)', border: '1px solid rgba(245,158,11,.2)', borderRadius: 6, padding: 10 }}>
          <div style={{ fontSize: 11, color: T.yl, marginBottom: 8 }}>
            &ldquo;{sku.trim().toUpperCase()}&rdquo; is in {candidates.length} folders — pick the one you mean:
          </div>
          {candidates.map((c, i) => (
            <button key={i} onClick={() => load(sku.trim().toUpperCase(), c.path)} disabled={busy}
              style={{ ...S.btnGhost, display: 'block', width: '100%', textAlign: 'left', marginTop: i === 0 ? 0 : 6, padding: '10px 12px', minHeight: 44, fontSize: 11, fontFamily: T.mono }}>
              <span style={{ display: 'inline-flex', verticalAlign: '-2px', marginRight: 4 }}><Icon name="folder" size={12} /></span>{c.display}
            </button>
          ))}
        </div>
      )}

      {failed && !busy && (
        <div style={{ fontSize: 11, color: T.re, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>{failed}</span>
          <button onClick={() => load(sku.trim().toUpperCase())} style={{ ...S.btnGhost, ...S.btnSm, minHeight: 32 }}>Retry</button>
        </div>
      )}

      {shown && shown.length > 0 && (
        <>
          <div style={{ fontSize: 10, color: T.tx3, margin: '2px 0 6px' }}>
            {shown.length} photo{shown.length === 1 ? '' : 's'} — tap to select, tap again to remove
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: 6 }}>
            {shown.map(l => {
              const on = selected.includes(l.url);
              return (
                <button
                  key={l.url}
                  onClick={() => onToggle(l.url)}
                  title={l.name}
                  style={{
                    position: 'relative', padding: 0, borderRadius: 8, overflow: 'hidden',
                    cursor: 'pointer', aspectRatio: '1', background: T.s,
                    border: on ? `2px solid ${T.ac}` : `1px solid ${T.bd}`,
                  }}
                >
                  <img
                    src={thumbUrl(l.url)}
                    alt={l.name}
                    loading="lazy"
                    onError={e => { (e.target as HTMLImageElement).style.opacity = '0.15'; }}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: on ? 1 : 0.72 }}
                  />
                  {on && (
                    <span style={{
                      position: 'absolute', top: 3, right: 3, width: 18, height: 18, borderRadius: '50%',
                      background: T.ac, color: '#fff', fontSize: 11, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>✓</span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
