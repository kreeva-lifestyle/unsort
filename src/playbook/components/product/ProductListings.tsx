// Where this product is listed: one row per website (status, price, title,
// error, Shopify link). Tap a row to open the listing editor.
import { useState } from 'react';
import { T, S } from '../../../lib/theme';
import type { AddToast } from '../PbToasts';
import { shopifyAdminUrl } from '../../data/pbFunctions';
import type { ListingFull, WebsiteLite } from '../../data/products';
import ListingEditor from './ListingEditor';
import { Dot, LISTING_STATUS, rupees } from './status';

export default function ProductListings({ listings, sites, onChanged, addToast }: {
  listings: ListingFull[]; sites: WebsiteLite[]; onChanged: () => void; addToast: AddToast;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = listings.find(l => l.id === openId);
  const site = (id: string) => sites.find(s => s.id === id);
  const notOn = sites.filter(s => s.active && !listings.some(l => l.website_id === s.id));

  return (
    <div style={S.card}>
      <div style={{ ...S.sectionTitle, marginBottom: 10 }}>Websites</div>
      {listings.length === 0 && (
        <div style={{ fontSize: 12, color: T.tx3, lineHeight: 1.6 }}>
          Not listed anywhere yet. Once the product is Ready, each website's rules decide whether it goes there.
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {listings.map(l => {
          const w = site(l.website_id); const st = LISTING_STATUS[l.status];
          const admin = w ? shopifyAdminUrl(w.shop_domain, l.shopify_product_id) : null;
          return (
            <div key={l.id} style={{ display: 'flex', gap: 8, alignItems: 'stretch', background: T.glass1, border: `1px solid ${T.bd}`, borderRadius: T.r }}>
              <button type="button" onClick={() => setOpenId(l.id)}
                style={{ flex: 1, minWidth: 0, minHeight: 44, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', color: T.tx, fontFamily: T.sans, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{w?.name ?? 'Website'}</span>
                  <Dot color={st.color} label={st.label} />
                  <span style={{ fontFamily: T.mono, fontSize: 12, color: T.tx2, marginLeft: 'auto' }}>{rupees(l.price)}</span>
                </span>
                <span style={{ fontSize: 12, color: l.title ? T.tx2 : T.tx3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.title || 'Not written yet'}</span>
                {l.error && <span style={{ fontSize: 11, color: T.re, lineHeight: 1.4 }}>{l.error}</span>}
              </button>
              {admin && (
                <a href={admin} target="_blank" rel="noreferrer" aria-label={`Open on Shopify (${w?.name ?? ''})`}
                  style={{ ...S.btnGhost, ...S.btnSm, alignSelf: 'center', marginRight: 8, minHeight: 44, textDecoration: 'none' }}>Shopify</a>
              )}
            </div>
          );
        })}
      </div>
      {notOn.length > 0 && listings.length > 0 && (
        <div style={{ fontSize: 11, color: T.tx3, marginTop: 10 }}>Not on: {notOn.map(s => s.name).join(', ')}</div>
      )}
      {open && <ListingEditor key={open.id} listing={open} site={site(open.website_id)} onClose={() => setOpenId(null)} onChanged={onChanged} addToast={addToast} />}
    </div>
  );
}
