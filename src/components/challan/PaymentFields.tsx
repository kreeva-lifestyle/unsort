// Status · Payment Mode · Amount Paid · Payment Date — the four payment
// boxes of the challan form, with the owner's shortcut: the full amount is
// one action away instead of typed on every challan.
//   - Status → Paid fills Amount Paid with the total (unless a larger amount
//     is already there) and dates the payment today when the date is empty;
//   - the FULL chip inside Amount Paid does the same from any status.
// A typed amount is never overwritten by the status change; the chip is an
// explicit tap, so it always sets the total.
import { T } from '../../lib/theme';
import { numericKeyDown } from '../../lib/numericInput';
import DateInput from '../ui/DateInput';

export const PAYMENT_MODES = ['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Card', 'Other'];

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export default function PaymentFields({ status, setStatus, mode, setMode, amount, setAmount, date, setDate, total, lbl, inp }: {
  status: string; setStatus: (v: string) => void;
  mode: string; setMode: (v: string) => void;
  amount: number; setAmount: (v: number) => void;
  date: string; setDate: (v: string) => void;
  total: number;
  lbl: React.CSSProperties; inp: React.CSSProperties;
}) {
  const fillFull = () => {
    setAmount(total);
    setStatus('paid');
    if (!date) setDate(today());
    if (mode === 'Return Credit') setMode('');
  };
  const onStatus = (v: string) => {
    setStatus(v);
    if (v === 'paid' && amount < total) { setAmount(total); if (!date) setDate(today()); }
  };
  const canFill = total > 0 && amount !== total;

  // 2×2 at every width (the form is 520px wide at most: four-across left
  // ~115px per box, the date overflowing and the amount squeezed). minmax(0,
  // 1fr) keeps the two columns EQUAL — a plain 1fr honours each box's
  // minimum content width, which is what made the columns uneven.
  return (
    <div className="challan-form-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px 12px' }}>
      <div>
        <label style={lbl}>Status</label>
        <select value={status} onChange={e => onStatus(e.target.value)} style={{ ...inp, fontSize: 11 }}>
          <option value="unpaid">Unpaid</option>
          <option value="paid">Paid</option>
          <option value="partial">Partial</option>
        </select>
      </div>
      <div>
        <label style={lbl}>Payment Mode</label>
        <select value={mode} onChange={e => setMode(e.target.value)} style={{ ...inp, fontSize: 11 }}>
          <option value="">Select...</option>
          {mode && !PAYMENT_MODES.includes(mode) && <option value={mode} disabled>{mode}</option>}
          {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <div>
        <label style={lbl}>Amount Paid</label>
        <div style={{ position: 'relative' }}>
          <input type="number" min="0" value={amount || ''} onKeyDown={e => numericKeyDown(e)} onChange={e => setAmount(Math.max(0, Number(e.target.value)))}
            placeholder="Amount" style={{ ...inp, fontFamily: T.mono, fontSize: 11, paddingRight: canFill ? 56 : undefined }} />
          {/* Sits inside the box like a wallet's MAX button: the whole input
              height is the tap target, and it disappears once the amount IS
              the total, so a settled challan shows a plain field. */}
          {canFill && (
            <button type="button" onClick={fillFull} title={`Full amount — ₹${total.toLocaleString('en-IN')}`} aria-label={`Fill the full amount, ₹${total.toLocaleString('en-IN')}`}
              style={{ position: 'absolute', right: 4, top: 4, bottom: 4, padding: '0 8px', borderRadius: 6, border: `1px solid ${T.ac33}`, background: T.ac3, color: T.ac2, fontSize: 10, fontWeight: 700, letterSpacing: '.06em', cursor: 'pointer', fontFamily: T.sans }}>
              FULL
            </button>
          )}
        </div>
      </div>
      <div>
        <label style={lbl}>Payment Date</label>
        <DateInput value={date} onChange={e => setDate(e.target.value)} style={{ width: '100%' }} />
      </div>
    </div>
  );
}
