// Website tiles: one per website, sized by count so every bento row is full
// (layout.siteSpans). Each tile shows the website's name, domain, an
// On/Off tag and its four listing groups as tappable rows that open the
// Products list filtered to that website and group.
import { PB, pbBtnSecondary, pbLabel, pbMeta, pbName, pbNum, pbTileTitle } from '../../pbTheme';
import { LISTING_GROUPS } from '../../data/dashboard';
import type { WebsiteLite } from '../../data/products';
import { Dot } from '../product/status';
import { PbIcon, PbTag, PbTile } from '../ui';
import { count, type DashData, type DashGo } from './dashShared';
import { siteSpans, useSixCols } from '../../layout';

// Dashboard group → status token (layout-and-components.md §6).
const GROUP_COLOR: Record<string, string> = { working: PB.busy, review: PB.review, published: PB.live, failed: PB.failed };
const GROUP_TINT: Record<string, { bg: string; bd: string }> = {
  review: { bg: PB.reviewBg, bd: PB.reviewBd }, failed: { bg: PB.failedBg, bd: PB.failedBd },
};

function SiteTile({ w, n, span, go }: { w: WebsiteLite; n: Record<string, number> | undefined; span: 12 | 6 | 4; go: DashGo }) {
  const headId = `pb-dash-site-${w.id}`;
  return (
    <PbTile flat as="article" span={span} aria-labelledby={headId} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, minWidth: 0 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3 id={headId} className="pb-clamp2" style={{ ...pbName, margin: 0, fontSize: 16, lineHeight: 1.5 }}>{w.name}</h3>
          <div style={{ ...pbMeta, ...pbNum, overflowWrap: 'anywhere' }}>{w.shop_domain || '—'}</div>
        </div>
        <PbTag style={{ flexShrink: 0 }}>{w.active ? `On · ${w.publish_mode}` : 'Off'}</PbTag>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {LISTING_GROUPS.map(g => {
          const v = n?.[g.id] ?? 0;
          const tint = v > 0 ? GROUP_TINT[g.id] : undefined;
          return (
            <button key={g.id} type="button" className="pb-pill" onClick={() => go('products', { websiteId: w.id, status: g.filter })}
              aria-label={`${w.name}, ${g.label}: ${count(v)}. Open the list`}
              style={{
                ...pbBtnSecondary, minHeight: 44, padding: '0 12px', gap: 12, justifyContent: 'flex-start', width: '100%',
                background: tint?.bg ?? 'transparent', borderColor: tint?.bd ?? 'transparent', fontWeight: 500,
              }}>
              <Dot color={GROUP_COLOR[g.id] ?? PB.tx3} label={g.label} style={{ flex: 1, fontSize: 13, color: PB.tx }} />
              <span style={{ ...pbNum, fontSize: 15, fontWeight: 500, color: PB.tx }}>{count(v)}</span>
              <span style={{ color: PB.tx3, display: 'inline-flex' }}><PbIcon name="chevronRight" size={16} /></span>
            </button>
          );
        })}
      </div>
    </PbTile>
  );
}

export default function DashWebsites({ d, go }: { d: DashData; go: DashGo }) {
  const six = useSixCols();
  const spans = siteSpans(d.sites.length, six);
  return (
    <section aria-labelledby="pb-dash-sites" style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h2 id="pb-dash-sites" style={{ ...pbLabel, margin: 0 }}>Websites</h2>
        {d.sites.length > 0 && <span style={{ ...pbMeta, ...pbNum }}>{count(d.sites.length)}</span>}
      </div>
      {d.sites.length === 0 ? (
        <PbTile flat style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 12, padding: '32px 16px' }}>
          <span aria-hidden="true" style={{ color: PB.brandA, display: 'inline-flex' }}><PbIcon name="globe" size={32} /></span>
          <h3 style={pbTileTitle}>No websites yet</h3>
          <p style={{ ...pbMeta, fontSize: 13, margin: 0, maxWidth: 420 }}>
            Add a Shopify website, connect it, and set its rules. Products start flowing there automatically.
          </p>
          <button type="button" className="pb-pill" onClick={() => go('websites')} style={{ ...pbBtnSecondary, minHeight: 44 }}>Add a website</button>
        </PbTile>
      ) : (
        <div className="pb-bento pb-bento--auto">
          {d.sites.map((w, i) => <SiteTile key={w.id} w={w} n={d.perSite[w.id]} span={spans[i] as 12 | 6 | 4} go={go} />)}
        </div>
      )}
    </section>
  );
}
