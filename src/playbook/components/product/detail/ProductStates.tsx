// Product page before it has data: skeletons shaped like the real bento
// (photos 8×2, hero 4, stat 4, facts 8, AI 4, two website tiles), or the
// whole-page error with Try again. The header and back button draw at once.
// Phone: the back button, then the photo hero, name card and tile skeletons.
import { PB, pbBody, pbTileTitle } from '../../../pbTheme';
import PbButton from '../../ui/PbButton';
import PbPageHeader, { PbBackButton } from '../../ui/PbPageHeader';
import { useIsPhone } from '../../../hooks/useIsPhone';
import PbSkeleton, { PbSkelBar } from '../../ui/PbSkeleton';
import PbTile from '../../ui/PbTile';
import { Dot } from '../status';

export default function ProductStates({ loadErr, onBack, onRetry }: { loadErr: string; onBack: () => void; onRetry: () => void }) {
  const phone = useIsPhone();
  if (loadErr) return (
    <>
      <PbPageHeader title="Product" back={{ label: 'Products', onBack }} phoneAction={null} />
      <PbTile variant="failed" style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
        <Dot color={PB.failed} label="Could not load" />
        <h2 style={pbTileTitle}>Could not open this product</h2>
        <p role="alert" style={{ ...pbBody, margin: 0, overflowWrap: 'anywhere' }}>{loadErr}</p>
        <PbButton kind="primary" icon="refresh" onClick={onRetry}>Try again</PbButton>
      </PbTile>
    </>
  );
  if (phone) return (
    <div aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex' }}><PbBackButton label="Products" onBack={onBack} /></div>
      <PbSkeleton srLabel="Loading product" height={300} />
      <PbSkeleton height={120} />
      <PbSkeleton count={2} />
    </div>
  );
  return (
    <>
      <PbPageHeader title={<PbSkelBar w="min(360px, 60vw)" h={24} style={{ margin: '6px 0' }} />} back={{ label: 'Products', onBack }} phoneAction={null} />
      <div aria-busy="true" className="pb-bento">
        <PbSkeleton srLabel="Loading product" span={8} rows={2} height={280} />
        <PbSkeleton span={4} />
        <PbSkeleton shape="stat" span={4} />
        {/* Same nested 12-column row as the real page, so it stays full at 6 columns. */}
        <div className="pb-span-12" style={{ display: 'grid', gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', gap: 16 }}>
          <div style={{ gridColumn: 'span 8', display: 'grid' }}><PbSkeleton height={320} /></div>
          <div style={{ gridColumn: 'span 4', display: 'grid' }}><PbSkeleton height={320} /></div>
        </div>
        <PbSkeleton span={6} />
        <PbSkeleton span={6} />
      </div>
    </>
  );
}
