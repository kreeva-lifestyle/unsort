// Playbook's home: what the Product Directory is doing right now — products by
// status, listings per website, what needs a person, and whether automation is paused.
import { useCallback, useEffect, useState } from 'react';
import { T, S, alpha } from '../lib/theme';
import { friendlyError } from '../lib/friendlyError';
import Empty from '../components/ui/Empty';
import type { PbPage } from './components/PbNav';
import type { AddToast } from './components/PbToasts';
import type { ProductsStart } from './pages/Products';
import type { PbProductStatus } from './types';
import { getPbSettingsLite, listWebsitesLite, type WebsiteLite } from './data/products';
import { LISTING_GROUPS, PRODUCT_STATUSES, listingCounts, listingTotal, productCounts } from './data/dashboard';
import { Dot, PRODUCT_STATUS } from './components/product/status';

type Data = { products: Record<PbProductStatus, number>; sites: WebsiteLite[]; perSite: Record<string, Record<string, number>>; failed: number; review: number; paused: boolean };

function Tile({ label, n, color, hint, onClick }: { label: string; n: number | string; color: string; hint?: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick}
      style={{ ...S.card, textAlign: 'left', cursor: onClick ? 'pointer' : 'default', minHeight: 44, color: T.tx, fontFamily: T.sans, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Dot color={color} label={label} />
      <span style={{ fontFamily: T.sora, fontSize: 24, fontWeight: 700 }}>{n}</span>
      {hint && <span style={{ fontSize: 11, color: T.tx3, lineHeight: 1.4 }}>{hint}</span>}
    </button>
  );
}

const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 } as const;
const head = { ...S.sectionTitle, margin: '22px 0 10px' };

export default function PlaybookDashboard({ name, addToast, go }: { name: string; addToast: AddToast; go: (p: PbPage, s?: ProductsStart) => void }) {
  const [d, setD] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [products, sites, settings, failed, review] = await Promise.all([productCounts(), listWebsitesLite(), getPbSettingsLite(), listingTotal('failed'), listingTotal('review')]);
      const perSite = await listingCounts(sites.map(s => s.id));
      setD({ products, sites, perSite, failed, review, paused: settings.paused });
    } catch (e) { addToast(friendlyError(e), 'error'); }
    finally { setLoading(false); }
  }, [addToast]);
  useEffect(() => { void load(); }, [load]);

  const attention = d ? d.products.needs_info + d.failed + d.review : 0;
  return (
    <>
      <div style={{ ...S.flexBetween, gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: T.sora, fontSize: 22, fontWeight: 700, letterSpacing: -0.4 }}>{name ? `Hello, ${name}` : 'Dashboard'}</div>
          <div style={{ fontSize: 12, color: T.tx3, marginTop: 4 }}>Product Directory at a glance</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={load} style={{ ...S.btnGhost, minHeight: 44, pointerEvents: loading ? 'none' : 'auto', opacity: loading ? 0.5 : 1 }}>{loading ? 'Loading…' : 'Refresh'}</button>
          <button type="button" onClick={() => go('products', { add: true })} style={{ ...S.btnPrimary, minHeight: 44 }}>+ Add product</button>
        </div>
      </div>

      {d?.paused && (
        <div style={{ ...S.warningBox, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12, padding: '10px 12px' }}>
          <span style={{ flex: 1, minWidth: 200 }}>Automation is paused — nothing is read, written or published on its own. Buttons on a product still work.</span>
          <button type="button" onClick={() => go('settings')} style={{ ...S.btnWarn, minHeight: 44 }}>Open Settings</button>
        </div>
      )}

      {!d ? (loading ? <div style={{ ...S.emptyState }}>Loading…</div> : null) : (
        <>
          <div style={head}>Needs attention{attention ? ` · ${attention}` : ''}</div>
          {attention === 0 ? <div style={{ ...S.successBox, fontSize: 12 }}>Nothing is waiting for a person.</div> : (
            <div style={grid}>
              <Tile label="Needs info" n={d.products.needs_info} color={T.yl} hint="Cost price or category missing" onClick={() => go('products', { status: 'needs_info' })} />
              <Tile label="Needs review" n={d.review} color={T.yl} hint="Written, waiting for approval" onClick={() => go('products', { status: 'l:review' })} />
              <Tile label="Failed to publish" n={d.failed} color={T.re} hint="Open to see the error" onClick={() => go('products', { status: 'l:failed' })} />
            </div>
          )}

          <div style={head}>Products</div>
          <div style={grid}>
            {PRODUCT_STATUSES.map(s => (
              <Tile key={s} label={PRODUCT_STATUS[s].label} n={d.products[s]} color={PRODUCT_STATUS[s].color} onClick={() => go('products', { status: s })} />
            ))}
          </div>

          <div style={head}>Websites</div>
          {d.sites.length === 0 ? (
            <Empty icon="tag" title="No websites yet" message="Add a Shopify website, connect it, and set its rules — products start flowing there automatically." cta="Add a website" onCta={() => go('websites')} />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
              {d.sites.map(w => (
                <div key={w.id} style={{ ...S.card, borderColor: w.active ? T.bd : alpha(T.yl, 0.25) }}>
                  <div style={{ ...S.flexBetween, gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</div>
                      <div style={{ fontSize: 11, color: T.tx3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.shop_domain}</div>
                    </div>
                    <Dot color={w.active ? T.gr : T.yl} label={w.active ? `On · ${w.publish_mode}` : 'Off'} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, marginTop: 12 }}>
                    {LISTING_GROUPS.map(g => (
                      <button key={g.id} type="button" onClick={() => go('products', { websiteId: w.id, status: g.filter })}
                        style={{ minHeight: 44, background: T.glass2, border: `1px solid ${T.bd}`, borderRadius: T.rSm, cursor: 'pointer', color: g.id === 'failed' && d.perSite[w.id]?.failed ? T.re : T.tx, fontFamily: T.sans, padding: '4px 2px' }}>
                        <div style={{ fontSize: 15, fontWeight: 700 }}>{d.perSite[w.id]?.[g.id] ?? 0}</div>
                        <div style={{ fontSize: 10, color: T.tx3 }}>{g.label}</div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
