// The product list's non-data states (states-and-feedback.md §1, §3, §4):
// skeletons shaped like the real cards / rows, first-run empty, filtered
// empty with "Clear filters", and a load error in the tile with Try again.
// Each is a 12-wide bento child. The header's "Add product" stays the one
// gradient, so the empty-state actions are secondary.
import type { ReactNode } from 'react';
import { PB, pbBody, pbTileFlat, pbTileTitle } from '../../../pbTheme';
import PbButton from '../../ui/PbButton';
import PbIcon from '../../ui/PbIcon';
import PbSkeleton, { PbSkelBar } from '../../ui/PbSkeleton';
import PbTile from '../../ui/PbTile';
import { Dot } from '../status';

/** Desktop: 6 cards (two full rows of 4+4+4). Phone: 5 photo rows. */
export function ListSkeleton({ phone }: { phone: boolean }) {
  if (phone) {
    return (
      <div className="pb-span-12" aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <PbSkeleton shape="rowPhoto" count={5} srLabel="Loading products" />
      </div>
    );
  }
  return (
    <>
      <span className="pb-sr" role="status">Loading products</span>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} aria-hidden="true" className="pb-span-4" style={{ ...pbTileFlat, padding: 8, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <PbSkelBar w="100%" h={200} style={{ borderRadius: PB.r.photo }} />
          <span style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 8px 8px' }}>
            <PbSkelBar w="70%" h={14} /><PbSkelBar w="45%" h={10} /><PbSkelBar w="30%" h={14} />
          </span>
        </div>
      ))}
    </>
  );
}

function Shell({ icon, title, children, action }: { icon: string; title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <PbTile span={12} as="section" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 12, padding: '48px 24px' }}>
      <span aria-hidden="true" style={{ width: 56, height: 56, borderRadius: PB.r.input, background: PB.ctl, border: `1px solid ${PB.ctlBd}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: PB.brandA }}>
        <PbIcon name={icon} size={24} />
      </span>
      <h2 style={pbTileTitle}>{title}</h2>
      <div style={{ ...pbBody, color: PB.tx2, maxWidth: 420, overflowWrap: 'anywhere' }}>{children}</div>
      {action}
    </PbTile>
  );
}

export function FirstRunEmpty({ onAdd }: { onAdd: () => void }) {
  return (
    <Shell icon="box" title="No products yet"
      action={<PbButton icon="plus" onClick={onAdd}>Add a product</PbButton>}>
      Add a product by hand — Telegram posts will land here automatically once that is connected.
    </Shell>
  );
}

export function FilteredEmpty({ search, onClear }: { search: string; onClear: () => void }) {
  return (
    <Shell icon="search" title="No products match"
      action={<PbButton icon="x" onClick={onClear}>Clear filters</PbButton>}>
      {search ? <>Nothing matches “{search}” with these filters. Try another search, or clear the filters.</> : 'Try another search, or clear the filters.'}
    </Shell>
  );
}

/** Load failed. `inline` = rows are still on screen (a later page or refresh failed). */
export function LoadError({ message, onRetry, inline }: { message: string; onRetry: () => void; inline?: boolean }) {
  return (
    <PbTile span={12} variant="failed"
      style={{ display: 'flex', alignItems: inline ? 'center' : 'flex-start', flexDirection: inline ? 'row' : 'column', flexWrap: 'wrap', gap: 12, ...(inline ? null : { padding: '32px 24px' }) }}>
      <span role="alert" style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: inline ? '1 1 240px' : 'none', minWidth: 0 }}>
        <Dot color={PB.failed} label={inline ? 'Could not refresh' : 'Could not load products'} style={{ fontWeight: 600, color: PB.tx }} />
        <span style={{ ...pbBody, overflowWrap: 'anywhere' }}>{message}</span>
      </span>
      <PbButton icon="refresh" onClick={onRetry}>Try again</PbButton>
    </PbTile>
  );
}
