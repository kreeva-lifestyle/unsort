// The pieces one PO row is made of, shared by the desktop table
// (POListTable) and the phone cards (POListCards) so both read alike, as
// Jobwork's do: the first line's SKU photo, "DRS187 · PO #111" and the item,
// received of ordered, the PO date and due date with how late, and the total.
import { T } from '../../lib/theme';
import SkuThumb from '../ui/SkuThumb';
import { PO_TYPE_LABELS } from '../../types/database';
import { itemLabel } from './poItemLabel';
import { fmtQty } from './poStats';
import type { RowView, Section, UnitQty } from './poSections';
import UrgentPill from '../ui/UrgentPill';

const DAY = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' });
export const day = (d: string | null | undefined) => (d ? DAY.format(new Date(d.length <= 10 ? `${d}T00:00:00` : d)) : '—');
const n = (v: unknown) => Number(v || 0);
/** The lines still on the order — an item cancelled on it is not what the row is about. */
const liveLines = (v: RowView) => { const all = v.po.purchase_order_items ?? []; const live = all.filter(it => !it.cancelled_at); return live.length ? live : all; };
/** "204 pcs · 120 m" */
export const unitsText = (q: UnitQty) => q.map(x => `${fmtQty(x.qty)} ${x.unit}`).join(' · ');

/** The first line's SKU photo; a quiet tile when the order has no SKU. */
export function Thumb({ v, size }: { v: RowView; size: number }) {
  const sku = (liveLines(v)[0]?.sku || '').trim();
  if (sku) return <SkuThumb sku={sku} size={size} radius={size > 48 ? 10 : 8} />;
  return (
    <div aria-hidden style={{ width: size, height: size, borderRadius: size > 48 ? 10 : 8, background: T.s2, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg viewBox="0 0 24 24" style={{ width: size * 0.36, height: size * 0.36, fill: 'none', stroke: T.tx3, strokeWidth: 1.6, opacity: 0.6 }}><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8zM14 3v5h5M9 13h6M9 17h4" /></svg>
    </div>
  );
}

/** "DRS187" (or "PO #88" when there is no SKU) and the PO number beside it. */
export function Title({ v, size }: { v: RowView; size: number }) {
  const sku = (liveLines(v)[0]?.sku || '').trim();
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
      <span style={{ fontFamily: T.mono, fontSize: size, fontWeight: 700, color: T.tx, whiteSpace: 'nowrap' }}>{sku || `PO #${v.po.po_number}`}</span>
      {sku && <span style={{ fontFamily: T.mono, fontSize: 10, color: T.tx3, whiteSpace: 'nowrap' }}>PO #{v.po.po_number}</span>}
      <UrgentPill row={v.po} />
    </span>
  );
}

/** "Valentino · 137 +2 more" — the type when the order has no lines. */
export function Item({ v }: { v: RowView }) {
  const items = liveLines(v), first = items[0];
  if (!first) return <>{PO_TYPE_LABELS[v.po.po_type] || v.po.po_type}</>;
  return <>{itemLabel({ item_name: (first.item_name || '').trim() || 'item', fabric_code: first.fabric_code })}{items.length > 1 && <b style={{ color: T.ac2, fontWeight: 600 }}> +{items.length - 1} more</b>}</>;
}

/** The green share of what has arrived. */
export const Bar = ({ v, h }: { v: RowView; h: number }) => (
  <div style={{ height: h, borderRadius: h, background: T.s3, overflow: 'hidden' }}>
    <div style={{ width: `${v.ordered > 0 ? Math.min(100, Math.round((v.got / v.ordered) * 100)) : 0}%`, height: '100%', background: T.gr }} />
  </div>
);

/** "0/16 pcs · 16 pending", "30/30 pcs received", "0/20 pcs · not sent yet" (mixed units: the share). */
export function Received({ v }: { v: RowView }) {
  if (v.mixed) return <><b style={{ color: T.tx2 }}>{v.ordered > 0 ? Math.round((v.got / v.ordered) * 100) : 0}%</b> received</>;
  const done = v.po.status === 'completed' || (v.ordered > 0 && v.pending === 0);
  return (
    <>
      <b style={{ color: done ? T.gr : T.tx2 }}>{fmtQty(v.got)}</b>/{fmtQty(v.ordered)} {v.unit}
      {done ? ' received' : v.po.status === 'draft' || v.po.status === 'approved' ? ' · not sent yet' : v.po.status === 'closed' || v.po.status === 'cancelled' ? '' : <> · <b style={{ color: T.yl }}>{fmtQty(v.pending)}</b> pending</>}
    </>
  );
}

/** Under the dates: how late (a draft past its date too), due today, or how long to go. */
export function DueNote({ v }: { v: RowView }) {
  if (!v.due) return null;
  if (v.pastDue) return <span style={{ color: T.re, fontWeight: 600 }}>{v.due.late} d late</span>;
  if (v.due.left === 0) return <span style={{ color: T.yl, fontWeight: 600 }}>due today</span>;
  return <span style={{ color: T.tx3 }}>due in {v.due.left} d</span>;
}

/** The total, its rate per piece, or "No rate" when no rate was entered. */
export function Total({ v, perPiece = true }: { v: RowView; perPiece?: boolean }) {
  const total = n(v.po.grand_total);
  if (total <= 0) return <span style={{ fontSize: 12, color: T.tx3 }}>No rate</span>;
  const pcs = n(v.po.for_pieces);
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end' }}>
      <span style={{ fontFamily: T.mono, fontSize: 13, color: T.tx }}>₹{total.toLocaleString('en-IN')}</span>
      {perPiece && pcs > 0 && <span style={{ fontFamily: T.mono, fontSize: 10, color: T.tx3, marginTop: 3 }}>₹{Math.round(total / pcs).toLocaleString('en-IN')}/pc</span>}
    </span>
  );
}

/** The line beside a section's name: who to chase and how much is still to come. */
export function sectionHint(s: Section): string {
  const pcs = unitsText(s.pending);
  switch (s.key) {
    case 'overdue': return ['Chase these first', [pcs && `${pcs} past due`, s.oldestLate > 0 && `oldest ${s.oldestLate} day${s.oldestLate === 1 ? '' : 's'}`].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
    case 'approve': return 'Approve to send to the vendor';
    case 'send': return 'Approved — mark sent once it reaches the vendor';
    case 'vendor': return pcs ? `${pcs} to come` : 'With the vendor';
    case 'partial': return pcs ? `${pcs} still to come` : 'Partly in';
    case 'received': return 'Everything in';
    case 'closed': return 'The rest was written off';
    default: return 'Called off';
  }
}
