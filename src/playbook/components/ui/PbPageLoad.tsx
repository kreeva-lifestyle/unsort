// Pages fetched on first open (Websites, Vendors, Settings, Guide): Playbook's
// first download carries only the shell, Dashboard and Products, so it opens
// faster on shop Wi-Fi and mobile data; the rest is fetched in the background
// once the first page is up (PlaybookApp), so a later tap is usually instant.
// While a page is still on its way: skeletons shaped like a page (never a bare
// spinner). If it cannot be fetched (offline, or after the one automatic reload
// retryImport allows): an error tile with Reload, in the Playbook look.
import type { ComponentType } from 'react';
import { retryImport } from '../../../lib/retryImport';
import { PB, pbBody } from '../../pbTheme';
import PbButton from './PbButton';
import PbSkeleton, { PbSkelBar } from './PbSkeleton';
import PbTile from './PbTile';
import { Dot } from '../product/status';

export function PbPageSkeleton() {
  return (
    <div aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--pb-pad-tile)' }}>
      <PbSkelBar w="45%" h={28} style={{ margin: '8px 0 8px' }} />
      <PbSkeleton shape="tile" height={120} />
      <PbSkeleton shape="row" count={3} srLabel="Loading this page" />
    </div>
  );
}

export function PbPageLoadError() {
  return (
    <PbTile variant="failed" as="section" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12, padding: '32px 24px' }}>
      <span role="alert" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Dot color={PB.failed} label="Could not open this page" style={{ fontWeight: 600, color: PB.tx, fontSize: 13 }} />
        <span style={pbBody}>Check the internet connection, then reload. If it keeps happening, a new version may still be going live: wait a minute and try again.</span>
      </span>
      <PbButton icon="refresh" onClick={() => window.location.reload()}>Reload</PbButton>
    </PbTile>
  );
}

/** A page loaded on first open, with the Playbook error tile when it cannot be fetched. */
export const lazyPage = <P extends object>(load: () => Promise<{ default: ComponentType<P> }>) =>
  retryImport(load, PbPageLoadError as ComponentType) as unknown as ComponentType<P>;
