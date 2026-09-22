// The small pieces of the PO list rows: status pill, the items-at-a-glance
// label, "pending since" and the receive progress. Pure — split out of
// POList.tsx so the list file stays under the house limit.
import { T } from '../../lib/theme';
import { PO_STATUS_LABELS } from '../../types/database';
import { itemLabel } from './poItemLabel';
import { PENDING_STATUSES } from './pendencyData';
import type { PORow } from './POList';

export const StatusPill = ({ status, sc }: { status: string; sc: { bg: string; color: string } }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 9, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: sc.bg, color: sc.color, whiteSpace: 'nowrap' }}>
    <span style={{ width: 7, height: 7, borderRadius: '50%', background: sc.color }} />
    {PO_STATUS_LABELS[status as keyof typeof PO_STATUS_LABELS] || status}
  </span>
);

// "What's on this PO" at a glance (owner's ask): first line-item's SKU and
// name, then how many more — the full list stays one tap away in the detail.
export const itemsLabel = (po: PORow) => {
  const its = po.purchase_order_items || [];
  if (its.length === 0) return { head: '—', sub: '' };
  const f = its[0];
  const sku = (f.sku || '').trim();
  const name = itemLabel({ item_name: (f.item_name || '').trim(), fabric_code: f.fabric_code });
  const sub = [sku && name ? name : '', its.length > 1 ? `+${its.length - 1} more` : ''].filter(Boolean).join(' · ');
  return { head: sku || name || 'item', sub };
};

// "Pending since": how long an open PO has been waiting, from its PO date
// (or creation) — owner's ask, so a forgotten order stands out in the grid.
// Same definition of "open" as the vendor pendency report (approved, sent,
// partially received): a draft has not reached the vendor, so it is not
// waiting on anyone; completed / cancelled are over.
export const pendingDays = (po: PORow): number | null => {
  if (!PENDING_STATUSES.includes(po.status)) return null;
  const since = po.po_date ? new Date(po.po_date + 'T00:00:00') : po.created_at ? new Date(po.created_at) : null;
  if (!since || Number.isNaN(since.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - since.getTime()) / 86400000));
};
const pendingColor = (d: number) => (d > 14 ? T.re : d > 7 ? T.yl : T.tx3);
export const PendingSince = ({ po, inline }: { po: PORow; inline?: boolean }) => {
  const d = pendingDays(po);
  if (d === null) return null;
  const text = d === 0 ? 'pending since today' : `pending ${d} d`;
  return inline ? <span style={{ color: pendingColor(d) }}>{text}</span> : <div style={{ fontSize: 9, color: pendingColor(d), marginTop: 3, fontFamily: T.mono, whiteSpace: 'nowrap' }}>{text}</div>;
};

export const progress = (po: PORow) => {
  const its = po.purchase_order_items || [];
  const ordered = its.reduce((s, it) => s + Number(it.quantity || 0), 0);
  const received = its.reduce((s, it) => s + Number(it.received_qty || 0), 0);
  return { count: its.length, ordered, received, pct: ordered > 0 ? Math.min(100, Math.round(received / ordered * 100)) : 0 };
};
