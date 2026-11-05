// Non-status tag / value pill ("Sends as draft", "Kept", "On"). Not
// clickable, never coloured like a status (layout-and-components.md §5).
import type { CSSProperties, ReactNode } from 'react';
import { PB, pbNum } from '../../pbTheme';

export default function PbTag({ children, mono, style }: { children: ReactNode; mono?: boolean; style?: CSSProperties }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '2px 10px', borderRadius: PB.r.pill,
      background: PB.ctl, border: `1px solid ${PB.tileBd}`, color: PB.tx2, fontSize: 12, lineHeight: 1.5,
      fontWeight: 500, whiteSpace: 'nowrap', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis',
      ...(mono ? pbNum : null), ...style,
    }}>{children}</span>
  );
}
