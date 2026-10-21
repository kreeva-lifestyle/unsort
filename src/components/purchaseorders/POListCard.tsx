// One order in the PO list, as the Motion Lab 06 card (the same PORailCard
// the detail opens with): "FABRIC · 24 SEPT" / "PO #87 · Vendor" / pcs and
// the first line, the status pill with the total under it, the full rail
// with its stop names and "12 / 20" under Received, and under a hairline the
// latest event with how long it has been pending (and how late). The whole
// card opens the order; on a desktop a print button sits at the end of the
// caption (phones swipe the card for Print). When a refresh moves an order
// on, its light travels here too.
import { useMemo } from 'react';
import { T } from '../../lib/theme';
import { PO_TYPE_LABELS } from '../../types/database';
import PORailCard from './PORailCard';
import { PendingSince } from './poListParts';
import type { PORow } from './POList';

const day = (d: string | null) => (d ? new Date(d.length <= 10 ? `${d}T00:00:00` : d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : null);

export default function POListCard({ po, statusColors, onOpen, onPrint }: {
  po: PORow; statusColors: Record<string, { bg: string; color: string }>;
  onOpen: () => void; /** Desktop only: phones print from the swipe action. */ onPrint?: () => void;
}) {
  const items = useMemo(() => po.purchase_order_items ?? [], [po.purchase_order_items]);
  const shown = useMemo(() => ({ po, items, receipts: [] }), [po, items]);
  const eyebrow = [PO_TYPE_LABELS[po.po_type] || po.po_type, day(po.po_date ?? po.created_at), po.lump_sum ? 'lump sum' : null].filter(Boolean).join(' · ');
  const total = <span style={{ fontFamily: T.mono, fontSize: 15, fontWeight: 700, color: T.tx, whiteSpace: 'nowrap' }}>₹{Number(po.grand_total || 0).toLocaleString('en-IN')}</span>;
  const right = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <PendingSince po={po} inline />
      {onPrint && (
        <button type="button" onClick={e => { e.stopPropagation(); onPrint(); }} title="Print" aria-label={`Print PO #${po.po_number}`}
          style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 6, margin: '-6px -6px -6px 2px', opacity: 0.6, display: 'inline-flex' }}>
          <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'none', stroke: T.tx2, strokeWidth: 2 }}><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z" /></svg>
        </button>
      )}
    </span>
  );
  return <PORailCard po={po} items={items} shown={shown} audit={null} names={null} statusColors={statusColors} eyebrow={eyebrow} aside={total} right={right} onOpen={onOpen} />;
}
