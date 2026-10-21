// The PO's history of changes after approval (owner's ask): Rev 2, Rev 3 …
// newest first — who changed it and when, why, and line by line what moved
// (quantities, items added or cancelled, fabric code, delivery date, rates
// and totals for us). Each revision the vendor should hear about can be sent
// on WhatsApp from here; the newest one not yet sent is offered above the
// order (POReviseNotice).
import { T } from '../../lib/theme';
import { fmtWhen } from '../../lib/humanize';
import { fmtQty, unitOf } from './poStats';
import { shortDate } from './POHeaderInfo';
import { revisedText } from './poWhatsApp';
import { waLink } from '../../lib/whatsapp';
import type { PORevisionRow } from './poDetailData';
import type { POChange, PurchaseOrder, PurchaseOrderItem } from '../../types/database';

const q = (v: unknown, unit?: string | null) => `${fmtQty(Number(v || 0))}${unit !== undefined ? ` ${unitOf(unit)}` : ''}`;
const money = (v: unknown) => (v == null ? '—' : `₹${Number(v).toLocaleString('en-IN')}`);
const FIELD: Record<string, string> = { item_name: 'item', fabric_code: 'fabric code', sku: 'SKU', unit: 'unit' };

/** One change in our own words (rates and totals included — this never reaches a vendor). */
export function changeText(c: POChange): string {
  switch (c.kind) {
    case 'qty': return `${c.label}: ${q(c.from)} → ${q(c.to, c.unit)}`;
    case 'added': return `Added ${c.label} — ${q(c.to, c.unit)}`;
    case 'cancelled': return `Cancelled ${c.label} — ${q(c.from, c.unit)}${Number(c.received) > 0 ? ` (${q(c.received, c.unit)} had arrived)` : ''}`;
    case 'item': return `${c.label}: ${FIELD[c.field]} ${c.from || '—'} → ${c.to || '—'}`;
    case 'rate': return `${c.label}: rate ${money(c.from)} → ${money(c.to)}`;
    case 'total': return `Total ${money(c.from)} → ${money(c.to)}`;
    case 'field': {
      const d = (v: unknown) => (v ? shortDate(String(v)) ?? '—' : '—');
      const disc = (v: unknown) => { const x = v as { type?: string; value?: number } | null; return x ? (x.type === 'percentage' ? `${x.value}%` : money(x.value)) : '—'; };
      switch (c.field) {
        case 'expected_date': return `Expected: ${d(c.from)} → ${d(c.to)}`;
        case 'notes': return c.to ? `Notes: “${String(c.to)}”` : 'Notes removed';
        case 'payment_terms': return `Terms: ${c.from || '—'} → ${c.to || '—'}`;
        case 'for_pieces': return `For pieces: ${c.from ?? '—'} → ${c.to ?? '—'}`;
        case 'lump_sum': return c.to ? 'Now a lump sum' : 'No longer a lump sum';
        case 'discount': return `Discount: ${disc(c.from)} → ${disc(c.to)}`;
        case 'tax_percent': return `Tax: ${Number(c.from || 0)}% → ${Number(c.to || 0)}%`;
        case 'other_charges': return `Other charges: ${money(c.from)} → ${money(c.to)}`;
      }
    }
  }
  return '';
}

export default function PORevisions({ po, items, revisions }: {
  po: PurchaseOrder;
  items: PurchaseOrderItem[];
  /** Newest first; null while loading. */
  revisions: PORevisionRow[] | null;
}) {
  if (!revisions?.length) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Changes</div>
      {revisions.map(r => {
        const text = revisedText(po, r, items);
        const who = r.creator?.full_name?.trim() || 'Someone';
        return (
          <div key={r.id} style={{ padding: '9px 12px', background: T.glass1, border: `1px solid ${T.bd}`, borderRadius: 8, marginBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 700, color: T.ac2, padding: '1px 7px', borderRadius: 4, background: T.ac3 }}>Rev {r.revision}</span>
              <span style={{ fontSize: 12, color: T.tx, fontWeight: 600 }}>{r.kind === 'line_cancel' ? 'Item cancelled' : 'Revised'}</span>
              <span style={{ fontSize: 11, color: T.tx3 }}>by {who} · {fmtWhen(r.created_at)}</span>
              {text && (
                <a href={waLink(text, po.vendor_phone)} target="_blank" rel="noopener noreferrer" className="touch44"
                  style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: T.gr, textDecoration: 'none' }}>
                  {r.notified_at ? 'Send again' : 'Send to vendor'}
                </a>
              )}
            </div>
            {r.reason && <div style={{ fontSize: 11, color: T.tx3, marginTop: 3 }}>{r.reason}</div>}
            <ul style={{ margin: '6px 0 0', paddingLeft: 16, fontSize: 12, color: T.tx2, lineHeight: 1.6 }}>
              {r.changes.map((c, i) => <li key={i}>{changeText(c)}</li>)}
            </ul>
            {r.notified_at && <div style={{ fontSize: 10, color: T.tx3, marginTop: 4 }}>{r.notified_how === 'told' ? 'Vendor already told' : 'Sent to the vendor'} · {fmtWhen(r.notified_at)}</div>}
          </div>
        );
      })}
    </div>
  );
}
