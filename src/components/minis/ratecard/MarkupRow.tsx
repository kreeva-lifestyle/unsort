// Optional seller markup control. Shown as soon as rows exist — a markup that
// only appears once a price column happens to be picked is undiscoverable — and
// disabled with an explanation when the sheet has no price column.
import { S, T } from '../../../lib/theme';
import { numericKeyDown } from '../../../lib/numericInput';

export default function MarkupRow({ noPrice, kind, value, mode, onKind, onValue }: {
  noPrice: boolean;
  kind: 'pct' | 'flat';
  value: string;
  mode: 'import' | 'manual' | 'master';
  onKind: (k: 'pct' | 'flat') => void;
  onValue: (v: string) => void;
}) {
  const kindBtn = (k: 'pct' | 'flat', label: string) => (
    <button disabled={noPrice} onClick={() => onKind(k)}
      style={{ ...(kind === k ? { ...S.btnPrimary, ...S.btnSm } : { ...S.btnGhost, ...S.btnSm }), minHeight: 36, pointerEvents: noPrice ? 'none' as const : 'auto' as const }}>{label}</button>
  );
  return (
    <div style={{ marginBottom: 10, opacity: noPrice ? 0.55 : 1 }}>
      <label style={S.fLabel}>Seller Markup <span style={{ fontWeight: 400, textTransform: 'none' as const, letterSpacing: 0 }}>(optional)</span></label>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {kindBtn('pct', '%')}
        {kindBtn('flat', '₹')}
        <input type="number" min={0} value={value} onKeyDown={e => numericKeyDown(e)} disabled={noPrice}
          onChange={e => onValue(e.target.value)}
          placeholder={noPrice ? 'Needs a price column' : kind === 'pct' ? 'e.g. 10 = +10% on every price' : 'e.g. 200 = +₹200 on every price'}
          style={{ ...S.fInput, flex: 1 }} />
        {value && !noPrice && <button onClick={() => onValue('')} title="Clear markup" aria-label="Clear markup" style={{ ...S.btnGhost, ...S.btnSm, minHeight: 36 }}>&#215;</button>}
      </div>
      <div style={{ fontSize: 10, color: T.tx3, marginTop: 4, lineHeight: 1.5 }}>
        {noPrice
          ? (mode === 'master' ? 'Tick a price column above to add a markup.' : 'Add a PRICE column to add a markup.')
          : 'Leave empty to use the listed rates. With a markup, GST slabs and totals are re-worked on the marked-up prices.'}
      </div>
    </div>
  );
}
