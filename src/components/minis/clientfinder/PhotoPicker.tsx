// Pick which of a SKU's photos to reverse-search.
//
// The old behaviour searched whichever file happened to sort first in the
// Dropbox folder. If a competitor copied the back view or a detail shot, that
// was invisible — and you could not tell, because you never saw what was
// searched. Now the folder's photos are shown and you choose.
//
// Reuses the Dropbox Link Generator's plumbing rather than rebuilding it:
// `call` for linkgen and `thumbUrl`, which streams Dropbox's own pre-generated
// 256px JPEG through odette-export (browser-cached for a day), so listing a
// folder costs no storage and no Vision quota.
import { useState } from 'react';
import { T, S } from '../../../lib/theme';
import { call as dbxCall, thumbUrl, explainGen, type GenLink, type GenCandidate } from '../dropboxlinks/api';

export default function PhotoPicker({
  sku, selected, onSelect, addToast,
}: {
  sku: string;
  selected: string;
  onSelect: (url: string) => void;
  addToast: (m: string, t?: string) => void;
}) {
  const [links, setLinks] = useState<GenLink[] | null>(null);
  const [candidates, setCandidates] = useState<GenCandidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadedFor, setLoadedFor] = useState('');

  const load = async (folder?: string) => {
    const s = sku.trim().toUpperCase();
    if (!s || busy) return;
    setBusy(true); setLinks(null); setCandidates([]);
    try {
      const { status, data } = await dbxCall({ action: 'linkgen', sku: s, mode: 'separate', folder: folder || undefined });
      // Several folders share this SKU — a question, not a failure.
      if (!data?.ok && data?.candidates?.length) { setCandidates(data.candidates); return; }
      if (!data?.ok) { addToast(explainGen(data, status), 'error'); return; }
      const usable = (data.links || []).filter((l: GenLink) => l?.url && !l.error);
      setLinks(usable);
      setLoadedFor(s);
      if (usable.length === 1) onSelect(usable[0].url);
      if (!usable.length) addToast(`No photos found in the Dropbox folder for ${s}`, 'error');
    } catch (e) {
      addToast((e as Error)?.message || 'Could not load photos', 'error');
    } finally {
      setBusy(false);
    }
  };

  const stale = loadedFor && loadedFor !== sku.trim().toUpperCase();

  return (
    <div style={{ marginTop: 10 }}>
      <button
        onClick={() => load()}
        disabled={busy || !sku.trim()}
        style={{ ...S.btnGhost, minHeight: 44, pointerEvents: busy || !sku.trim() ? 'none' : 'auto', opacity: busy || !sku.trim() ? 0.5 : 1 }}
      >
        {busy ? 'Loading photos…' : links && !stale ? 'Reload photos' : 'Load photos'}
      </button>

      {candidates.length > 0 && (
        <div style={{ background: 'rgba(245,158,11,.06)', border: '1px solid rgba(245,158,11,.2)', borderRadius: 6, padding: 10, marginTop: 10 }}>
          <div style={{ fontSize: 11, color: T.yl, marginBottom: 8 }}>
            &ldquo;{sku.trim().toUpperCase()}&rdquo; is in {candidates.length} folders — pick the one you mean:
          </div>
          {candidates.map((c, i) => (
            <button key={i} onClick={() => load(c.path)} disabled={busy}
              style={{ ...S.btnGhost, display: 'block', width: '100%', textAlign: 'left', marginTop: i === 0 ? 0 : 6, padding: '10px 12px', minHeight: 44, fontSize: 11, fontFamily: T.mono }}>
              📁 {c.display}
            </button>
          ))}
        </div>
      )}

      {links && links.length > 0 && !stale && (
        <>
          <div style={{ fontSize: 10, color: T.tx3, margin: '10px 0 6px' }}>
            {links.length} photo{links.length === 1 ? '' : 's'} — tap the one to search
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: 6 }}>
            {links.map(l => {
              const on = selected === l.url;
              return (
                <button
                  key={l.url}
                  onClick={() => onSelect(l.url)}
                  title={l.name}
                  style={{
                    padding: 0, borderRadius: 8, overflow: 'hidden', cursor: 'pointer',
                    aspectRatio: '1', background: T.s,
                    border: on ? `2px solid ${T.ac}` : `1px solid ${T.bd}`,
                    outline: on ? `2px solid ${T.ac3}` : 'none',
                  }}
                >
                  <img
                    src={thumbUrl(l.url)}
                    alt={l.name}
                    loading="lazy"
                    onError={e => { (e.target as HTMLImageElement).style.opacity = '0.15'; }}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                </button>
              );
            })}
          </div>
        </>
      )}

      {stale && (
        <div style={{ fontSize: 10, color: T.yl, marginTop: 6 }}>
          SKU changed — load photos again.
        </div>
      )}
    </div>
  );
}
