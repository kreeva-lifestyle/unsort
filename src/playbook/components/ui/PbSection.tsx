// A titled block INSIDE a tile (no tile of its own): Sora 17 title or an
// 11px label, optional hint and right-side slot, separated from the block
// above by a hairline. For a standalone titled card use Section from
// components/website/ui.tsx (a glass tile).
import type { ReactNode } from 'react';
import { PB, pbLabel, pbMeta, pbTileTitle } from '../../pbTheme';

export default function PbSection({ title, label, hint, right, divider, children, id }: {
  title?: ReactNode; label?: string; hint?: ReactNode; right?: ReactNode; divider?: boolean; children?: ReactNode; id?: string;
}) {
  return (
    <section aria-labelledby={id} style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0, ...(divider ? { borderTop: `1px solid ${PB.tileBd}`, paddingTop: 16 } : null) }}>
      {(title != null || label || right != null) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', minWidth: 0 }}>
          {title != null ? <h2 id={id} style={pbTileTitle}>{title}</h2> : label ? <h2 id={id} style={{ ...pbLabel, margin: 0 }}>{label}</h2> : <span />}
          {right}
        </div>
      )}
      {hint != null && <div style={{ ...pbMeta, marginTop: -4 }}>{hint}</div>}
      {children}
    </section>
  );
}
