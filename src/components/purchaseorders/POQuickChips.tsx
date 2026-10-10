// The summary's quick slices (an open-orders / waiting tile, a vendor bar)
// shown above the list as chips, each one a tap to clear. Split out of
// pages/PurchaseOrders.tsx so the page stays under the 200-line limit.
import { T, S } from '../../lib/theme';
import { QUICK_LABELS, type PoQuick } from './usePoList';

export default function POQuickChips({ quick, vendor, onClearQuick, onClearVendor }: {
  quick: PoQuick; vendor: string; onClearQuick: () => void; onClearVendor: () => void;
}) {
  if (!quick && !vendor) return null;
  const chip = (label: string, aria: string, clear: () => void) => (
    <button key={label} type="button" onClick={clear} aria-label={aria}
      style={{ ...S.btnGhost, ...S.btnSm, minHeight: 32, borderRadius: 999, padding: '5px 14px', fontSize: 11, borderColor: T.ac, color: T.ac2, background: T.ac3, display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: 260 }}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span><span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>&#215;</span>
    </button>
  );
  return (
    <div className="po-chips" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
      <span style={{ fontSize: 11, color: T.tx3 }}>Showing</span>
      {quick && chip(QUICK_LABELS[quick], `Showing ${QUICK_LABELS[quick].toLowerCase()} — tap to show every order`, onClearQuick)}
      {vendor && chip(vendor, `Showing ${vendor} only — tap to show every vendor`, onClearVendor)}
    </div>
  );
}
