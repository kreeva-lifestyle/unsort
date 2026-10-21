// The WhatsApp messages a PO sends to its vendor — a reminder of what is
// still pending, and a revised order (Rev N: what changed, and the order as
// it now stands). Pure and synchronous, so a detail can build the <a href>
// while it renders. Owner's rule: nothing that reaches a vendor carries
// rates, amounts, totals or the internal "for how many pcs".
import { fileDate } from '../../lib/exportName';
import { itemLabel } from './poItemLabel';
import { fmtQty, unitOf } from './poStats';
import { dueOf, daysBetween, sinceOf } from './poDue';
import type { PurchaseOrder, PurchaseOrderItem, PurchaseOrderRevision, POChange } from '../../types/database';

type Line = Pick<PurchaseOrderItem, 'item_name' | 'fabric_code' | 'quantity' | 'received_qty' | 'unit' | 'cancelled_at'> & { sort_order?: number | null };
type Head = Pick<PurchaseOrder, 'po_number' | 'vendor_name' | 'po_date' | 'created_at' | 'expected_date' | 'revision'>;

const DAY = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' });
const day = (d: string) => DAY.format(new Date(d.length <= 10 ? `${d}T00:00:00` : d));
const q = (v: unknown, unit: string | null | undefined) => `${fmtQty(Number(v || 0))} ${unitOf(unit)}`;
const n = (v: unknown) => Number(v || 0);
const title = (po: Head) => `PO #${po.po_number}${po.revision > 1 ? ` (Rev ${po.revision})` : ''}`;
const sorted = (items: Line[]) => items.slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
const plural = (k: number, w: string) => `${k} ${w}${k === 1 ? '' : 's'}`;
const SIGN = '— Arya Designs';

/** Lines still on order (a cancelled one is gone from the vendor's view). */
const live = (items: Line[]) => sorted(items).filter(it => !it.cancelled_at);

/** "Reminder for PO #111 … Still pending: • micro · 321 — 80 m of 120 m … Please share the dispatch date." */
export function reminderText(po: Head, items: Line[], today = fileDate()): string {
  const pending = live(items).map(it => ({ it, left: Math.max(0, n(it.quantity) - n(it.received_qty)) })).filter(x => x.left > 0);
  const lines = pending.map(({ it, left }) => `• ${itemLabel(it)} — *${q(left, it.unit)}* of ${q(it.quantity, it.unit)}${n(it.received_qty) > 0 ? ` (${q(it.received_qty, it.unit)} received)` : ''}`);
  const d = dueOf(po, today);
  // An assumed due date is the app's guess — the vendor only hears real dates.
  const since = daysBetween(sinceOf(po, today), today);
  const due = !d.assumed
    ? d.late > 0 ? `It was due on ${day(d.due)} — now *${plural(d.late, 'day')} late*.` : d.left === 0 ? 'It is due today.' : `Due on ${day(d.due)}.`
    : since > 0 ? `Ordered ${plural(since, 'day')} ago.` : 'Ordered today.';
  return [
    `Hi ${po.vendor_name},`,
    `Reminder for *${title(po)}*${po.po_date ? ` dated ${day(po.po_date)}` : ''}.`,
    '',
    'Still pending:',
    ...lines,
    '',
    due,
    'Please share the dispatch date.',
    SIGN,
  ].join('\n');
}

const FIELD_WORD: Record<string, string> = { item_name: 'item', fabric_code: 'fabric code', sku: 'SKU', unit: 'unit' };

/** One change as the vendor reads it; null for what the vendor never sees (rates, totals, pieces, terms, charges). */
function changeLine(c: POChange): string | null {
  switch (c.kind) {
    case 'qty': return `• ${c.label}: ~${q(c.from, c.unit)}~ → *${q(c.to, c.unit)}*`;
    case 'added': return `• Added: ${c.label} — *${q(c.to, c.unit)}*`;
    case 'cancelled': return `• Cancelled: ${c.label} — ${q(c.from, c.unit)}${n(c.received) > 0 ? ` (we keep the ${q(c.received, c.unit)} already received)` : ''}`;
    case 'item': return `• ${c.label}: ${FIELD_WORD[c.field]} ${c.from || '—'} → *${c.to || '—'}*`;
    case 'field':
      if (c.field === 'expected_date') return c.to ? `• Delivery date: ${c.from ? `~${day(String(c.from))}~ → ` : ''}*${day(String(c.to))}*` : '• Delivery date: removed';
      if (c.field === 'notes') return c.to ? `• Note: ${String(c.to)}` : null;
      return null;
    default: return null;
  }
}

/** True when a revision changed something the vendor should hear about. */
export const vendorVisible = (rev: Pick<PurchaseOrderRevision, 'changes'>): boolean => rev.changes.some(c => changeLine(c) !== null);

/** "PO #111 has been revised (Rev 2) — changes … Order now: 1. … Please confirm." — null when nothing the vendor sees changed. */
export function revisedText(po: Head, rev: Pick<PurchaseOrderRevision, 'revision' | 'kind' | 'changes' | 'reason'>, items: Line[]): string | null {
  const changes = rev.changes.map(changeLine).filter((x): x is string => !!x);
  if (!changes.length) return null;
  const order = live(items).map((it, i) => `${i + 1}. ${itemLabel(it)} — ${q(it.quantity, it.unit)}${n(it.received_qty) > 0 ? ` (${q(it.received_qty, it.unit)} received)` : ''}`);
  const head = rev.kind === 'line_cancel'
    ? `*PO #${po.po_number}* (Rev ${rev.revision}) — please *cancel* this item:`
    : `*PO #${po.po_number} has been revised (Rev ${rev.revision})* — please note the changes:`;
  return [
    `Hi ${po.vendor_name},`,
    head,
    '',
    ...changes,
    ...(rev.kind === 'line_cancel' && rev.reason ? [`Reason: ${rev.reason}`] : []),
    '',
    rev.kind === 'line_cancel' ? 'Still on order:' : 'Order now:',
    ...order,
    '',
    'Please confirm.',
    SIGN,
  ].join('\n');
}
