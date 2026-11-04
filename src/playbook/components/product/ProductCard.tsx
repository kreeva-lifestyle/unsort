// One product in the list: first photo, name, vendor, cost, status dot, one chip per website.
import { T, S, alpha } from '../../../lib/theme';
import { pbImageUrl } from '../../data/pbFunctions';
import type { ProductRow, WebsiteLite } from '../../data/products';
import { Dot, LISTING_STATUS, PRODUCT_STATUS, rupees } from './status';

export function Thumb({ path, size = 64 }: { path?: string; size?: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: T.r, background: T.glass2, border: `1px solid ${T.bd}`, overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.tx3, fontSize: 10 }}>
      {path ? <img src={pbImageUrl(path)} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : 'No photo'}
    </div>
  );
}

export default function ProductCard({ p, sites, onOpen }: { p: ProductRow; sites: WebsiteLite[]; onOpen: () => void }) {
  const st = PRODUCT_STATUS[p.status];
  const siteName = (id: string) => sites.find(s => s.id === id)?.name ?? 'Website';
  return (
    <button type="button" onClick={onOpen}
      style={{ ...S.card, padding: 12, display: 'flex', gap: 12, textAlign: 'left', cursor: 'pointer', color: T.tx, fontFamily: T.sans, width: '100%', minWidth: 0 }}>
      <Thumb path={p.pb_product_images[0]?.path} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {p.name || p.sku || 'Untitled product'}
        </div>
        <div style={{ fontSize: 11, color: T.tx3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {[p.pb_vendors?.name, p.sku, p.category].filter(Boolean).join(' · ') || '—'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: T.mono, fontSize: 12, color: T.tx2 }}>{rupees(p.cost_price)}</span>
          <Dot color={st.color} label={st.label} />
        </div>
        {p.pb_listings.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
            {p.pb_listings.map(l => {
              const ls = LISTING_STATUS[l.status];
              return (
                <span key={l.id} title={`${siteName(l.website_id)}: ${ls.label}`}
                  style={{ ...S.badge, gap: 5, background: alpha(ls.color, 0.1), color: T.tx2, border: `1px solid ${alpha(ls.color, 0.25)}`, maxWidth: 160 }}>
                  <span style={{ width: 6, height: 6, borderRadius: 3, background: ls.color, flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{siteName(l.website_id)}</span>
                </span>
              );
            })}
          </div>
        )}
      </div>
    </button>
  );
}
