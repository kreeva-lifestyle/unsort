// The Tags screens' non-data states (states-and-feedback.md): skeleton rows
// shaped like TagRow, a load error inside the tile with Try again, and the
// two empty states (nothing to review / no match, with Clear filters).
import type { ReactNode } from 'react';
import { PB, pbBody, pbRow, pbTileTitle } from '../../pbTheme';
import { Dot } from '../product/status';
import { PbButton, PbIcon, PbSkelBar } from '../ui';

export function TagRowsSkeleton({ count = 4, label }: { count?: number; label: string }) {
  return (
    <div aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span className="pb-sr" role="status">{label}</span>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} aria-hidden="true" style={{ ...pbRow, background: 'transparent', border: 'none', boxShadow: 'none', padding: '12px 0', borderTop: `1px solid ${PB.tileBd}`, borderRadius: 0 }}>
          <PbSkelBar w={20} h={20} style={{ borderRadius: 4, flexShrink: 0 }} />
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}><PbSkelBar w="45%" h={14} /><PbSkelBar w="70%" h={10} /><PbSkelBar w="30%" h={10} /></span>
        </div>
      ))}
    </div>
  );
}

/** A load error inside the tile (no toast on top). */
export function TagsError({ title, message, onRetry, busy }: { title: string; message: string; onRetry: () => void; busy: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
      <span role="alert" style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <Dot color={PB.failed} label={title} style={{ fontWeight: 600, color: PB.tx, fontSize: 13 }} />
        <span style={{ ...pbBody, overflowWrap: 'anywhere' }}>{message}</span>
      </span>
      <PbButton icon="refresh" onClick={onRetry} busy={busy} busyLabel="Trying again…">Try again</PbButton>
    </div>
  );
}

/** Empty state inside a tile (the tile is the surface: no second tile here). */
export function TagsEmpty({ icon, title, children, action }: { icon: string; title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 12, padding: '24px 8px' }}>
      <span aria-hidden="true" style={{ width: 56, height: 56, borderRadius: PB.r.input, background: PB.ctl, border: `1px solid ${PB.ctlBd}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: PB.brandA }}>
        <PbIcon name={icon} size={24} />
      </span>
      <h3 style={{ ...pbTileTitle, fontSize: 15 }}>{title}</h3>
      <p style={{ ...pbBody, color: PB.tx2, maxWidth: 420, margin: 0, overflowWrap: 'anywhere' }}>{children}</p>
      {action}
    </div>
  );
}
