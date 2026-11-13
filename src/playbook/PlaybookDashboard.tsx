// Playbook's home: what the Product Directory is doing right now — products by
// status, listings per website, what needs a person, and whether automation is paused,
// stalled, over its daily AI limit or cut off from a store (DashAlerts). The numbers
// refresh by themselves every minute while the page is in view.
// V2 bento (layout-and-components.md §4): [paused banner 12]
// (hero 6×2)(3)(3)/(3)(3) · (products 12) · websites by count (12 | 6+6 | 4+4+4 …).
import { useCallback, useEffect, useRef, useState } from 'react';
import { friendlyError } from '../lib/friendlyError';
import { logSwallowed } from '../lib/errorLogger';
import type { PbPage } from './components/PbNav';
import type { AddToast } from './components/PbToasts';
import type { ProductsStart } from './pages/Products';
import { listWebsitesLite } from './data/products';
import { automationState, listingCounts, listingTotal, notedTotal, oldestReview, productCounts } from './data/dashboard';
import { telegramTrouble } from './data/telegram';
import { getAiCostSince } from './data/listingSeo';
import { USD_INR, istDayStart, istMonthStart, istRelative } from './format';
import { useAutoRefresh } from './hooks/useAutoRefresh';
import { PbButton, PbPageHeader } from './components/ui';
import type { DashData } from './components/dashboard/dashShared';
import DashAlerts from './components/dashboard/DashAlerts';
import DashTop from './components/dashboard/DashTop';
import DashProducts from './components/dashboard/DashProducts';
import DashWebsites from './components/dashboard/DashWebsites';
import { DashError, DashSkeleton, PausedBanner } from './components/dashboard/DashStates';

export default function PlaybookDashboard({ name, addToast, go }: { name: string; addToast: AddToast; go: (p: PbPage, s?: ProductsStart) => void }) {
  const [d, setD] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const loaded = useRef(false);

  /** `quiet`: the every-minute refresh — no dimming, and a failure keeps the numbers on screen without a toast. */
  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      // The AI cost is a side figure: if it cannot be read, the rest of the dashboard still shows.
      const cost = getAiCostSince(istMonthStart()).catch(e => { logSwallowed('pb ai cost', e); return null; });
      const today = getAiCostSince(istDayStart()).then(c => Math.round(c.usd * USD_INR * 100) / 100).catch(e => { logSwallowed('pb ai cost today', e); return null; });
      const tgNote = telegramTrouble().catch(e => { logSwallowed('pb telegram state', e); return null; }); // a side note too
      const [products, sites, auto, failed, review, ai, noted, oldest, spentToday, telegram] = await Promise.all([productCounts(), listWebsitesLite(), automationState(),
        listingTotal('failed'), listingTotal('review'), cost, notedTotal(), oldestReview(), today, tgNote]);
      const perSite = await listingCounts(sites.map(s => s.id));
      setD({ products, sites, perSite, failed, review, paused: auto.paused, ai, noted, oldestReview: oldest, lastRun: auto.lastRun, limit: auto.limit, spentToday, telegram });
      loaded.current = true;
      setLoadErr(null);
    } catch (e) {
      if (quiet) { logSwallowed('pb dashboard refresh', e); return; }
      // First load: the failed tile with Try again is the signal (no toast on top).
      // A failed Refresh keeps the old numbers on screen, so it must say so.
      const m = friendlyError(e);
      setLoadErr(m);
      if (loaded.current) addToast(m, 'error');
    } finally { if (!quiet) setLoading(false); }
  }, [addToast]);
  useEffect(() => { void load(); }, [load]);
  useAutoRefresh(() => { if (loaded.current) void load(true); });

  const refresh = (block?: boolean) => (
    <PbButton icon="refresh" onClick={() => void load()} busy={loading} busyLabel="Refreshing…" block={block}>Refresh</PbButton>
  );
  const add = () => go('products', { add: true });

  return (
    <>
      <PbPageHeader title={name ? `Hello, ${name}` : 'Dashboard'} sub={d?.lastRun ? `Product Directory at a glance · automation last ran ${istRelative(d.lastRun)}` : 'Product Directory at a glance'}
        actions={<>{refresh()}<PbButton kind="primary" icon="plus" onClick={add}>Add product</PbButton></>}
        phoneAction={<PbButton kind="primary" icon="plus" iconOnly aria-label="Add product" onClick={add} />} />

      {!d ? (
        loadErr ? <DashError message={loadErr} busy={loading} onRetry={() => void load()} /> : <DashSkeleton />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--pb-pad-tile)', opacity: loading ? 0.6 : 1, transition: 'opacity .3s ease' }}
          aria-busy={loading || undefined}>
          {d.paused && <PausedBanner onOpen={() => go('settings')} />}
          <DashAlerts d={d} go={go} />
          <div className="pb-bento pb-bento--dash">
            <DashTop d={d} go={go} />
            <DashProducts d={d} go={go} />
          </div>
          <DashWebsites d={d} go={go} />
        </div>
      )}

      {/* Phone: the header holds only "+", so Refresh sits at the end of the page, in thumb reach.
          Only once something loaded: the skeletons are the first load's signal, and the error tile has Try again. */}
      {d && <div className="pb-phone-only" style={{ marginTop: 16 }}>{refresh(true)}</div>}
    </>
  );
}
