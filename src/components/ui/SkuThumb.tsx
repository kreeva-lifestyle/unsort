// A SKU's product photo at a fixed size (Dropbox thumbnail via
// lib/skuThumbs, served from Storage). The box never changes size, so lists
// don't jump while photos arrive; the image is lazy and decoded off the main
// thread. Falls back to `fallback` (e.g. the costing sheet's photo), then to
// a quiet "no photo" tile.
import { memo, useState } from 'react';
import { T } from '../../lib/theme';
import { useSkuThumb } from '../../lib/skuThumbs';

function SkuThumb({ sku, size, fallback, radius = 10 }: { sku: string; size: number; fallback?: string | null; radius?: number }) {
  const thumb = useSkuThumb(sku);
  const [broken, setBroken] = useState<string | null>(null);
  const src = thumb && thumb !== broken ? thumb : fallback && fallback !== broken ? fallback : null;
  return (
    <div style={{ width: size, height: size, borderRadius: radius, overflow: 'hidden', background: T.s2, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {src ? (
        <img src={src} alt={sku} loading="lazy" decoding="async" onError={() => setBroken(src)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : thumb === undefined ? (
        null
      ) : (
        <span style={{ fontSize: Math.max(9, Math.round(size / 6)), color: T.tx3, textAlign: 'center', lineHeight: 1.2, padding: 2 }}>no photo</span>
      )}
    </div>
  );
}

export default memo(SkuThumb);
