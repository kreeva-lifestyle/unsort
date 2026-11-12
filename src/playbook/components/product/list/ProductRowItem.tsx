// One product on phone: a glass row (DESIGN.md §7) with the 64×80 photo,
// name (2-line clamp), vendor, cost and where it came from, the product status and which websites
// it is on, by name ("Failed on Arya", "Live on Kreeva, Aza +1"): the most
// urgent group and the live one, the rest as "· 2 more websites".
// Tinted when it needs action.
import type { ProductRow, WebsiteLite } from '../../../data/products';
import { PB, pbNum } from '../../../pbTheme';
import PbRow from '../../ui/PbRow';
import { Dot, PRODUCT_STATUS, rupees } from '../status';
import ProductPhoto from './ProductPhoto';
import { listingSummary, productTitle, productTone, siteNamer, statusLabel } from './productListUtil';
import { sourceText } from '../../../data/duplicates';

export default function ProductRowItem({ p, sites, onOpen, copyOf }: { p: ProductRow; sites: WebsiteLite[]; onOpen: () => void; copyOf?: string }) {
  const st = PRODUCT_STATUS[p.status];
  const vendor = p.pb_vendors?.name;
  const from = sourceText(p.source, p.source_ref);
  // The groups are ordered by urgency (failed first): the first one shows, and "Live on …" always does.
  const groups = listingSummary(p, siteNamer(sites));
  const live = groups.find(g => g.color === PB.live);
  const shown = [groups[0], ...(live && live !== groups[0] ? [live] : [])].filter(Boolean);
  const more = groups.filter(g => !shown.includes(g)).reduce((n, g) => n + g.n, 0);
  return (
    <PbRow
      onClick={onOpen}
      data-open-id={p.id}
      tone={productTone(p)}
      photo={<ProductPhoto path={p.pb_product_images[0]?.path} width={64} height={80} />}
      title={productTitle(p)}
      meta={<>
        {vendor && <>{vendor} · </>}
        {p.cost_price != null ? <span style={pbNum}>{rupees(p.cost_price)}</span> : p.sell_price != null ? <>Sells at <span style={pbNum}>{rupees(p.sell_price)}</span></> : 'No price'}
        {from && <> · from {from}</>}
      </>}
      status={
        <span style={{ display: 'flex', flexWrap: 'wrap', columnGap: 12, rowGap: 4, minWidth: 0 }}>
          <Dot color={st.color} label={statusLabel(p, copyOf)} style={{ whiteSpace: 'normal', overflowWrap: 'anywhere', minWidth: 0 }} />
          {shown.map((g, i) => (
            <Dot key={g.label} color={g.color} label={i === shown.length - 1 && more ? `${g.label} · ${more} more website${more === 1 ? '' : 's'}` : g.label} style={{ whiteSpace: 'normal', overflowWrap: 'anywhere', minWidth: 0 }} />
          ))}
        </span>
      }
    />
  );
}
