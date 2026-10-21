// The purchase order's hero card (Motion Lab 06): "PURCHASE ORDER" /
// "PO #87 · Vendor" / what it is for, the status pill on the right, the
// pipeline rail, and under a hairline the latest thing that happened to
// the order with who did it — "Received 20 of 20 · 26 Sep, 03:40 pm" /
// "Owner". When the order moves on, the pill and the caption hold the old
// stage while the light travels (`shown`, from useLandedOrder) and roll the
// moment it lands, together with the stop's pulse.
import { fmtWhen } from '../../lib/humanize';
import Roll from '../ui/Roll';
import PORail, { railState } from './PORail';
import { itemLabel } from './poItemLabel';
import { fmtQty } from './poStats';
import { PO_STATUS_LABELS } from '../../types/database';
import type { PurchaseOrder, PurchaseOrderItem, PurchaseOrderReceipt, AuditLog } from '../../types/database';

const n = (v: unknown) => Number(v || 0);
/** What the card reads from a line — the list's embed carries no more. */
export type CardLine = Pick<PurchaseOrderItem, 'item_name' | 'fabric_code' | 'quantity' | 'received_qty' | 'unit'>;
export interface CardView { po: PurchaseOrder; items: CardLine[]; receipts: PurchaseOrderReceipt[] }
// " · 26 Sep, 03:40 pm" — nothing when the time is not known.
const at = (iso: string | null | undefined) => (iso ? ` · ${fmtWhen(iso)}` : '');

/** "20 of 20" when every line shares a unit (metres and pieces are never
 *  added together); otherwise the share, "64%", and `mixed` is set. */
export function receivedOf(items: Pick<PurchaseOrderItem, 'quantity' | 'received_qty' | 'unit'>[]): { got: number; ordered: number; text: string; mixed: boolean } {
  const ordered = items.reduce((t, it) => t + n(it.quantity), 0);
  const got = items.reduce((t, it) => t + Math.min(n(it.received_qty), n(it.quantity)), 0);
  const mixed = new Set(items.map(it => (it.unit || '').trim().toLowerCase())).size > 1;
  const text = !mixed ? `${fmtQty(got)} of ${fmtQty(ordered)}` : `${ordered > 0 ? Math.round(got / ordered * 100) : 0}%`;
  return { got, ordered, text, mixed };
}

// The hero pill names the last stop the way the rail does.
const PILL_LABEL: Partial<Record<PurchaseOrder['status'], string>> = { completed: 'Received' };

/** The latest thing that happened to the order, and who did it. */
export function latestEvent(po: PurchaseOrder, items: CardLine[], receipts: PurchaseOrderReceipt[], audit: AuditLog[] | null | 'error', names: Record<string, string> | null, skippedSent = false): { text: string; who: string } {
  const name = (id: string | null) => (id && names ? names[id] || 'Unknown user' : '');
  const r = receivedOf(items);
  const last = receipts[0];                                     // newest first
  switch (po.status) {
    case 'cancelled': return { text: `Cancelled${at(po.cancelled_at)}`, who: name(po.cancelled_by) };
    case 'closed': return { text: `Closed${r.got > 0 ? ` at ${r.text}` : ''}${at(po.closed_at)}`, who: name(po.closed_by) };
    case 'completed': return { text: `Received ${r.text}${skippedSent ? ' · Sent was skipped' : at(last?.created_at)}`, who: name(last?.received_by ?? null) };
    case 'partially_received': return { text: `Received ${r.text}${r.mixed ? '' : ` · ${fmtQty(r.ordered - r.got)} still due`}`, who: name(last?.received_by ?? null) };
    case 'sent': {
      const row = Array.isArray(audit) ? audit.find(a => a.action === 'SENT') : null;
      return { text: `Sent to ${po.vendor_name}${at(row?.created_at)}`, who: row?.user_email || '' };
    }
    case 'approved': return { text: `Approved${at(po.approved_at)}`, who: name(po.approved_by) };
    default: return { text: `Created${at(po.created_at)}`, who: name(po.created_by) };
  }
}

export default function PORailCard({ po, items, shown, audit, names, statusColors, onLanded }: {
  /** The live order: the rail follows it (and travels when it moves on). */
  po: PurchaseOrder; items: CardLine[];
  /** The order as the rest of the card shows it — the old one until the rail lands. */
  shown: CardView;
  audit: AuditLog[] | null | 'error'; names: Record<string, string> | null;
  statusColors: Record<string, { bg: string; color: string }>;
  /** The new stage is on screen (the light landed, or nothing had to travel). */
  onLanded?: () => void;
}) {
  const sc = statusColors[shown.po.status] || statusColors.draft;
  const state = railState(po, items, audit);
  const shownState = railState(shown.po, shown.items, audit);
  const got = receivedOf(shown.items);
  const ev = latestEvent(shown.po, shown.items, shown.receipts, audit, names, shownState.skippedSent);
  const sub = [po.for_pieces ? `${po.for_pieces} pcs` : null, items[0] ? `${itemLabel(items[0])}${items.length > 1 ? `, +${items.length - 1} more` : ''}` : null].filter(Boolean).join(' · ');
  const title = `PO #${po.po_number} · ${po.vendor_name}`;
  return (
    <div className="po-card">
      <div className="po-card-h">
        <div style={{ minWidth: 0 }}>
          <div className="po-card-k">Purchase order</div>
          <b>{title}</b>
          {sub && <div className="po-card-sub">{sub}</div>}
        </div>
        <div className="po-card-side">
          <span className="po-card-pill" style={{ background: sc.bg, color: sc.color }}><i /><Roll text={PILL_LABEL[shown.po.status] || PO_STATUS_LABELS[shown.po.status] || shown.po.status} /></span>
        </div>
      </div>
      <PORail state={state} onLanded={onLanded}
        qty={got.got > 0 || shownState.stage === 3 ? got.text.replace(' of ', ' / ') : null} />
      <div className="po-card-cap">
        {/* A trail arriving only completes the caption (the Sent time): adopted silently, no roll. */}
        <Roll text={ev.text} baseline={Array.isArray(audit) ? audit : 'none'} />
        <span className="who" title={ev.who || undefined}>{ev.who || (names === null && shown.po.created_by ? '…' : '')}</span>
      </div>
    </div>
  );
}
