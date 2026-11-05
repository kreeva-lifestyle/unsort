// Products by status: a 12-wide tile with a thin segmented bar (status
// colours, 2px gaps) and one dot · label · count button per status, each
// opening the Products list on that status (data-and-charts.md §1: "thin
// segmented bar plus dot · count · label chips"). The bar is decoration;
// every number is also text on its button.
import { PB, pbBtnSecondary, pbMeta, pbNum, pbTileTitle } from '../../pbTheme';
import { PRODUCT_STATUSES } from '../../data/dashboard';
import { Dot, PRODUCT_STATUS } from '../product/status';
import { PbTile } from '../ui';
import { count, type DashData, type DashGo } from './dashShared';

export default function DashProducts({ d, go }: { d: DashData; go: DashGo }) {
  const total = PRODUCT_STATUSES.reduce((s, k) => s + d.products[k], 0);
  return (
    <PbTile flat as="section" span={12} aria-labelledby="pb-dash-products" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', minWidth: 0 }}>
        <h2 id="pb-dash-products" style={pbTileTitle}>Products</h2>
        <span style={pbMeta}><span style={pbNum}>{count(total)}</span> {total === 1 ? 'product' : 'products'} in all</span>
      </div>
      <div aria-hidden="true" style={{ display: 'flex', gap: 2, height: 8, borderRadius: PB.r.chartBar, overflow: 'hidden', background: total ? 'transparent' : PB.skelBar }}>
        {total > 0 && PRODUCT_STATUSES.filter(s => d.products[s] > 0).map(s => (
          <span key={s} style={{ flex: `${d.products[s]} 0 0`, minWidth: 4, background: PRODUCT_STATUS[s].color }} />
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {PRODUCT_STATUSES.map(s => (
          <button key={s} type="button" className="pb-pill" onClick={() => go('products', { status: s })}
            aria-label={`${PRODUCT_STATUS[s].label}: ${count(d.products[s])}. Open the list`}
            style={{ ...pbBtnSecondary, minHeight: 44, gap: 12, flex: '1 1 140px', justifyContent: 'space-between' }}>
            <Dot color={PRODUCT_STATUS[s].color} label={PRODUCT_STATUS[s].label} style={{ fontSize: 13, color: PB.tx }} />
            <span style={{ ...pbNum, fontSize: 15, fontWeight: 500, color: PB.tx }}>{count(d.products[s])}</span>
          </button>
        ))}
      </div>
    </PbTile>
  );
}
