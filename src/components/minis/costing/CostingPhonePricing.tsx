// Phone "Pricing" tab: the money panel sized for thumbs — maintenance %
// with − / + steppers, the total/pc headline, selling price (locked to the
// master sheet when it has one) with the margin, and pieces to make with
// one-tap presets. Same numbers as the desktop TotalsCard.
import { T, S } from '../../../lib/theme';
import { numericKeyDown } from '../../../lib/numericInput';
import { CostingComponent, sheetCost, totalCost, money, num } from './costingModel';

const PRESETS = [12, 24, 48, 96];

export default function CostingPhonePricing({ components, maintenancePct, onMaintenance, pieces, onPieces, sellingPrice, masterPrice, onSelling }: {
  components: CostingComponent[];
  maintenancePct: number | string;
  onMaintenance: (v: string) => void;
  pieces: string;
  onPieces: (v: string) => void;
  sellingPrice: number | string | null | undefined;
  masterPrice: number | null;
  onSelling: (v: string) => void;
}) {
  const total = totalCost(components, maintenancePct);
  const sell = num(sellingPrice ?? '');
  const pcs = Math.floor(num(pieces));
  const maint = num(maintenancePct);
  const card: React.CSSProperties = { background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: T.rLg, padding: '12px 14px', marginBottom: 10 };
  const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, fontSize: 13, color: T.tx2, minHeight: 44 };
  const step = (label: string, onClick: () => void) => (
    <button type="button" onClick={onClick} aria-label={label} style={{ ...S.btnGhost, width: 44, height: 44, padding: 0, fontSize: 18, flexShrink: 0 }}>{label === 'Less maintenance' ? '−' : '+'}</button>
  );
  const chip = (n: number) => (
    <button key={n} type="button" onClick={() => onPieces(String(n))} aria-pressed={pcs === n}
      style={{ ...S.btnGhost, minHeight: 40, padding: '6px 14px', borderRadius: 999, ...(pcs === n ? { background: T.ac3, color: T.ac2, borderColor: T.ac33 } : { color: T.tx3 }) }}>{n}</button>
  );
  return (
    <div>
      <div style={card}>
        <div style={row}><span>Cost of materials</span><span style={{ fontFamily: T.mono, color: T.tx }}>{money(sheetCost(components))}</span></div>
        <div style={row}>
          <span>Maintenance</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {step('Less maintenance', () => onMaintenance(String(Math.max(0, maint - 1))))}
            <input value={maintenancePct} onChange={e => onMaintenance(e.target.value)} onKeyDown={e => numericKeyDown(e)} type="number" inputMode="decimal" aria-label="Maintenance percent"
              style={{ ...S.fInput, width: 72, height: 44, textAlign: 'center', fontFamily: T.mono }} />
            <span style={{ color: T.tx3, fontSize: 12 }}>%</span>
            {step('More maintenance', () => onMaintenance(String(maint + 1)))}
          </div>
        </div>
        <div style={{ ...row, borderTop: `1px solid ${T.bd}`, marginTop: 6, paddingTop: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: T.tx3 }}>Total cost / pc</span>
          <span style={{ fontFamily: T.sora, fontSize: 22, fontWeight: 800, color: T.ac2 }}>{money(total)}</span>
        </div>
      </div>

      <div style={card}>
        <div style={row}>
          <span>Selling price{masterPrice ? <span style={{ color: T.tx3, fontSize: 10 }}> · master sheet</span> : ''}</span>
          {masterPrice
            ? <div title="Final price from the master sheet (PRICE EXC GST) — change it there" style={{ ...S.fInput, width: 130, height: 44, fontFamily: T.mono, fontWeight: 700, color: T.gr, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', background: 'oklch(0.72 0.19 145 / .06)', borderColor: 'oklch(0.72 0.19 145 / .3)' }}>{money(masterPrice)}</div>
            : <input id="cost-f-selling" value={sellingPrice ?? ''} onChange={e => onSelling(e.target.value)} onKeyDown={e => numericKeyDown(e)} type="number" min="0" inputMode="decimal" placeholder="₹" aria-label="Selling price"
                style={{ ...S.fInput, width: 130, height: 44, textAlign: 'right', fontFamily: T.mono }} />}
        </div>
        <div style={row}>
          <span>Margin</span>
          {sell > 0
            ? <span style={{ fontFamily: T.mono, fontSize: 14, fontWeight: 700, color: sell - total >= 0 ? T.gr : T.re }}>{money(sell - total)} · {((sell - total) / sell * 100).toFixed(1)}%</span>
            : <span style={{ fontSize: 11, color: T.tx3 }}>enter selling price to see it</span>}
        </div>
      </div>

      <div style={card}>
        <div style={row}>
          <span>Pieces to make</span>
          <input value={pieces} onChange={e => onPieces(e.target.value)} onKeyDown={e => numericKeyDown(e)} type="number" min="1" inputMode="numeric" placeholder="e.g. 48" aria-label="Pieces to make"
            style={{ ...S.fInput, width: 130, height: 44, textAlign: 'right', fontFamily: T.mono }} />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>{PRESETS.map(chip)}</div>
        {pcs > 0
          ? <div style={{ ...row, marginTop: 6, fontSize: 14, fontWeight: 700, color: T.tx }}><span>Total for {pcs} pcs</span><span style={{ fontFamily: T.mono, color: T.gr }}>{money(total * pcs)}</span></div>
          : <div style={{ fontSize: 11, color: T.tx3, marginTop: 8 }}>Needed for the purchase plan and raising POs.</div>}
      </div>
    </div>
  );
}
