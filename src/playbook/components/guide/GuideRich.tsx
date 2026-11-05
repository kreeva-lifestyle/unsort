// The guide's inline marks (**bold**, `code`) and the shared body-text style,
// used by GuideBlocks and GuideTable.
import type { CSSProperties } from 'react';
import { PB } from '../../pbTheme';
import { splitInline } from './types';

export function Rich({ text }: { text: string }) {
  return (
    <>
      {splitInline(text).map((s, i) => s.t === 'b'
        ? <strong key={i} style={{ color: PB.tx, fontWeight: 600 }}>{s.v}</strong>
        : s.t === 'code'
          ? <code key={i} style={{ fontFamily: PB.mono, fontSize: '0.9em', background: PB.ctl, border: `1px solid ${PB.ctlBd}`, borderRadius: PB.r.chartBar, padding: '1px 4px', color: PB.tx, overflowWrap: 'anywhere' }}>{s.v}</code>
          : <span key={i}>{s.v}</span>)}
    </>
  );
}

export const guideText: CSSProperties = { fontSize: 13, lineHeight: 1.65, color: PB.tx2, margin: '0 0 12px', overflowWrap: 'anywhere' };
