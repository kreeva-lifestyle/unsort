// A product photo in a fixed box (no layout shift): lazy, async-decoded,
// cover-cropped on a PB.tile fill. No photo, or one that fails to load, shows
// an aria-hidden icon with the sr-only text "No photo" (states-and-feedback §8).
// It loads a resized copy as wide as its box (`px`, or the numeric width), never the original.
import { useState, type CSSProperties } from 'react';
import { pbPhotoUrl, photoFallback } from '../../../data/pbFunctions';
import { PB } from '../../../pbTheme';
import PbIcon from '../../ui/PbIcon';

export default function ProductPhoto({ path, width, height, px, style }: {
  path?: string; width: number | string; height: number | string;
  /** The box width in CSS px when `width` is not a plain number (a card that stretches). */
  px?: number; style?: CSSProperties;
}) {
  const [broken, setBroken] = useState(false);
  const box: CSSProperties = {
    width, height, borderRadius: PB.r.photo, overflow: 'hidden', background: PB.tile, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center', color: PB.tx3, ...style,
  };
  if (!path || broken) {
    return (
      <span style={box}>
        <PbIcon name="photo" size={24} />
        <span className="pb-sr">No photo</span>
      </span>
    );
  }
  return (
    <span style={box}>
      <img src={pbPhotoUrl(path, px ?? (typeof width === 'number' ? width : 320))} alt="" loading="lazy" decoding="async"
        onError={photoFallback(path, () => setBroken(true))}
        width={typeof width === 'number' ? width : undefined} height={typeof height === 'number' ? height : undefined}
        style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 20%', display: 'block' }} />
    </span>
  );
}
