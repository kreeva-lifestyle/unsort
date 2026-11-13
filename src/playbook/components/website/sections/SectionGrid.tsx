// Bento placement for the editor's section tiles (the 9-wide body column):
// the grid's 16px gap spaces them (layout §1: gap, never a margin per child).
// span 6 pairs sit side by side at 12 columns and stack at 6 columns
// (≤1099px) and on phone, so every row stays full.
import type { ReactNode } from 'react';
import { bentoClass, type PbSpan } from '../../ui';

export function SectionGrid({ children }: { children: ReactNode }) {
  return <div className="pb-bento pb-bento--auto">{children}</div>;
}

/** One grid cell; the Section inside stretches to the row height. */
export function Cell({ span = 12, children }: { span?: Extract<PbSpan, 12 | 6>; children: ReactNode }) {
  return <div className={bentoClass(span)} style={{ display: 'grid', minWidth: 0 }}>{children}</div>;
}

const grid = (min: number) => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}px), 1fr))`, columnGap: 16, minWidth: 0 });

/** Four fields as two pairs: 4 in a row on a wide tile, 2 × 2 below that, 1 per row on phone — never 3 + 1. */
export function Quad({ children }: { children: [ReactNode, ReactNode, ReactNode, ReactNode] }) {
  return (
    <div style={grid(400)}>
      <div style={grid(180)}>{children[0]}{children[1]}</div>
      <div style={grid(180)}>{children[2]}{children[3]}</div>
    </div>
  );
}

/** Three fields: one row when each gets 180px (3 × 180 + 2 gaps = 572px), else one per row — never 2 + 1.
 *  Below 572px the column minimum jumps past 100% ((572px − 100%) × 999), so only one column fits. */
export function Trio({ children }: { children: [ReactNode, ReactNode, ReactNode] }) {
  return <div style={{ ...grid(180), gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, max((100% - 32px) / 3, (572px - 100%) * 999)), 1fr))' }}>{children}</div>;
}
