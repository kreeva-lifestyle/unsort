// The PO detail's header grid: vendor, type, dates, terms — and who did
// what to the order and when (raised, approved, closed, cancelled), from
// the actor columns on the header and the names behind them. Split out of
// PODetail so that file stays under the 200-line limit.
import { T } from '../../lib/theme';
import { fmtWhen } from '../../lib/humanize';
import { PO_TYPE_LABELS } from '../../types/database';
import type { PurchaseOrder } from '../../types/database';

export const fmtDate = (d: string | null | undefined) => d ? new Date(d + (d.length <= 10 ? 'T00:00:00' : '')).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const Info = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div><div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.06em', color: T.tx3, marginBottom: 2 }}>{label}</div><div style={{ fontSize: 13, color: T.tx }}>{value}</div></div>
);

/** The person (by id), with the moment on its own line: "Manthan" / "09 Oct, 03:06 pm". */
const Who = ({ names, id, at }: { names: Record<string, string>; id: string | null; at: string | null }) => (
  <><div>{(id && names[id]) || 'User'}</div><div style={{ fontSize: 11, color: T.tx3, fontFamily: T.mono, marginTop: 1 }}>{fmtWhen(at)}</div></>
);

export default function POHeaderInfo({ po, costingSku, names }: {
  po: PurchaseOrder;
  /** Raised from a costing sheet: that costing's SKU. */
  costingSku: string | null;
  /** Profile names by id, for the actor columns. */
  names: Record<string, string>;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 16 }}>
      <Info label="Vendor" value={<><div style={{ fontWeight: 600 }}>{po.vendor_name}</div>{po.vendor_phone && <div style={{ fontSize: 11, color: T.tx3, fontFamily: T.mono }}>{po.vendor_phone}</div>}</>} />
      <Info label="Type" value={PO_TYPE_LABELS[po.po_type] || po.po_type} />
      <Info label="PO Date" value={fmtDate(po.po_date)} />
      <Info label="Expected" value={fmtDate(po.expected_date)} />
      {po.payment_terms && <Info label="Payment terms" value={po.payment_terms} />}
      {po.for_pieces != null && po.for_pieces > 0 && <Info label="For pieces" value={<span style={{ fontFamily: T.mono }}>{po.for_pieces} pcs</span>} />}
      {po.lump_sum && <Info label="Pricing" value="Lump sum" />}
      {costingSku && <Info label="From costing" value={<span style={{ fontFamily: T.mono }}>{costingSku}</span>} />}
      {(po.created_by || po.created_at) && <Info label="Raised by" value={<Who names={names} id={po.created_by} at={po.created_at} />} />}
      {po.approved_at && <Info label="Approved by" value={<Who names={names} id={po.approved_by} at={po.approved_at} />} />}
      {po.status === 'closed' && <Info label="Closed by" value={<><Who names={names} id={po.closed_by} at={po.closed_at} />{po.close_reason ? <div style={{ fontSize: 11, color: T.tx3 }}>{po.close_reason}</div> : null}</>} />}
      {po.status === 'cancelled' && po.cancelled_at && <Info label="Cancelled by" value={<Who names={names} id={po.cancelled_by} at={po.cancelled_at} />} />}
    </div>
  );
}
