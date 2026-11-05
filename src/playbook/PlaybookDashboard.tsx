// Playbook's home: what the Product Directory is doing right now — products by
// status, listings per website, what needs a person, and whether automation is paused.
// V2 bento (layout-and-components.md §4): [paused banner 12]
// (hero 6×2)(3)(3)/(3)(3) · (products 12) · websites by count (12 | 6+6 | 4+4+4 …).
import { useCallback, useEffect, useState } from 'react';
import { friendlyError } from '../lib/friendlyError';
import type { PbPage } from './components/PbNav';
import type { AddToast } from './components/PbToasts';
import type { ProductsStart } from './pages/Products';
import { getPbSettingsLite, listWebsitesLite } from './data/products';
import { listingCounts, listingTotal, productCounts } from './data/dashboard';
import { PbButton, PbPageHeader } from './components/ui';
import type { DashData } from './components/dashboard/dashShared';
import DashTop from './components/dashboard/DashTop';
import DashProducts from './components/dashboard/DashProducts';
import DashWebsites from './components/dashboard/DashWebsites';
import { DashError, DashSkeleton, PausedBanner } from './components/dashboard/DashStates';

export default function PlaybookDashboard({ name, addToast, go }: { name: string; addToast: AddToast; go: (p: PbPage, s?: ProductsStart) => void }) {
  const [d, setD] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [products, sites, settings, failed, review] = await Promise.all([productCounts(), listWebsitesLite(), getPbSettingsLite(), listingTotal('failed'), listingTotal('review')]);
      const perSite = await listingCounts(sites.map(s => s.id));
      setD({ products, sites, perSite, failed, review, paused: settings.paused });
      setLoadErr(null);
    } catch (e) { setLoadErr(friendlyError(e)); addToast(friendlyError(e), 'error'); }
    finally { setLoading(false); }
  }, [addToast]);
  useEffect(() => { void load(); }, [load]);

  const busyLabel = d ? 'Refreshing…' : 'Loading…';
  const refresh = (block?: boolean) => (
    <PbButton icon="refresh" onClick={load} busy={loading} busyLabel={busyLabel} block={block}>Refresh</PbButton>
  );
  const add = () => go('products', { add: true });

  return (
    <>
      <PbPageHeader title={name ? `Hello, ${name}` : 'Dashboard'} sub="Product Directory at a glance"
        actions={<>{refresh()}<PbButton kind="primary" icon="plus" onClick={add}>Add product</PbButton></>}
        phoneAction={<PbButton kind="primary" icon="plus" iconOnly aria-label="Add product" onClick={add} />} />

      {!d ? (
        loadErr ? <DashError message={loadErr} busy={loading} onRetry={load} /> : <DashSkeleton />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--pb-pad-tile)', opacity: loading ? 0.6 : 1, transition: 'opacity .3s ease' }}
          aria-busy={loading || undefined}>
          {d.paused && <PausedBanner onOpen={() => go('settings')} />}
          <div className="pb-bento pb-bento--dash">
            <DashTop d={d} go={go} />
            <DashProducts d={d} go={go} />
          </div>
          <DashWebsites d={d} go={go} />
        </div>
      )}

      {/* Phone: the header holds only "+", so Refresh sits at the end of the page, in thumb reach.
          Not under the error tile, whose "Try again" is the one retry. */}
      {!(loadErr && !d) && <div className="pb-phone-only" style={{ marginTop: 16 }}>{refresh(true)}</div>}
    </>
  );
}
