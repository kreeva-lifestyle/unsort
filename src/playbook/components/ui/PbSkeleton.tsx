// Skeletons shaped like the real thing (states-and-feedback.md §1): tile,
// stat tile, list row (with or without photo), or a single bar. Shimmer
// stops under reduced motion. Wrap the waiting region in aria-busy and pass
// srLabel once ("Loading products").
import type { CSSProperties } from 'react';
import { PB, pbRow, pbTileFlat } from '../../pbTheme';
import { bentoClass, type PbSpan } from './PbTile';

export function PbSkelBar({ w = '60%', h = 12, style }: { w?: number | string; h?: number; style?: CSSProperties }) {
  return <span className="pb-skel" aria-hidden="true" style={{ display: 'block', width: w, height: h, borderRadius: PB.r.skel, ...style }} />;
}

type Shape = 'tile' | 'stat' | 'row' | 'rowPhoto' | 'bar';

export default function PbSkeleton({ shape = 'tile', count = 1, height, span, rows, phoneHalf, srLabel }: {
  shape?: Shape; count?: number; height?: number; span?: PbSpan; rows?: 2; phoneHalf?: boolean; srLabel?: string;
}) {
  const one = (i: number) => {
    if (shape === 'bar') return <PbSkelBar key={i} w="100%" h={height ?? 12} />;
    if (shape === 'row' || shape === 'rowPhoto') {
      const photo = shape === 'rowPhoto';
      return (
        <div key={i} aria-hidden="true" style={{ ...pbRow, ...(photo ? { padding: 8, minHeight: 96 } : null) }}>
          {photo ? <PbSkelBar w={64} h={80} style={{ borderRadius: PB.r.photo, flexShrink: 0 }} /> : <PbSkelBar w={36} h={36} style={{ borderRadius: 12, flexShrink: 0 }} />}
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}><PbSkelBar w="60%" h={14} /><PbSkelBar w="35%" h={10} /></span>
          <PbSkelBar w={8} h={8} style={{ borderRadius: 4 }} />
        </div>
      );
    }
    return (
      <div key={i} aria-hidden="true" className={bentoClass(span, rows, phoneHalf)}
        style={{ ...pbTileFlat, minHeight: height ?? (shape === 'stat' ? 120 : 152), display: 'flex', flexDirection: 'column', gap: 12 }}>
        <PbSkelBar w="40%" h={10} />
        <PbSkelBar w={shape === 'stat' ? '30%' : '70%'} h={shape === 'stat' ? 28 : 16} />
        {shape === 'tile' && <PbSkelBar w="55%" h={12} />}
      </div>
    );
  };
  return (
    <>
      {srLabel && <span className="pb-sr" role="status">{srLabel}</span>}
      {Array.from({ length: count }, (_, i) => one(i))}
    </>
  );
}
