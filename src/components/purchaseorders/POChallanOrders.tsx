// One vendor's open orders on the "Receive a challan" sheet (split out of
// POReceiveChallan, which stays under the 200-line limit). Before an order is
// ticked it shows what is on it — fabric, code, the design and what it is
// for, with how much is still to come — so the right orders are picked off
// the challan (owner's pick, 27 Nov 2026: the card only said "175 m to
// come"). A tick opens each line with what is still to come filled in,
// editable.
import { T, S } from '../../lib/theme';
import { numericKeyDown } from '../../lib/numericInput';
import { itemLabel, lineNote } from './poItemLabel';
import { fmtQty, unitOf } from './poStats';
import { shortDate } from './POHeaderInfo';
import { STATUS_DOT } from './poSections';
import type { PurchaseOrder, PurchaseOrderItem } from '../../types/database';

export type Line = Pick<PurchaseOrderItem, 'id' | 'item_name' | 'fabric_code' | 'sku' | 'component' | 'unit' | 'quantity' | 'received_qty' | 'cancelled_at' | 'sort_order'>;
export type OpenPo = Pick<PurchaseOrder, 'id' | 'po_number' | 'po_date' | 'status' | 'vendor_id' | 'vendor_name'> & { purchase_order_items: Line[] };
export const CHALLAN_COLS = 'id, po_number, po_date, status, vendor_id, vendor_name, purchase_order_items(id, item_name, fabric_code, sku, component, unit, quantity, received_qty, cancelled_at, sort_order)';
export const n = (v: unknown) => Number(v || 0);
export const left = (l: Line) => Math.max(0, n(l.quantity) - n(l.received_qty));
export const live = (po: OpenPo) => po.purchase_order_items.filter(l => !l.cancelled_at).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
/** An order's lines shown before it is ticked; the rest are counted. */
const PREVIEW = 4;
const clip: React.CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

export default function POChallanOrders({ pos, ticked, qty, onTick, onQty, onEnter }: {
  pos: OpenPo[];
  ticked: Set<string>;
  /** What arrived now, typed per line id. */
  qty: Record<string, string>;
  onTick: (po: OpenPo) => void;
  onQty: (lineId: string, v: string) => void;
  /** Enter in a quantity box confirms the receipt. */
  onEnter: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
      {pos.map(po => {
        const on = ticked.has(po.id), st = STATUS_DOT[po.status];
        const due = live(po).filter(l => left(l) > 0);
        const units = new Set(due.map(l => unitOf(l.unit)));
        return (
          <div key={po.id} style={{ border: `1px solid ${on ? T.ac3 : T.bd}`, borderRadius: 10, background: on ? T.glass2 : T.glass1 }}>
            {/* The whole card is the tick while it is closed: head and the lines under it. */}
            <label style={{ display: 'block', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '2px 10px', padding: '10px 12px', minHeight: 44 }}>
                <input type="checkbox" checked={on} onChange={() => onTick(po)} style={{ accentColor: T.ac, width: 16, height: 16, margin: 0 }} />
                <span style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 700, color: T.tx }}>PO #{po.po_number}</span>
                <span style={{ fontSize: 11, color: T.tx3 }}>{shortDate(po.po_date)}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: st.color }}><span style={{ width: 8, height: 8, borderRadius: 999, background: st.color }} />{st.label}</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: T.tx3 }}>{units.size === 1 ? `${fmtQty(due.reduce((t, l) => t + left(l), 0))} ${[...units][0]} to come` : `${due.length} items to come`}</span>
              </div>
              {!on && due.slice(0, PREVIEW).map(l => (
                <div key={l.id} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '0 12px 8px 38px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: T.tx, ...clip }}>{itemLabel(l)}</div>
                    {lineNote(l) && <div style={{ fontSize: 11, color: T.tx3, marginTop: 1, ...clip }}>{lineNote(l)}</div>}
                  </div>
                  <span style={{ fontFamily: T.mono, fontSize: 11, color: T.tx2, whiteSpace: 'nowrap' }}>{fmtQty(left(l))} {unitOf(l.unit)}</span>
                </div>
              ))}
              {!on && due.length > PREVIEW && <div style={{ fontSize: 11, color: T.tx3, padding: '0 12px 8px 38px' }}>+{due.length - PREVIEW} more</div>}
            </label>
            {on && live(po).map(l => (
              <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderTop: `1px solid ${T.bd}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: T.tx, ...clip }}>{itemLabel(l)}</div>
                  {lineNote(l) && <div style={{ fontSize: 11, color: T.tx2, marginTop: 1, ...clip }}>{lineNote(l)}</div>}
                  <div style={{ fontSize: 10, color: T.tx3, fontFamily: T.mono, marginTop: 2 }}>Ordered {fmtQty(n(l.quantity))} {unitOf(l.unit)} · Received {fmtQty(n(l.received_qty))} · <span style={{ color: left(l) > 0 ? T.yl : T.gr }}>Remaining {fmtQty(left(l))}</span></div>
                </div>
                <input value={qty[l.id] ?? ''} onChange={e => onQty(l.id, e.target.value)} onKeyDown={e => { numericKeyDown(e); if (e.key === 'Enter') onEnter(); }}
                  inputMode="decimal" placeholder="0" aria-label={`Received now — ${itemLabel(l)}`} style={{ ...S.fInput, width: 84, fontFamily: T.mono, textAlign: 'right' }} />
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
