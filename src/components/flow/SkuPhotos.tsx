// A design's photos, loaded by themselves the moment the SKU is a real design:
// the costing sheet's photo first, then the design's Dropbox folder (the same
// lookup Client Finder uses). Tap a thumbnail to see it large. Cached per SKU
// for the session, so reopening a pipeline shows them at once.
import { useEffect, useState } from 'react';
import { T } from '../../lib/theme';
import { useProductCatalog, resolveSku } from '../../hooks/useProductCatalog';
import { call as dbxCall, thumbSrc, explainGen, type GenLink } from '../minis/dropboxlinks/api';
import { skuKey } from './skuFinds';

type Pic = { thumb: string; full: string };
type Photos = { pics: Pic[]; note: string };
// A Dropbox share link opened as the image itself (raw=1) for the large view;
// the list uses the edge function's small cached thumbnail (its signed URL,
// or the full photo if the server sent none).
const rawUrl = (u: string) => { try { const x = new URL(u); x.searchParams.delete('dl'); x.searchParams.set('raw', '1'); return x.toString(); } catch { return u; } };
// Thumbnail URLs are signed and expire 6-12 h after linkgen issues them, so a
// cached SKU is fetched again after 5 h instead of keeping dead URLs all day.
const CACHE_MS = 5 * 3600_000;
const cache = new Map<string, { p: Promise<Photos>; at: number }>();

async function dropboxPhotos(k: string): Promise<Photos> {
  const { status, data } = await dbxCall({ action: 'linkgen', sku: k, mode: 'separate' });
  if (!data?.ok) {
    if (data?.candidates?.length) {
      // The design sits in more than one folder: use the first, like a person would.
      const again = await dbxCall({ action: 'linkgen', sku: k, mode: 'separate', folder: data.candidates[0].path });
      if (again.data?.ok) return toPhotos(again.data.links);
    }
    return { pics: [], note: explainGen(data, status) };
  }
  return toPhotos(data.links);
}
const toPhotos = (links: GenLink[] | undefined): Photos => {
  const ok = (links || []).filter(l => l?.url && !l.error).slice(0, 12);
  return { pics: ok.map(l => ({ thumb: thumbSrc(l) || rawUrl(l.url), full: rawUrl(l.url) })), note: ok.length ? '' : 'No photos in its Dropbox folder' };
};

/** Photos for a SKU: the costing image, then the Dropbox folder's photos. Waits until the SKU is a real design. */
export function useSkuPhotos(sku: string | null | undefined, costingImage: string | null) {
  const { index } = useProductCatalog();
  const k = skuKey(sku);
  const [state, setState] = useState<{ for: string; p: Photos | null; busy: boolean }>({ for: '', p: null, busy: false });
  useEffect(() => {
    if (!k || !resolveSku(index, k)) { setState({ for: '', p: null, busy: false }); return; }
    let alive = true;
    const t = setTimeout(() => {
      setState({ for: k, p: null, busy: true });
      const hit = cache.get(k);
      let p = hit && Date.now() - hit.at < CACHE_MS ? hit.p : undefined;
      if (!p) { p = dropboxPhotos(k); cache.set(k, { p, at: Date.now() }); }
      p.then(r => { if (alive) setState({ for: k, p: r, busy: false }); })
        .catch(e => { cache.delete(k); if (alive) setState({ for: k, p: { pics: [], note: (e as Error)?.message || 'Could not load photos' }, busy: false }); });
    }, 350);
    return () => { alive = false; clearTimeout(t); };
  }, [k, index]);
  const dbx = state.for === k ? state.p : null;
  const pics: Pic[] = [...(costingImage ? [{ thumb: costingImage, full: costingImage }] : []), ...(dbx?.pics || [])];
  return { pics, busy: state.for === k && state.busy, note: dbx?.note || '' };
}

export default function SkuPhotos({ sku, costingImage, height = 72 }: { sku: string | null | undefined; costingImage: string | null; height?: number }) {
  const { pics, busy, note } = useSkuPhotos(sku, costingImage);
  const [big, setBig] = useState<string | null>(null);
  useEffect(() => { setBig(null); }, [sku]);
  if (!pics.length && !busy && !note) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {big && (
        <button type="button" onClick={() => setBig(null)} aria-label="Close photo" style={{ padding: 0, border: `1px solid ${T.bd}`, borderRadius: 10, overflow: 'hidden', background: T.s, cursor: 'zoom-out' }}>
          <img src={big} alt={`${sku} large`} style={{ width: '100%', maxHeight: 320, objectFit: 'contain', display: 'block' }} />
        </button>
      )}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 2 }}>
        {pics.map(({ thumb, full }) => (
          <button key={thumb} type="button" onClick={() => setBig(big === full ? null : full)} aria-label="Show photo large"
            style={{ flexShrink: 0, width: height, height, padding: 0, borderRadius: 8, overflow: 'hidden', cursor: 'zoom-in', background: T.s, border: big === full ? `2px solid ${T.ac}` : `1px solid ${T.bd}` }}>
            <img src={thumb} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </button>
        ))}
        {busy && <span style={{ alignSelf: 'center', fontSize: 11, color: T.tx3, whiteSpace: 'nowrap' }}>Loading photos…</span>}
      </div>
      {note && !busy && <span style={{ fontSize: 10, color: T.tx3 }}>{note}</span>}
    </div>
  );
}
