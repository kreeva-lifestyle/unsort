// Telegram videos of a product, shown in the photo area: a native player
// (controls, metadata only until played, inline on iPhone) with a "Video"
// badge. Shopify and the AI never get these — they use the photos only.
import type { CSSProperties } from 'react';
import { pbImageUrl } from '../../../data/pbFunctions';
import type { ProductDetail } from '../../../data/products';
import { megabytes } from '../../../format';
import { PB } from '../../../pbTheme';

export type Media = ProductDetail['pb_product_images'][number];

/** Photos first (the cover is always a photo), videos apart. */
export const splitMedia = (all: Media[]) => ({
  photos: all.filter(m => m.kind !== 'video'),
  videos: all.filter(m => m.kind === 'video'),
});

export const mediaCount = (photos: number, videos: number) =>
  [`${photos} photo${photos === 1 ? '' : 's'}`, videos ? `${videos} video${videos === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');

const badge: CSSProperties = {
  position: 'absolute', bottom: 56, left: 8, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px',
  borderRadius: PB.r.pill, background: PB.sheet, border: `1px solid ${PB.tileBd}`, color: PB.tx, fontSize: 12, fontWeight: 600,
  lineHeight: 1.4, pointerEvents: 'none', whiteSpace: 'nowrap',
};

export function VideoCell({ v, n, style }: { v: Media; n: number; style?: CSSProperties }) {
  const size = megabytes(v.bytes);
  return (
    <div style={{ position: 'relative', flexShrink: 0, borderRadius: PB.r.photo, overflow: 'hidden', background: PB.ctl, border: `1px solid ${PB.tileBd}`, ...style }}>
      <video src={pbImageUrl(v.path)} controls preload="metadata" playsInline aria-label={`Video ${n}${size ? `, ${size}` : ''}`}
        style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', background: PB.bg }} />
      <span style={badge} aria-hidden="true">
        <svg viewBox="0 0 24 24" width={12} height={12} focusable="false" style={{ fill: 'currentColor' }}><path d="M7 4.5v15l12-7.5z" /></svg>
        Video{size && ` · ${size}`}
      </span>
    </div>
  );
}
