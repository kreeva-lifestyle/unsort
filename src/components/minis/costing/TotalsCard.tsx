// The right-aligned totals card from the reference screenshot: sheet cost,
// editable maintenance %, total/pc, and the pieces field that drives both
// the "total for N pcs" line and the purchase plan.
import { T, S } from '../../../lib/theme';
import { numericKeyDown } from '../../../lib/numericInput';
import { CostingComponent, sheetCost, totalCost, money, num } from './costingModel';

export default function TotalsCard({ components, maintenancePct, onMaintenance, pieces, onPieces }: {
  components: CostingComponent[];
  maintenancePct: number | string;
  onMaintenance: (v: string) => void;
  pieces: string;
  onPieces: (v: string) => void;
}) {
  return (
    <div style={{ maxWidth: 340, marginLeft: 'auto', marginTop: 14, background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.tx2, padding: '4px 0' }}>
        <span>Cost</span><span style={{ fontFamily: T.mono }}>{money(sheetCost(components))}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: T.tx2, padding: '4px 0' }}>
        <span>Maintenance (%)</span>
        <input value={maintenancePct} onChange={e => onMaintenance(e.target.value)}
          onKeyDown={e => numericKeyDown(e)} type="number" inputMode="decimal"
          style={{ ...S.fInput, width: 84, textAlign: 'right' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, color: T.tx, padding: '6px 0 0', borderTop: `1px solid ${T.bd}`, marginTop: 4 }}>
        <span>Total cost / pc</span><span style={{ fontFamily: T.mono, color: T.ac2 }}>{money(totalCost(components, maintenancePct))}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: T.tx2, padding: '8px 0 0', borderTop: `1px solid ${T.bd}`, marginTop: 8 }}>
        <span>Pieces to make</span>
        <input value={pieces} onChange={e => onPieces(e.target.value)} onKeyDown={e => numericKeyDown(e)}
          type="number" min="1" inputMode="numeric" placeholder="e.g. 48"
          style={{ ...S.fInput, width: 84, textAlign: 'right' }} />
      </div>
      {num(pieces) > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, color: T.tx, padding: '6px 0 0' }}>
          <span>Total for {Math.floor(num(pieces))} pcs</span>
          <span style={{ fontFamily: T.mono, color: T.gr }}>{money(totalCost(components, maintenancePct) * Math.floor(num(pieces)))}</span>
        </div>
      )}
    </div>
  );
}
