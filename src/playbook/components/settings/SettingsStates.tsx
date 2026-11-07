// Settings before the values arrive: skeleton tiles in the real layout
// (form 8 + status 4 on desktop, stacked on phone), or the load error in a
// failed tile with Try again (states-and-feedback.md §1, §4).
import type { ReactNode } from 'react';
import { PB, pbBody, pbTileFlat } from '../../pbTheme';
import { Dot } from '../product/status';
import { PbButton, PbSkelBar, PbTile } from '../ui';

/** Desktop 8 + 4 beside each other; phone stacks (form first, status after). */
export function SettingsColumns({ form, side }: { form: ReactNode; side: ReactNode }) {
  return (
    <div className="pb-settings-cols" style={{ display: 'flex', gap: 16, alignItems: 'flex-start', minWidth: 0 }}>
      <div style={{ flex: '2 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>{form}</div>
      {/* Sticky beside the longer form on desktop (no hole under it); on phone (.pb-settings-cols) it stacks below the form and never moves. */}
      <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 'var(--pb-sticky-top)', alignSelf: 'flex-start' }}>{side}</div>
    </div>
  );
}

const SkelTile = ({ lines, h }: { lines: number; h: number }) => (
  <div aria-hidden="true" style={{ ...pbTileFlat, minHeight: h, display: 'flex', flexDirection: 'column', gap: 12 }}>
    <PbSkelBar w="40%" h={16} />
    <PbSkelBar w="80%" h={10} />
    {Array.from({ length: lines }, (_, i) => <PbSkelBar key={i} w="100%" h={40} style={{ borderRadius: PB.r.input }} />)}
  </div>
);

export function SettingsSkeleton() {
  return (
    <div aria-busy="true">
      <span className="pb-sr" role="status">Loading settings</span>
      <SettingsColumns form={<><SkelTile lines={2} h={220} /><SkelTile lines={1} h={180} /></>} side={<SkelTile lines={2} h={220} />} />
    </div>
  );
}

export function SettingsError({ message, onRetry, busy }: { message: string; onRetry: () => void; busy: boolean }) {
  return (
    <PbTile variant="failed" as="section" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12, padding: '32px 24px' }}>
      <span role="alert" style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <Dot color={PB.failed} label="Could not open Settings" style={{ fontWeight: 600, color: PB.tx, fontSize: 13 }} />
        <span style={{ ...pbBody, overflowWrap: 'anywhere' }}>{message}</span>
      </span>
      <PbButton icon="refresh" onClick={onRetry} busy={busy} busyLabel="Trying again…">Try again</PbButton>
    </PbTile>
  );
}
