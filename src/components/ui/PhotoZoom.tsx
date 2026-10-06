// Full-screen photo viewer for a product thumbnail. Opens at once with the
// picture already on screen (the small thumbnail, scaled up), then swaps in
// the 2048px Dropbox version — fetched only now, on this tap. Tap the photo
// to zoom in at that spot (scroll/drag to look around), tap again to fit.
// Closes on ×, the backdrop, Esc or device Back.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { T } from '../../lib/theme';
import { skuBigPhoto } from '../../lib/skuThumbs';
import { useModalLock } from '../../hooks/useModalLock';
import { useBackClose } from '../../hooks/useBackClose';

const ZOOM = 2.5;

export default function PhotoZoom({ sku, src, full, onClose }: {
  sku: string;
  /** What is on screen now (thumbnail) — shown while the big one loads. */
  src: string;
  /** A full-size photo already known (e.g. the costing sheet's) when the
   *  thumbnail is not from Dropbox — shown as is, nothing fetched. */
  full?: string | null;
  onClose: () => void;
}) {
  useModalLock();
  useBackClose(true, onClose);
  const [shown, setShown] = useState(full || src);
  // A known full-size photo needs no fetch; otherwise ask Dropbox for it.
  const [loading, setLoading] = useState(!full);
  const [zoomed, setZoomed] = useState<{ w: number; x: number; y: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    let live = true;
    if (!full) skuBigPhoto(sku).then(url => { if (live) { if (url) setShown(url); setLoading(false); } });
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    window.addEventListener('keydown', esc);
    return () => { live = false; window.removeEventListener('keydown', esc); };
  }, [sku, full]);

  // Keep the tapped spot under the finger after zooming in.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || !zoomed) return;
    el.scrollLeft = zoomed.x * ZOOM - el.clientWidth / 2;
    el.scrollTop = zoomed.y * ZOOM - el.clientHeight / 2;
  }, [zoomed]);

  const tap = (e: React.MouseEvent<HTMLImageElement>) => {
    e.stopPropagation();
    if (zoomed) { setZoomed(null); return; }
    // Fitted, the <img> box fills the screen and the picture is letterboxed
    // inside it (object-fit: contain): find the picture, then the tap in it.
    const img = e.currentTarget, r = img.getBoundingClientRect();
    const k = Math.min(r.width / (img.naturalWidth || 1), r.height / (img.naturalHeight || 1));
    const pw = img.naturalWidth * k, ph = img.naturalHeight * k;
    const x = Math.min(pw, Math.max(0, e.clientX - r.left - (r.width - pw) / 2));
    const y = Math.min(ph, Math.max(0, e.clientY - r.top - (r.height - ph) / 2));
    setZoomed({ w: pw * ZOOM, x, y });
  };

  return createPortal(
    <div role="dialog" aria-label={`${sku} photo`} onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.92)', display: 'flex', flexDirection: 'column', animation: 'fi .15s ease' }}>
      <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <span style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 700, color: T.tx }}>{sku}</span>
        <span style={{ fontSize: 11, color: T.tx3 }}>{loading ? 'Loading full photo…' : zoomed ? 'Tap to fit' : 'Tap photo to zoom'}</span>
        <button type="button" onClick={onClose} aria-label="Close photo"
          style={{ marginLeft: 'auto', width: 44, height: 44, borderRadius: T.r, border: `1px solid ${T.bd2}`, background: T.glass2, color: T.tx2, fontSize: 20, lineHeight: 1, cursor: 'pointer' }}>&#215;</button>
      </div>
      <div ref={box} style={{ flex: 1, minHeight: 0, overflow: zoomed ? 'auto' : 'hidden', display: 'flex', padding: zoomed ? 0 : '0 12px max(12px, env(safe-area-inset-bottom))', WebkitOverflowScrolling: 'touch' }}>
        <img src={shown} alt={sku} onClick={tap} draggable={false}
          style={{ margin: 'auto', display: 'block', cursor: zoomed ? 'zoom-out' : 'zoom-in', userSelect: 'none',
            ...(zoomed ? { width: zoomed.w, maxWidth: 'none', maxHeight: 'none' } : { width: '100%', height: '100%', objectFit: 'contain' }) }} />
      </div>
    </div>,
    document.body,
  );
}
