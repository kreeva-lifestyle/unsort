// One product on phone: a glass row (DESIGN.md §7) with the 64×80 photo,
// name (2-line clamp), vendor and cost, the product status and a short
// per-website summary ("Live on 2 websites"). Tinted when it needs action.
import type { ProductRow } from '../../../data/products';
import { pbNum } from '../../../pbTheme';
import PbRow from '../../ui/PbRow';
import { Dot, PRODUCT_STATUS, rupees } from '../status';
import ProductPhoto from './ProductPhoto';
import { listingSummary, productTitle, productTone } from './productListUtil';

export default function ProductRowItem({ p, onOpen }: { p: ProductRow; onOpen: () => void }) {
  const st = PRODUCT_STATUS[p.status];
  const vendor = p.pb_vendors?.name;
  return (
    <PbRow
      onClick={onOpen}
      data-open-id={p.id}
      tone={productTone(p)}
      photo={<ProductPhoto path={p.pb_product_images[0]?.path} width={64} height={80} />}
      title={productTitle(p)}
      meta={<>
        {vendor && <>{vendor} · </>}
        {p.cost_price == null ? 'No price' : <span style={pbNum}>{rupees(p.cost_price)}</span>}
      </>}
      status={
        <span style={{ display: 'flex', flexWrap: 'wrap', columnGap: 12, rowGap: 4, minWidth: 0 }}>
          <Dot color={st.color} label={st.label} />
          {listingSummary(p).map(s => <Dot key={s.label} color={s.color} label={s.label} style={{ whiteSpace: 'normal' }} />)}
        </span>
      }
    />
  );
}
