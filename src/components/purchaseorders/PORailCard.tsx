// The purchase order's hero card (Motion Lab 06): "PURCHASE ORDER" /
// "PO #87 · Vendor" / what it is for, the status pill on the right, the
// pipeline rail, and under a hairline the latest thing that happened to
// the order with who did it — "Received 20 of 20 · 26 Sep, 03:40 pm" /
// "Owner". The pill and the caption roll when the order moves on, in step
// with the light on the rail.
import { fmtWhen } from '../../lib/humanize';
import Roll from '../ui/Roll';
import PORail, { railState } from './PORail';
import { shortDate } from './POHeaderInfo';
import { itemLabel } from './poItemLabel';
import { fmtQty } from './poStats';
import { PO_STATUS_LABELS } from '../../types/database';
import type { PurchaseOrder, PurchaseOrderItem, PurchaseOrderReceipt, AuditLog } from '../../types/database';

const n = (v: unknown) => Number(v || 0);

/** "20 of 20" when every line shares a unit (metres and pieces are never
 *  added together); otherwise the share, "64%", and `mixed` is set. */
export function receivedOf(items: Pick<PurchaseOrderItem, 'quantity' | 'received_qty' | 'unit'>[]): { got: number; ordered: number; text: string; mixed: boolean } {
  const ordered = items.reduce((t, it) => t + n(it.quantity), 0);
  const got = items.reduce((t, it) => t + Math.min(n(it.received_qty), n(it.quantity)), 0);
  const mixed = new Set(items.map(it => (it.unit || '').trim().toLowerCase())).size > 1;
  const text = !mixed ? `${fmtQty(got)} of ${fmtQty(ordered)}` : `${ordered > 0 ? Math.round(got / ordered * 100) : 0}%`;
  return { got, ordered, text, mixed };
}

/** The latest thing that happened to the order, and who did it. */
export function latestEvent(po: PurchaseOrder, items: PurchaseOrderItem[], receipts: PurchaseOrderReceipt[], audit: AuditLog[] | null | 'error', names: Record<string, string> | null): { text: string; who: string } {
  const name = (id: string | null) => (id && names ? names[id] || 'Unknown user' : '');
  const r = receivedOf(items);
  const last = receipts[0];                                     // newest first
  switch (po.status) {
    case 'cancelled': return { text: `Cancelled · ${fmtWhen(po.cancelled_at)}`, who: name(po.cancelled_by) };
    case 'closed': return { text: `Closed${r.got > 0 ? ` at ${r.text}` : ''} · ${fmtWhen(po.closed_at)}`, who: name(po.closed_by) };
    case 'completed': return { text: `Received ${r.text} · ${fmtWhen(last?.created_at)}`, who: name(last?.received_by ?? null) };
    case 'partially_received': return { text: `Received ${r.text}${r.mixed ? '' : ` · ${fmtQty(r.ordered - r.got)} still due`}`, who: name(last?.received_by ?? null) };
    case 'sent': {
      const row = Array.isArray(audit) ? audit.find(a => a.action === 'SENT') : null;
      return { text: `Sent to ${po.vendor_name}${row ? ` · ${fmtWhen(row.created_at)}` : ''}`, who: row?.user_email || '' };
    }
    case 'approved': return { text: `Approved · ${fmtWhen(po.approved_at)}`, who: name(po.approved_by) };
    default: return { text: `Created · ${fmtWhen(po.created_at)}`, who: name(po.created_by) };
  }
}

export default function PORailCard({ po, items, receipts, audit, names, statusColors }: {
  po: PurchaseOrder; items: PurchaseOrderItem[]; receipts: PurchaseOrderReceipt[];
  audit: AuditLog[] | null | 'error'; names: Record<string, string> | null;
  statusColors: Record<string, { bg: string; color: string }>;
}) {
  const sc = statusColors[po.status] || statusColors.draft;
  const state = railState(po, items, audit);
  const ev = latestEvent(po, items, receipts, audit, names);
  const got = receivedOf(items);
  const sub = [po.for_pieces ? `${po.for_pieces} pcs` : null, items[0] ? `${itemLabel(items[0])}${items.length > 1 ? `, +${items.length - 1} more` : ''}` : null].filter(Boolean).join(' · ');
  const sentAt = Array.isArray(audit) ? audit.find(a => a.action === 'SENT')?.created_at : null;
  return (
    <div className="po-card">
      <div className="po-card-h">
        <div style={{ minWidth: 0 }}>
          <div className="po-card-k">Purchase order</div>
          <b>PO #{po.po_number} · {po.vendor_name}</b>
          {sub && <div className="po-card-sub">{sub}</div>}
        </div>
        <span className="po-card-pill" style={{ background: sc.bg, color: sc.color }}><i style={{ background: sc.color }} /><Roll text={PO_STATUS_LABELS[po.status] || po.status} /></span>
      </div>
      <PORail state={state} dates={[shortDate(po.po_date ?? po.created_at), shortDate(po.approved_at), shortDate(sentAt), null]}
        qty={got.got > 0 || state.stage === 3 ? got.text.replace(' of ', ' / ') : null} />
      <div className="po-card-cap">
        {/* The trail landing only completes the caption (the Sent time): adopted silently, no roll. */}
        <Roll text={ev.text} baseline={state.ready} />
        <span className="who" title={ev.who || undefined}>{ev.who || (names === null && po.created_by ? '…' : '')}</span>
      </div>
    </div>
  );
}
