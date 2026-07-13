// Read-only PO detail: header, line items with Ordered/Received/Remaining,
// receipts log, activity timeline, and status/role-gated actions. Status
// transitions (approve / mark sent / cancel) run here via set_po_status;
// edit / duplicate / receive / print are emitted to the parent.
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { poAuditLog } from './poAudit';
import ConfirmModal, { useConfirm } from '../ui/ConfirmModal';
import { PO_TYPE_LABELS, PO_STATUS_LABELS } from '../../types/database';
import type { PurchaseOrder, PurchaseOrderItem, PurchaseOrderReceipt, AuditLog } from '../../types/database';

const fmtDate = (d: string | null | undefined) => d ? new Date(d + (d.length <= 10 ? 'T00:00:00' : '')).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const inr = (n: unknown) => Number(n || 0).toLocaleString('en-IN');

export default function PODetail({ po, items, receipts, audit, statusColors, canManage, onClose, onChanged, onEdit, onDuplicate, onReceive, onPrint, addToast }: {
  po: PurchaseOrder;
  items: PurchaseOrderItem[];
  receipts: PurchaseOrderReceipt[];
  audit: AuditLog[] | null;
  statusColors: Record<string, { bg: string; color: string }>;
  canManage: boolean;
  onClose: () => void;
  onChanged: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onReceive: () => void;
  onPrint: () => void;
  addToast: (m: string, t?: string) => void;
}) {
  const { ask, modalProps } = useConfirm();
  const [busy, setBusy] = useState('');
  const sc = statusColors[po.status] || statusColors.draft;

  const setStatus = async (status: 'approved' | 'sent' | 'cancelled', label: string) => {
    if (busy) return;
    if (status === 'cancelled') {
      const ok = await ask({ title: `Cancel PO #${po.po_number}?`, message: 'The order stays on record but is closed to further edits and receiving. This cannot be undone.', confirmLabel: 'Cancel PO', cancelLabel: 'Keep', danger: true });
      if (!ok) return;
    }
    setBusy(status);
    try {
      const { error } = await supabase.rpc('set_po_status', { p_po_id: po.id, p_status: status });
      if (error) throw new Error(error.message);
      await poAuditLog(status.toUpperCase(), po.id, `PO #${po.po_number} ${label}`);
      addToast(`Purchase order ${label}`, 'success');
      onChanged();
    } catch (e) { addToast(friendlyError(e), 'error'); }
    setBusy('');
  };

  const canReceive = ['approved', 'sent', 'partially_received'].includes(po.status);
  const canApprove = po.status === 'draft' && canManage;
  const canSend = ['approved', 'partially_received'].includes(po.status);
  const canCancel = !['completed', 'cancelled'].includes(po.status) && canManage;
  const canEdit = po.status === 'draft';

  const Info = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div><div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.06em', color: T.tx3, marginBottom: 2 }}>{label}</div><div style={{ fontSize: 13, color: T.tx }}>{value}</div></div>
  );

  return createPortal(
    <div style={S.modalOverlay} onClick={onClose}>
      <div className="modal-inner" style={{ ...S.modalBox, width: 720 }} onClick={e => e.stopPropagation()}>
        <div style={S.modalHead}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={S.modalTitle}>PO #{po.po_number}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: sc.bg, color: sc.color }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: sc.color }} />{PO_STATUS_LABELS[po.status]}</span>
          </div>
          <span onClick={onClose} style={{ cursor: 'pointer', color: T.tx3, fontSize: 18, lineHeight: 1 }}>&times;</span>
        </div>

        <div style={{ padding: '16px 18px', overflowY: 'auto', maxHeight: 'calc(90vh - 190px)' }}>
          {/* Header info */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 16 }}>
            <Info label="Vendor" value={<><div style={{ fontWeight: 600 }}>{po.vendor_name}</div>{po.vendor_phone && <div style={{ fontSize: 11, color: T.tx3, fontFamily: T.mono }}>{po.vendor_phone}</div>}</>} />
            <Info label="Type" value={PO_TYPE_LABELS[po.po_type] || po.po_type} />
            <Info label="PO Date" value={fmtDate(po.po_date)} />
            <Info label="Expected" value={fmtDate(po.expected_date)} />
            {po.payment_terms && <Info label="Payment terms" value={po.payment_terms} />}
          </div>

          {/* Items */}
          <div style={{ border: `1px solid ${T.bd}`, borderRadius: 10, overflow: 'hidden', marginBottom: 14 }}>
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
                <thead><tr style={{ borderBottom: `1px solid ${T.bd}` }}><th style={S.thStyle}>Item</th><th style={{ ...S.thStyle, textAlign: 'right' }}>Ordered</th><th style={{ ...S.thStyle, textAlign: 'right' }}>Received</th><th style={{ ...S.thStyle, textAlign: 'right' }}>Remaining</th><th style={{ ...S.thStyle, textAlign: 'right' }}>Rate</th><th style={{ ...S.thStyle, textAlign: 'right' }}>Amount</th></tr></thead>
                <tbody>
                  {items.map(it => {
                    const rem = Math.max(0, Number(it.quantity) - Number(it.received_qty || 0));
                    return (
                      <tr key={it.id} style={{ borderBottom: `1px solid ${T.bd}` }}>
                        <td style={S.tdStyle}><span style={{ fontSize: 13, color: T.tx }}>{it.item_name}</span>{it.unit && <span style={{ fontSize: 10, color: T.tx3, marginLeft: 4 }}>/{it.unit}</span>}{it.sku && <div style={{ fontSize: 10, color: T.tx3, fontFamily: T.mono, marginTop: 1 }}>{it.sku}</div>}</td>
                        <td style={{ ...S.tdStyle, textAlign: 'right', fontFamily: T.mono }}>{Number(it.quantity)}</td>
                        <td style={{ ...S.tdStyle, textAlign: 'right', fontFamily: T.mono, color: Number(it.received_qty) > 0 ? T.gr : T.tx3 }}>{Number(it.received_qty || 0)}</td>
                        <td style={{ ...S.tdStyle, textAlign: 'right', fontFamily: T.mono, color: rem > 0 ? T.yl : T.tx3 }}>{rem}</td>
                        <td style={{ ...S.tdStyle, textAlign: 'right', fontFamily: T.mono, color: T.tx3 }}>{it.rate == null ? '—' : `₹${inr(it.rate)}`}</td>
                        <td style={{ ...S.tdStyle, textAlign: 'right', fontFamily: T.mono }}>{it.amount == null ? '—' : `₹${inr(it.amount)}`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals */}
          <div style={{ marginLeft: 'auto', maxWidth: 260, display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 16 }}>
            <Row label="Subtotal" value={`₹${inr(po.subtotal)}`} />
            {Number(po.discount_amount) > 0 && <Row label="Discount" value={`−₹${inr(po.discount_amount)}`} />}
            {Number(po.tax_amount) > 0 && <Row label={`Tax (${Number(po.tax_percent)}%)`} value={`₹${inr(po.tax_amount)}`} />}
            {Number(po.other_charges) > 0 && <Row label="Other charges" value={`₹${inr(po.other_charges)}`} />}
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${T.bd}`, paddingTop: 6, marginTop: 2, fontSize: 15, fontWeight: 700, color: T.tx }}><span>Grand Total</span><span style={{ fontFamily: T.mono }}>₹{inr(po.grand_total)}</span></div>
          </div>

          {/* Receipts */}
          {receipts.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Receipts</div>
              {receipts.map(r => {
                const item = items.find(it => it.id === r.po_item_id);
                return (
                  <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px', background: T.glass1, border: `1px solid ${T.bd}`, borderRadius: 6, marginBottom: 4, fontSize: 12 }}>
                    <div><span style={{ color: T.tx }}>{item?.item_name || 'Item'}</span> <span style={{ color: T.gr, fontFamily: T.mono }}>+{Number(r.received_qty)}</span>{r.remarks && <span style={{ color: T.tx3, marginLeft: 6 }}>· {r.remarks}</span>}</div>
                    <span style={{ fontSize: 10, color: T.tx3, fontFamily: T.mono }}>{fmtDate(r.receipt_date)}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Timeline */}
          {audit && audit.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.tx2, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Activity</div>
              {audit.map(a => (
                <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', fontSize: 11 }}>
                  <div><span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 3, background: T.ac3, color: T.ac2, fontWeight: 700, marginRight: 6 }}>{a.action}</span><span style={{ color: T.tx2 }}>{a.details}</span></div>
                  <span style={{ fontSize: 9, color: T.tx3, fontFamily: T.mono, flexShrink: 0, marginLeft: 8 }}>{a.created_at ? new Date(a.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ padding: '12px 18px', borderTop: `1px solid ${T.bd}`, display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button onClick={onPrint} style={{ ...S.btnGhost, ...S.btnSm }}>Print / Share</button>
          <button onClick={onDuplicate} style={{ ...S.btnGhost, ...S.btnSm }}>Duplicate</button>
          {canEdit && <button onClick={onEdit} style={{ ...S.btnGhost, ...S.btnSm }}>Edit</button>}
          {canCancel && <button onClick={() => setStatus('cancelled', 'cancelled')} disabled={!!busy} style={{ ...S.btnDanger, ...S.btnSm, pointerEvents: busy ? 'none' : 'auto', opacity: busy ? 0.5 : 1 }}>Cancel PO</button>}
          {canSend && <button onClick={() => setStatus('sent', 'marked sent')} disabled={!!busy} style={{ ...S.btnGhost, ...S.btnSm, pointerEvents: busy ? 'none' : 'auto', opacity: busy ? 0.5 : 1 }}>Mark Sent</button>}
          {canApprove && <button onClick={() => setStatus('approved', 'approved')} disabled={!!busy} style={{ ...S.btnPrimary, ...S.btnSm, pointerEvents: busy ? 'none' : 'auto', opacity: busy ? 0.5 : 1 }}>{busy === 'approved' ? 'Approving…' : 'Approve'}</button>}
          {canReceive && <button onClick={onReceive} style={{ ...S.btnPrimary, ...S.btnSm }}>Receive</button>}
        </div>
      </div>
      <ConfirmModal {...modalProps} />
    </div>,
    document.body,
  );
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.tx3 }}><span>{label}</span><span style={{ fontFamily: T.mono }}>{value}</span></div>
);
