// The small product photo on a costing card: the ~4 KB thumb when it
// exists, else the full photo (and a one-time backfill of the thumb).
import { useState } from 'react';
import { T } from '../../../lib/theme';
import { thumbUrl, backfillThumb } from './costingThumbs';

export default function CostingThumb({ url, alt, size = 56 }: { url: string | null; alt: string; size?: number }) {
  const thumb = thumbUrl(url);
  const [full, setFull] = useState(!thumb);
  return (
    <div style={{ width: size, height: size, borderRadius: 8, overflow: 'hidden', background: T.s2, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {url
        ? <img src={full ? url : thumb!} alt={alt} width={size} height={size} loading="lazy" decoding="async"
            onError={() => { if (!full) { setFull(true); backfillThumb(url); } }}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        : <span style={{ fontSize: 9, color: T.tx3 }}>no photo</span>}
    </div>
  );
}
