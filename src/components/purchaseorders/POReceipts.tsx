// The PO detail's receipts list — what came in, on which date, who keyed
// it in and when — with the per-receipt Undo. Split out of PODetail so
// that file stays under the 200-line limit.
import { T } from '../../lib/theme';
import { fmtWhen } from '../../lib/humanize';
import type { PurchaseOrderItem, PurchaseOrderReceipt } from '../../types/database';
import { itemLabel } from './poItemLabel';

const fmtDate = (d: string | null | undefined) => d ? new Date(d + (d.length <= 10 ? 'T00:00:00' : '')).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export default function POReceipts({ receipts, items, names, canRemove, busy, onRemove }: {
  receipts: PurchaseOrderReceipt[];
  items: PurchaseOrderItem[];
  /** Profile names by id, for `received_by`. */
  names: Record<string, string>;
  canRemove: boolean;
  busy: string;
  onRemove: (r: PurchaseOrderReceipt) => void;
}) {
  if (receipts.length === 0) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Receipts</div>
      {receipts.map(r => {
        const item = items.find(it => it.id === r.po_item_id);
        const who = r.received_by ? names[r.received_by] || 'User' : '';
        return (
          <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '7px 10px', background: T.glass1, border: `1px solid ${T.bd}`, borderRadius: 6, marginBottom: 4, fontSize: 12 }}>
            <div style={{ minWidth: 0 }}>
              <span style={{ color: T.tx }}>{item ? itemLabel(item) : 'Item'}</span> <span style={{ color: T.gr, fontFamily: T.mono }}>+{Number(r.received_qty)}</span>{r.remarks && <span style={{ color: T.tx3, marginLeft: 6 }}>· {r.remarks}</span>}
              {/* The receipt's own date is on the right; this is who keyed it in, and the real moment. */}
              {(who || r.created_at) && <div style={{ fontSize: 10, color: T.tx3, marginTop: 2 }}>{who ? <>by <span style={{ color: T.tx2, fontWeight: 600 }}>{who}</span> · </> : ''}<span style={{ fontFamily: T.mono }}>{fmtWhen(r.created_at)}</span></div>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span style={{ fontSize: 10, color: T.tx3, fontFamily: T.mono }}>{fmtDate(r.receipt_date)}</span>
              {canRemove && <button onClick={() => onRemove(r)} disabled={!!busy} title="Remove this receipt" style={{ border: 'none', background: 'none', color: T.re, cursor: busy ? 'not-allowed' : 'pointer', fontSize: 11, fontWeight: 600, padding: '0 8px', minHeight: 44, opacity: busy ? 0.5 : 0.85 }}>Undo</button>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
