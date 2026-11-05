// Dashboard top block (layout-and-components.md §4 "Dashboard"):
// hero 6×2 "Needs your attention: N" (or "Nothing is waiting" / first run)
// + four 3×1 attention tiles, two on each of the hero's rows.
// Desktop (6×2)(3)(3)/(3)(3) · 6 cols (6×2)/(3)(3)/(3)(3) · phone hero, then 2 per row.
import { PB, pbNum } from '../../pbTheme';
import { PbStatTile, PbTile } from '../ui';
import { count, groupTotal, type DashData, type DashGo } from './dashShared';

const heroLabel = { fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', lineHeight: 1.5 } as const;

function Hero({ d }: { d: DashData }) {
  const attention = d.products.needs_info + d.failed + d.review;
  const totalProducts = Object.values(d.products).reduce((s, n) => s + n, 0);
  const published = groupTotal(d, 'published');
  const sites = d.sites.length;
  const parts = [
    d.products.needs_info ? `${count(d.products.needs_info)} need info` : null,
    d.review ? `${count(d.review)} to review` : null,
    d.failed ? `${count(d.failed)} failed` : null,
  ].filter(Boolean).join(' · ');
  return (
    <PbTile variant="hero" as="section" span={6} rows={2} aria-labelledby="pb-dash-hero"
      style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 16, minHeight: 200 }}>
      {attention > 0 ? (
        // Label at the top, the big number anchored bottom-left above its breakdown (mock-up V2Dashboard).
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, flex: 1 }}>
          <h2 id="pb-dash-hero" style={{ margin: 0, color: PB.onBrand, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 16 }}>
            <span style={{ ...heroLabel, display: 'block' }}>Needs your attention</span>
            <span className="pb-sr">: </span>
            <span style={{ ...pbNum, display: 'block', fontSize: 'clamp(56px, 7vw, 96px)', fontWeight: 500, lineHeight: 1.05, letterSpacing: -2, overflowWrap: 'anywhere' }}>{count(attention)}</span>
          </h2>
          <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.5 }}>{parts}</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <h2 id="pb-dash-hero" style={{ margin: 0, fontFamily: PB.sora, fontWeight: 700, fontSize: 'clamp(24px, 3vw, 36px)', letterSpacing: -0.3, lineHeight: 1.2, color: PB.onBrand }}>
            {totalProducts === 0 ? 'No products yet' : 'Nothing is waiting'}
          </h2>
          <div style={{ fontSize: 15, lineHeight: 1.5 }}>
            {totalProducts === 0 ? 'Add your first one: photos, a price and the websites it goes to.' : 'No product or listing needs a person right now.'}
          </div>
        </div>
      )}
      <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.5 }}>
        <span style={{ ...pbNum, fontWeight: 500 }}>{count(published)}</span> {published === 1 ? 'listing' : 'listings'} published
        {' · '}<span style={{ ...pbNum, fontWeight: 500 }}>{count(sites)}</span> {sites === 1 ? 'website' : 'websites'}
      </div>
    </PbTile>
  );
}

export default function DashTop({ d, go }: { d: DashData; go: DashGo }) {
  const working = groupTotal(d, 'working');
  return (
    <>
      <Hero d={d} />
      <PbStatTile span={3} phoneHalf label="Needs info" dot={PB.review} tone={d.products.needs_info ? 'review' : undefined}
        value={count(d.products.needs_info)} meta="Cost price or category missing" onClick={() => go('products', { status: 'needs_info' })} />
      <PbStatTile span={3} phoneHalf label="Needs review" dot={PB.review} tone={d.review ? 'review' : undefined}
        value={count(d.review)} meta="Written, waiting for approval" onClick={() => go('products', { status: 'l:review' })} />
      <PbStatTile span={3} phoneHalf label="Failed" dot={PB.failed} tone={d.failed ? 'failed' : undefined}
        value={count(d.failed)} meta="Could not publish. Open to see why" onClick={() => go('products', { status: 'l:failed' })} />
      <PbStatTile span={3} phoneHalf label="In progress" dot={PB.busy}
        value={count(working)} meta="Being written or published" onClick={() => go('products', { status: 'l:queued,generating,publishing' })} />
    </>
  );
}
