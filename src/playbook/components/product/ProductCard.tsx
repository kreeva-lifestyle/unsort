// One product in the desktop results grid (the caller places it: 4 of 12 bento columns): the
// first photo in a fixed box, name (2-line clamp), vendor · SKU · category,
// the cost in mono with the product status, then one dot + label per website.
// A flat glass tile (no blur in a results grid); tinted when it needs action.
import type { ProductRow, WebsiteLite } from '../../data/products';
import { PB, pbMeta, pbName, pbNum } from '../../pbTheme';
import PbTile from '../ui/PbTile';
import { Dot, LISTING_STATUS, PRODUCT_STATUS, rupees } from './status';
import ProductPhoto from './list/ProductPhoto';
import { productTitle, productTone, siteNamer, statusLabel } from './list/productListUtil';

export default function ProductCard({ p, sites, onOpen }: { p: ProductRow; sites: WebsiteLite[]; onOpen: () => void }) {
  const st = PRODUCT_STATUS[p.status];
  const siteName = siteNamer(sites);
  const meta = [p.pb_vendors?.name, p.category].filter(Boolean).join(' · ');
  return (
    <PbTile as="button" flat variant={productTone(p) ?? 'default'} onClick={onOpen} data-open-id={p.id}
      style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 0, fontFamily: PB.sans, color: PB.tx, height: '100%' }}>
      <ProductPhoto path={p.pb_product_images[0]?.path} width="100%" height="auto" px={440} style={{ aspectRatio: '5 / 4' }} />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 8px 8px', minWidth: 0, flex: 1 }}>
        <span className="pb-clamp2" style={pbName}>{productTitle(p)}</span>
        {(meta || p.sku) && (
          <span style={{ ...pbMeta, overflowWrap: 'anywhere' }}>
            {meta}{meta && p.sku ? ' · ' : ''}{p.sku && <span style={pbNum}>{p.sku}</span>}
          </span>
        )}
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          {p.cost_price != null ? <span style={{ ...pbNum, fontSize: 15, fontWeight: 500, color: PB.tx }}>{rupees(p.cost_price)}</span>
            : p.sell_price != null ? <span style={pbMeta}>Sells at <span style={{ ...pbNum, fontSize: 15, fontWeight: 500, color: PB.tx }}>{rupees(p.sell_price)}</span></span>
              : <span style={pbMeta}>No price</span>}
          <Dot color={st.color} label={statusLabel(p)} style={{ whiteSpace: 'normal' }} />
        </span>
        {p.pb_listings.length > 0 && (
          <span style={{ display: 'flex', flexWrap: 'wrap', columnGap: 12, rowGap: 4, borderTop: `1px solid ${PB.tileBd}`, paddingTop: 8, marginTop: 'auto' }}>
            {p.pb_listings.map(l => {
              const ls = LISTING_STATUS[l.status];
              return <Dot key={l.id} color={ls.color} label={`${siteName(l.website_id)} · ${ls.label}`} style={{ whiteSpace: 'normal', overflowWrap: 'anywhere', minWidth: 0 }} />;
            })}
          </span>
        )}
      </span>
    </PbTile>
  );
}
