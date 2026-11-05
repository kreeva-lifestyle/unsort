// Dashboard states other than "filled": skeletons shaped like the real
// bento, the whole-page load error (only when nothing loaded), and the
// paused-automation banner (states-and-feedback.md §1, §4, §11).
import { PB, pbBody, pbTileTitle } from '../../pbTheme';
import { Dot } from '../product/status';
import { PbButton, PbSkeleton, PbTile } from '../ui';

/** First load: hero 6×2 as a plain tile, four stat tiles, products tile, two website tiles. */
export function DashSkeleton() {
  return (
    <div aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="pb-bento pb-bento--dash">
        <PbSkeleton shape="tile" span={6} rows={2} height={200} srLabel="Loading the dashboard" />
        <PbSkeleton shape="stat" span={3} phoneHalf count={4} />
        <PbSkeleton shape="tile" span={12} />
      </div>
      <div className="pb-bento pb-bento--auto">
        <PbSkeleton shape="tile" span={6} count={2} height={260} />
      </div>
    </div>
  );
}

/** Nothing loaded: one failed tile with the plain reason and Try again. Header and tabs stay. */
export function DashError({ message, busy, onRetry }: { message: string; busy: boolean; onRetry: () => void }) {
  return (
    <div className="pb-bento pb-bento--auto">
      <PbTile variant="failed" as="section" span={12} aria-labelledby="pb-dash-err" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
        <Dot color={PB.failed} label="Could not load" style={{ color: PB.tx }} />
        <h2 id="pb-dash-err" style={pbTileTitle}>Could not open the dashboard</h2>
        <p style={{ ...pbBody, margin: 0 }}>{message}</p>
        <PbButton icon="refresh" onClick={onRetry} busy={busy} busyLabel="Trying again…">Try again</PbButton>
      </PbTile>
    </div>
  );
}

/** Automation paused: a review-tinted banner across the top of the content. */
export function PausedBanner({ onOpen }: { onOpen: () => void }) {
  return (
    <PbTile variant="review" as="section" span={12} aria-labelledby="pb-dash-paused"
      style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: 'var(--pb-pad-tile)' }}>
      <div style={{ flex: '1 1 260px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h2 id="pb-dash-paused" style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>
          <Dot color={PB.review} label="Automation is paused" style={{ fontSize: 13, color: PB.tx, fontWeight: 600 }} />
        </h2>
        <p style={{ ...pbBody, margin: 0, color: PB.tx2 }}>Nothing is read, written or published on its own. Buttons on a product still work.</p>
      </div>
      <PbButton onClick={onOpen}>Open Settings</PbButton>
    </PbTile>
  );
}
