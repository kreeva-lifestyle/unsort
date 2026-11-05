// A product photo in a fixed box (no layout shift): lazy, async-decoded,
// cover-cropped on a PB.tile fill. No photo, or one that fails to load, shows
// an aria-hidden icon with the sr-only text "No photo" (states-and-feedback §8).
import { useState, type CSSProperties } from 'react';
import { pbImageUrl } from '../../../data/pbFunctions';
import { PB } from '../../../pbTheme';
import PbIcon from '../../ui/PbIcon';

export default function ProductPhoto({ path, width, height, style }: {
  path?: string; width: number | string; height: number | string; style?: CSSProperties;
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
      <img src={pbImageUrl(path)} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)}
        width={typeof width === 'number' ? width : undefined} height={typeof height === 'number' ? height : undefined}
        style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 20%', display: 'block' }} />
    </span>
  );
}
