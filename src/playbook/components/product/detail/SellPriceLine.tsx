// An imported product's selling price: "Sells at ₹2,499 on every website
// (price copied from example.com on 8 Nov)". The pricing rules are skipped
// for it, so the Facts tile shows this box under the cost (which is then
// optional) and the hero / name card lead with this figure instead of the cost.
import type { PbProduct } from '../../../types';
import { PB, pbMeta, pbNum } from '../../../pbTheme';
import { rupees } from '../status';

type P = Pick<PbProduct, 'sell_price' | 'price_note' | 'cost_price'>;

/** Inside Facts, under the cost: the figure in mono, where it came from, and what it means for the price rules. */
export function SellPriceLine({ p }: { p: P }) {
  if (p.sell_price == null) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '12px 16px', borderRadius: PB.r.input, background: PB.ctl, border: `1px solid ${PB.tileBd}`, minWidth: 0 }}>
      <span style={{ fontSize: 13, lineHeight: 1.5, color: PB.tx, overflowWrap: 'anywhere' }}>
        Sells at <span style={{ ...pbNum, fontWeight: 600 }}>{rupees(p.sell_price)}</span> on every website{p.price_note ? <span style={{ color: PB.tx2 }}> ({p.price_note.replace(/^./, c => c.toLowerCase())})</span> : null}.
      </span>
      <span style={pbMeta}>The websites’ pricing rules are skipped for this product. {p.cost_price == null ? 'A cost price is optional — add it to see the margin.' : 'Its cost is kept for your records only.'}</span>
    </div>
  );
}
