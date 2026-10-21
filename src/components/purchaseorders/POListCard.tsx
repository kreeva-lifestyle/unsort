// One order in the PO list, as the Motion Lab 06 card (the same PORailCard
// the detail opens with): "FABRIC · 24 SEPT" / "PO #87 · Vendor" / for how
// many pcs, the first line's SKU and name and how many more (owner's ask:
// what's on the PO at a glance, and why a SKU search matched), the status
// pill with the total under it, the full rail with its stop names and
// "12 / 20" under Received, and under a hairline the latest event with how
// long it has been pending, or how late. The title opens the order (its
// button covers the card); on a desktop a print button ends the caption
// (phones swipe the card for Print). When a refresh moves an order on, its
// light travels here too, and the pill and caption change when it lands.
import { useMemo } from 'react';
import { T } from '../../lib/theme';
import { PO_TYPE_LABELS, type PurchaseOrderReceipt } from '../../types/database';
import PORailCard from './PORailCard';
import { itemLabel } from './poItemLabel';
import { fmtQty } from './poStats';
import { PendingSince } from './poListParts';
import { useLandedOrder } from './useLandedOrder';
import type { PORow } from './POList';

const DAY = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' });
const day = (d: string | null) => (d ? DAY.format(new Date(d.length <= 10 ? `${d}T00:00:00` : d)) : null);
const NO_LINES: NonNullable<PORow['purchase_order_items']> = [];
const NO_RECEIPTS: PurchaseOrderReceipt[] = [];

export default function POListCard({ po, statusColors, onOpen, onPrint }: {
  po: PORow; statusColors: Record<string, { bg: string; color: string }>;
  onOpen: () => void; /** Desktop only: phones print from the swipe action. */ onPrint?: () => void;
}) {
  const items = po.purchase_order_items ?? NO_LINES;
  const live = useMemo(() => ({ po, items, receipts: NO_RECEIPTS }), [po, items]);
  const { shown, land } = useLandedOrder(live, null);
  const first = items[0], sku = (first?.sku || '').trim();
  const sub = (
    <>
      {po.for_pieces ? `for ${fmtQty(po.for_pieces)} pcs · ` : null}
      {sku && <><span style={{ fontFamily: T.mono }}>{sku}</span> · </>}
      {first ? itemLabel({ item_name: (first.item_name || '').trim() || 'item', fabric_code: first.fabric_code }) : '—'}
      {items.length > 1 && `, +${items.length - 1} more`}
    </>
  );
  const list = {
    eyebrow: [PO_TYPE_LABELS[po.po_type] || po.po_type, day(po.po_date ?? po.created_at), po.lump_sum ? 'lump sum' : null].filter(Boolean).join(' · '),
    sub,
    aside: <span style={{ fontFamily: T.mono, fontSize: 15, fontWeight: 700, color: T.tx, whiteSpace: 'nowrap' }}>₹{Number(po.grand_total || 0).toLocaleString('en-IN')}</span>,
    right: <>
      <PendingSince po={po} />
      {onPrint && (
        <button type="button" className="po-card-print" onClick={onPrint} title="Print" aria-label={`Print PO #${po.po_number}`}>
          <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'none', stroke: T.tx2, strokeWidth: 2 }}><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z" /></svg>
        </button>
      )}
    </>,
    onOpen,
  };
  return <PORailCard po={po} items={items} shown={shown} audit={null} names={null} statusColors={statusColors} onLanded={land} list={list} />;
}
