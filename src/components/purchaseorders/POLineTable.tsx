// The PO detail's line table: ordered, received, still to come, rate and
// amount for each line, and — on an open order with more than one line —
// "Cancel" on a line whose balance is not coming (owner's ask: cancel one
// fabric, keep the rest). A cancelled line stays on the order, marked
// cancelled with its reason: what arrived on it stands, the balance is gone.
// Split out of PODetail so that file stays under the 200-line limit.
import { T, S } from '../../lib/theme';
import { itemLabel } from './poItemLabel';
import { fmtQty } from './poStats';
import type { PurchaseOrderItem } from '../../types/database';

const inr = (n: unknown) => Number(n || 0).toLocaleString('en-IN');
const n = (v: unknown) => Number(v || 0);

export default function POLineTable({ items, canCancel, busy, onCancel }: {
  items: PurchaseOrderItem[];
  /** The order is open and the user may cancel a line (admin / manager). */
  canCancel: boolean;
  busy: boolean;
  onCancel: (it: PurchaseOrderItem) => void;
}) {
  // The last live line is never cancelled on its own — that is Cancel PO / Close remaining.
  const live = items.filter(it => !it.cancelled_at).length;
  const action = canCancel && live > 1;
  const num: React.CSSProperties = { ...S.tdStyle, textAlign: 'right', fontFamily: T.mono };
  return (
    <div style={{ border: `1px solid ${T.bd}`, borderRadius: 10, overflow: 'hidden', marginBottom: 14 }}>
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: action ? 560 : 480 }}>
          <thead><tr style={{ borderBottom: `1px solid ${T.bd}` }}>
            <th style={S.thStyle}>Item</th><th style={{ ...S.thStyle, textAlign: 'right' }}>Ordered</th><th style={{ ...S.thStyle, textAlign: 'right' }}>Received</th>
            <th style={{ ...S.thStyle, textAlign: 'right' }}>Remaining</th><th style={{ ...S.thStyle, textAlign: 'right' }}>Rate</th><th style={{ ...S.thStyle, textAlign: 'right' }}>Amount</th>
            {action && <th style={S.thStyle} aria-label="Actions" />}
          </tr></thead>
          <tbody>
            {items.map(it => {
              const cancelled = !!it.cancelled_at;
              const got = n(it.received_qty), qty = n(it.quantity);
              const rem = Math.max(0, qty - got);
              return (
                <tr key={it.id} style={{ borderBottom: `1px solid ${T.bd}` }}>
                  <td style={S.tdStyle}>
                    <span style={{ fontSize: 13, color: cancelled ? T.tx3 : T.tx, textDecoration: cancelled && got === 0 ? 'line-through' : undefined }}>{itemLabel(it)}</span>
                    {it.unit && <span style={{ fontSize: 10, color: T.tx3, marginLeft: 4 }}>/{it.unit}</span>}
                    {it.sku && <div style={{ fontSize: 10, color: T.tx3, fontFamily: T.mono, marginTop: 1 }}>{it.sku}</div>}
                    {cancelled && (
                      <div style={{ fontSize: 11, color: T.re, marginTop: 3 }}>
                        Cancelled {fmtQty(n(it.cancelled_qty))}{got > 0 ? ' (the balance)' : ''}{it.cancel_reason ? <span style={{ color: T.tx3 }}> · {it.cancel_reason}</span> : null}
                      </div>
                    )}
                  </td>
                  {/* A cancelled line shows what was ordered before the cancel. */}
                  <td style={num}>{fmtQty(cancelled ? qty + n(it.cancelled_qty) : qty)}</td>
                  <td style={{ ...num, color: got > 0 ? T.gr : T.tx3 }}>{fmtQty(got)}{got > qty && !cancelled && <span style={{ color: T.yl, fontSize: 10, marginLeft: 4 }}>+{fmtQty(got - qty)}</span>}</td>
                  <td style={{ ...num, color: rem > 0 ? T.yl : T.tx3 }}>{cancelled ? '—' : fmtQty(rem)}</td>
                  <td style={{ ...num, color: T.tx3 }}>{it.rate == null ? '—' : `₹${inr(it.rate)}`}</td>
                  <td style={num}>{it.amount == null ? '—' : `₹${inr(it.amount)}`}</td>
                  {action && (
                    <td style={{ ...S.tdStyle, padding: '0 8px', textAlign: 'right' }}>
                      {!cancelled && rem > 0 && (
                        <button type="button" onClick={() => onCancel(it)} disabled={busy} title="This item is not coming — cancel its balance"
                          style={{ border: 'none', background: 'none', color: T.re, cursor: busy ? 'not-allowed' : 'pointer', fontSize: 11, fontWeight: 600, padding: '0 6px', minHeight: 44, opacity: busy ? 0.5 : 0.85 }}>
                          Cancel
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
