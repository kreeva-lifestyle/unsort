// The Vendors list's non-data states (states-and-feedback.md §1, §3, §4):
// skeleton rows, first-run empty, filtered empty with "Clear search", and the
// load error in a failed tile with Try again. The header's "Add vendor" is
// the page's one gradient, so the actions here are secondary.
import type { ReactNode } from 'react';
import { PB, pbBody, pbTileTitle } from '../../pbTheme';
import { Dot } from '../product/status';
import { PbButton, PbIcon, PbSkeleton, PbTile } from '../ui';

export function VendorsSkeleton() {
  return (
    <div aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <PbSkeleton shape="row" count={5} srLabel="Loading vendors" />
    </div>
  );
}

function Shell({ icon, title, children, action }: { icon: string; title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <PbTile as="section" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 12, padding: '48px 24px' }}>
      <span aria-hidden="true" style={{ width: 56, height: 56, borderRadius: PB.r.input, background: PB.ctl, border: `1px solid ${PB.ctlBd}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: PB.brandA }}>
        <PbIcon name={icon} size={24} />
      </span>
      <h2 style={pbTileTitle}>{title}</h2>
      <p style={{ ...pbBody, color: PB.tx2, maxWidth: 420, margin: 0, overflowWrap: 'anywhere' }}>{children}</p>
      {action}
    </PbTile>
  );
}

export function VendorsEmpty({ onAdd }: { onAdd: () => void }) {
  return (
    <Shell icon="users" title="No vendors yet" action={<PbButton icon="plus" onClick={onAdd}>Add vendor</PbButton>}>
      Add the people you buy from. Products and routing rules link to them.
    </Shell>
  );
}

/** Every vendor is switched off: say so and offer the way back to them (not "No vendors yet"). */
export function VendorsAllInactive({ n, onShow }: { n: number; onShow: () => void }) {
  return (
    <Shell icon="users" title="No active vendors" action={<PbButton onClick={onShow}>Show inactive</PbButton>}>
      {n === 1 ? '1 vendor is inactive.' : `${n.toLocaleString('en-IN')} vendors are inactive.`} Show {n === 1 ? 'it' : 'them'} to edit or activate {n === 1 ? 'it' : 'one'} again.
    </Shell>
  );
}

export function VendorsNoMatch({ search, onClear }: { search: string; onClear: () => void }) {
  return (
    <Shell icon="search" title="No vendor matches" action={<PbButton icon="x" onClick={onClear}>Clear search</PbButton>}>
      Nothing matches “{search}”. Try another name or code.
    </Shell>
  );
}

/** `inline`: rows are still on screen (a refresh or later page failed). */
export function VendorsError({ message, onRetry, busy, inline }: { message: string; onRetry: () => void; busy: boolean; inline?: boolean }) {
  return (
    <PbTile variant="failed" as="section"
      style={{ display: 'flex', flexDirection: inline ? 'row' : 'column', flexWrap: 'wrap', alignItems: inline ? 'center' : 'flex-start', gap: 12, ...(inline ? null : { padding: '32px 24px' }) }}>
      <span role="alert" style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: inline ? '1 1 240px' : 'none', minWidth: 0 }}>
        <Dot color={PB.failed} label={inline ? 'Could not refresh' : 'Could not open Vendors'} style={{ fontWeight: 600, color: PB.tx, fontSize: 13 }} />
        <span style={{ ...pbBody, overflowWrap: 'anywhere' }}>{message}</span>
      </span>
      <PbButton icon="refresh" onClick={onRetry} busy={busy} busyLabel="Trying again…">Try again</PbButton>
    </PbTile>
  );
}
