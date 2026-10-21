// The foot of the PO form: the optional discount / tax / charges, the notes
// and the live total. Split out of POForm so that file stays under the
// 200-line limit; the form owns the state.
import { T, S } from '../../lib/theme';
import { numericKeyDown } from '../../lib/numericInput';

export interface Charges { discountType: 'flat' | 'percentage'; discountValue: string; taxPercent: string; otherCharges: string }

export default function POFormCharges({ show, onToggle, charges, onCharges, notes, onNotes, totals }: {
  show: boolean; onToggle: () => void;
  charges: Charges; onCharges: (patch: Partial<Charges>) => void;
  notes: string; onNotes: (v: string) => void;
  totals: { subtotal: number; discAmt: number; taxAmt: number; other: number; grand: number };
}) {
  const line = (label: string, value: string) => <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.tx3 }}><span>{label}</span><span style={{ fontFamily: T.mono }}>{value}</span></div>;
  return (
    <>
      <div style={{ marginTop: 14, borderTop: `1px solid ${T.bd}`, paddingTop: 12 }}>
        <button onClick={onToggle} style={{ border: 'none', background: 'none', color: T.tx3, fontSize: 11, cursor: 'pointer', padding: 0 }}>{show ? '− Hide' : '+ Add'} discount / tax / charges</button>
        {show && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginTop: 10 }}>
            <div>
              <label style={S.fLabel}>Discount</label>
              <div style={{ display: 'flex', gap: 4 }}>
                <input value={charges.discountValue} onChange={e => onCharges({ discountValue: e.target.value })} onKeyDown={e => numericKeyDown(e)} inputMode="decimal" placeholder="0" style={{ ...S.fInput, flex: 1, fontFamily: T.mono }} />
                <select value={charges.discountType} onChange={e => onCharges({ discountType: e.target.value as Charges['discountType'] })} style={{ ...S.fInput, width: 56, padding: '8px 6px' }}><option value="flat">₹</option><option value="percentage">%</option></select>
              </div>
            </div>
            <div><label style={S.fLabel}>Tax %</label><input value={charges.taxPercent} onChange={e => onCharges({ taxPercent: e.target.value })} onKeyDown={e => numericKeyDown(e)} inputMode="decimal" placeholder="0" style={{ ...S.fInput, fontFamily: T.mono }} /></div>
            <div><label style={S.fLabel}>Other charges</label><input value={charges.otherCharges} onChange={e => onCharges({ otherCharges: e.target.value })} onKeyDown={e => numericKeyDown(e)} inputMode="decimal" placeholder="0" style={{ ...S.fInput, fontFamily: T.mono }} /></div>
          </div>
        )}
      </div>

      <div>
        <label style={{ ...S.fLabel, marginTop: 12, display: 'block' }}>Notes</label>
        <textarea value={notes} onChange={e => onNotes(e.target.value)} rows={2} placeholder="Optional notes for this order…" style={{ ...S.fInput, width: '100%', height: 'auto', resize: 'vertical', fontFamily: T.sans }} />
      </div>

      <div style={{ marginTop: 14, padding: '12px 14px', background: T.glass1, border: `1px solid ${T.bd}`, borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {line('Subtotal', `₹${totals.subtotal.toLocaleString('en-IN')}`)}
        {show && totals.discAmt > 0 && line('Discount', `−₹${totals.discAmt.toLocaleString('en-IN')}`)}
        {show && totals.taxAmt > 0 && line('Tax', `₹${totals.taxAmt.toLocaleString('en-IN')}`)}
        {show && totals.other > 0 && line('Other charges', `₹${totals.other.toLocaleString('en-IN')}`)}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700, color: T.tx, borderTop: `1px solid ${T.bd}`, paddingTop: 6, marginTop: 2 }}><span>Grand Total</span><span style={{ fontFamily: T.mono }}>₹{totals.grand.toLocaleString('en-IN')}</span></div>
      </div>
    </>
  );
}
