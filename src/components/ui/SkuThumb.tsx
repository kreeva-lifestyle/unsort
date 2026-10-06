// A SKU's product photo at a fixed size (Dropbox thumbnail via
// lib/skuThumbs, served from Storage). The box never changes size, so lists
// don't jump while photos arrive; the image is lazy and decoded off the main
// thread. Falls back to `fallback` (e.g. the costing sheet's photo), then to
// a quiet "no photo" tile. With `zoom`, tapping the photo opens it full
// screen (PhotoZoom loads the big version only then).
import { memo, useState } from 'react';
import { T } from '../../lib/theme';
import { useSkuThumb } from '../../lib/skuThumbs';
import PhotoZoom from './PhotoZoom';

function SkuThumb({ sku, size, fallback, full, zoom = false, radius = 10 }: {
  sku: string; size: number; fallback?: string | null; radius?: number;
  /** Tap to view full screen. */
  zoom?: boolean;
  /** Full-size version of `fallback`, for the zoom view. */
  full?: string | null;
}) {
  const thumb = useSkuThumb(sku);
  const [broken, setBroken] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const src = thumb && thumb !== broken ? thumb : fallback && fallback !== broken ? fallback : null;
  const canZoom = zoom && !!src;
  return (<>
    <div onClick={canZoom ? () => setOpen(true) : undefined} role={canZoom ? 'button' : undefined} tabIndex={canZoom ? 0 : undefined}
      onKeyDown={canZoom ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true); } } : undefined}
      aria-label={canZoom ? `View ${sku} photo` : undefined} title={canZoom ? 'View photo' : undefined}
      style={{ width: size, height: size, borderRadius: radius, overflow: 'hidden', background: T.s2, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: canZoom ? 'zoom-in' : undefined }}>
      {src ? (
        <img src={src} alt={sku} loading="lazy" decoding="async" onError={() => setBroken(src)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : thumb === undefined ? (
        null
      ) : (
        <span style={{ fontSize: Math.max(9, Math.round(size / 6)), color: T.tx3, textAlign: 'center', lineHeight: 1.2, padding: 2 }}>no photo</span>
      )}
    </div>
    {/* A sibling, not a child: portal clicks bubble through React parents. */}
    {open && src && <PhotoZoom sku={sku} src={src} full={src === thumb ? null : full ?? src} onClose={() => setOpen(false)} />}
  </>);
}

export default memo(SkuThumb);
