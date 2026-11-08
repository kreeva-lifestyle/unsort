// The Websites list's non-data states (states-and-feedback.md §1, §3, §4):
// skeleton tiles shaped like the website tiles, the first-run empty, and the
// load error in a failed tile with Try again. The header's "Add website" is
// the page's one gradient, so the actions here are secondary.
import { PB, pbBody, pbTileTitle } from '../../../pbTheme';
import { Dot } from '../../product/status';
import { PbButton, PbIcon, PbSkeleton, PbTile } from '../../ui';

/** Three tiles (one full row of 4+4+4; phone stacks them). */
export function WebsitesSkeleton() {
  return (
    <div className="pb-bento pb-bento--auto" aria-busy="true">
      <PbSkeleton shape="tile" count={3} span={4} height={200} srLabel="Loading websites" />
    </div>
  );
}

export function WebsitesEmpty({ onAdd }: { onAdd: () => void }) {
  return (
    <PbTile as="section" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 12, padding: '48px 24px' }}>
      <span aria-hidden="true" style={{ width: 56, height: 56, borderRadius: PB.r.input, background: PB.ctl, border: `1px solid ${PB.ctlBd}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: PB.brandA }}>
        <PbIcon name="globe" size={24} />
      </span>
      <h2 style={pbTileTitle}>No websites yet</h2>
      <p style={{ ...pbBody, color: PB.tx2, maxWidth: 440, margin: 0 }}>
        Add a Shopify store, connect it, then set which products go there and at what price. Nothing is sent until you switch it on.
      </p>
      <PbButton icon="plus" onClick={onAdd}>Add a website</PbButton>
    </PbTile>
  );
}

/** Nothing loaded. `busy` while the retry runs. */
export function WebsitesError({ message, onRetry, busy }: { message: string; onRetry: () => void; busy: boolean }) {
  return (
    <PbTile variant="failed" as="section" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12, padding: '32px 24px' }}>
      <span role="alert" style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <Dot color={PB.failed} label="Could not open Websites" style={{ fontWeight: 600, color: PB.tx, fontSize: 13 }} />
        <span style={{ ...pbBody, overflowWrap: 'anywhere' }}>{message}</span>
      </span>
      <PbButton icon="refresh" onClick={onRetry} busy={busy} busyLabel="Trying again…">Try again</PbButton>
    </PbTile>
  );
}
