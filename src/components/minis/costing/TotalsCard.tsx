// The money panel — the ONE place the sheet's numbers live: cost, editable
// maintenance %, total/pc (the headline), selling price (locked to the
// master sheet when it has one) with the margin, and the pieces field that
// drives "total for N pcs", the purchase plan and Raise POs. Sits in the
// desktop rail and in flow on the phone.
import { T, S } from '../../../lib/theme';
import { numericKeyDown } from '../../../lib/numericInput';
import { CostingComponent, sheetCost, totalCost, money, num } from './costingModel';

export default function TotalsCard({ components, maintenancePct, onMaintenance, pieces, onPieces, sellingPrice, masterPrice, onSelling }: {
  components: CostingComponent[];
  maintenancePct: number | string;
  onMaintenance: (v: string) => void;
  pieces: string;
  onPieces: (v: string) => void;
  sellingPrice: number | string | null | undefined;
  /** Master sheet PRICE EXC GST for this SKU — when present it is the final price and the field locks. */
  masterPrice: number | null;
  onSelling: (v: string) => void;
}) {
  const total = totalCost(components, maintenancePct);
  const sell = num(sellingPrice ?? '');
  const pcs = Math.floor(num(pieces));
  const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, fontSize: 12, color: T.tx2, padding: '4px 0', minHeight: 32 };
  const divider: React.CSSProperties = { borderTop: `1px solid ${T.bd}`, marginTop: 6, paddingTop: 6 };
  const field: React.CSSProperties = { ...S.fInput, width: 84, textAlign: 'right', fontFamily: T.mono };
  return (
    <div className="cost-money">
      <div style={row}><span>Cost</span><span style={{ fontFamily: T.mono }}>{money(sheetCost(components))}</span></div>
      <div style={row}>
        <span>Maintenance (%)</span>
        <input value={maintenancePct} onChange={e => onMaintenance(e.target.value)} onKeyDown={e => numericKeyDown(e)}
          type="number" inputMode="decimal" aria-label="Maintenance percent" style={field} />
      </div>
      <div style={{ ...row, ...divider, alignItems: 'baseline' }}>
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: T.tx3 }}>Total cost / pc</span>
        <span style={{ fontFamily: T.sora, fontSize: 20, fontWeight: 800, color: T.ac2 }}>{money(total)}</span>
      </div>
      <div style={{ ...row, ...divider }}>
        <span>Selling price{masterPrice ? <span style={{ color: T.tx3 }}> · master sheet</span> : ''}</span>
        {masterPrice
          ? <div title="Final price from the master sheet (PRICE EXC GST) — change it there"
              style={{ ...S.fInput, width: 110, fontFamily: T.mono, fontWeight: 700, color: T.gr, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', background: 'oklch(0.72 0.19 145 / .06)', borderColor: 'oklch(0.72 0.19 145 / .3)' }}>{money(masterPrice)}</div>
          : <input id="cost-f-selling" value={sellingPrice ?? ''} onChange={e => onSelling(e.target.value)} onKeyDown={e => numericKeyDown(e)}
              type="number" min="0" inputMode="decimal" placeholder="₹" aria-label="Selling price" style={{ ...field, width: 110 }} />}
      </div>
      <div style={row}>
        <span>Margin</span>
        {sell > 0
          ? <span style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 700, color: sell - total >= 0 ? T.gr : T.re }}>{money(sell - total)} · {((sell - total) / sell * 100).toFixed(1)}%</span>
          : <span style={{ fontSize: 10.5, color: T.tx3 }}>enter selling price to see it</span>}
      </div>
      <div style={{ ...row, ...divider }}>
        <span>Pieces to make</span>
        <input value={pieces} onChange={e => onPieces(e.target.value)} onKeyDown={e => numericKeyDown(e)}
          type="number" min="1" inputMode="numeric" placeholder="e.g. 48" aria-label="Pieces to make" style={field} />
      </div>
      {pcs > 0
        ? <div style={{ ...row, fontSize: 13, fontWeight: 700, color: T.tx }}><span>Total for {pcs} pcs</span><span style={{ fontFamily: T.mono, color: T.gr }}>{money(total * pcs)}</span></div>
        : <div style={{ fontSize: 10, color: T.tx3, padding: '2px 0' }}>needed for the purchase plan and POs</div>}
    </div>
  );
}
