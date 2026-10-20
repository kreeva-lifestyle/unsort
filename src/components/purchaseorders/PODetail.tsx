// Read-only PO detail: the hero card with its rail and, right under it, the
// order's next steps (POStageActions: approve / mark sent / receive / close /
// reopen / cancel); header (with who raised / approved / closed it), line
// items with Ordered/Received/Remaining, receipts log (who received), who
// did what. Edit / duplicate / receive / print are emitted to the parent.
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import ConfirmModal, { useConfirm } from '../ui/ConfirmModal';
import { useModalLock } from '../../hooks/useModalLock';
import POCloseModal from './POCloseModal';
import POActivity from './POActivity';
import POReceipts from './POReceipts';
import POHeaderInfo from './POHeaderInfo';
import PORailCard from './PORailCard';
import POStageActions from './POStageActions';
import { itemLabel } from './poItemLabel';
import type { PurchaseOrder, PurchaseOrderItem, PurchaseOrderReceipt, AuditLog } from '../../types/database';

const inr = (n: unknown) => Number(n || 0).toLocaleString('en-IN');

export default function PODetail({ po, items, receipts, audit, names, statusColors, canManage, onClose, onChanged, onRetryActivity, onEdit, onDuplicate, onReceive, onPrint, onPendency, addToast }: {
  po: PurchaseOrder;
  items: PurchaseOrderItem[];
  receipts: PurchaseOrderReceipt[];
  /** null while loading; 'error' when the trail could not be read (onRetryActivity reloads it). */
  audit: AuditLog[] | null | 'error';
  /** Profile names by id, for every actor column and receipt; null until they have loaded. */
  names: Record<string, string> | null;
  onRetryActivity: () => void;
  statusColors: Record<string, { bg: string; color: string }>;
  canManage: boolean;
  onClose: () => void;
  /** Re-reads the order; awaited so a button stays "Approving…" until the new stage has landed. */
  onChanged: () => void | Promise<void>;
  onEdit: () => void;
  onDuplicate: () => void;
  onReceive: () => void;
  onPrint: () => void;
  /** Vendor pendency report, preselected on this PO's vendor. */
  onPendency: () => void;
  addToast: (m: string, t?: string) => void;
}) {
  const { ask, modalProps } = useConfirm();
  useModalLock();
  // One gate for every write on this sheet: a stage change and a receipt undo never overlap.
  const [busy, setBusy] = useState('');
  const [closing, setClosing] = useState(false);
  // Raised from a costing sheet: the list embed carries the costing's SKU.
  const costingSku = (po as PurchaseOrder & { costing_products?: { sku: string } | null }).costing_products?.sku ?? null;

  // A stage change waits for the rail: resolved by the card's next landing
  // (POStageActions adds the safety wait once the re-read is back).
  const landRef = useRef<(() => void) | null>(null);
  const waitLanded = () => new Promise<void>(res => {
    const done = () => { if (landRef.current === done) landRef.current = null; res(); };
    landRef.current = done;
  });

  // Undo a mistyped receipt — reverses the received tally + recomputes status.
  const removeReceipt = async (r: PurchaseOrderReceipt) => {
    if (busy) return;
    const item = items.find(it => it.id === r.po_item_id);
    const ok = await ask({ title: 'Remove this receipt?', message: `This removes the entry of +${Number(r.received_qty)}${item ? ` for ${item.item_name}` : ''}. The received total will be reduced — you can receive the correct amount again.`, confirmLabel: 'Remove', cancelLabel: 'Keep', danger: true });
    if (!ok) return;
    setBusy('r' + r.id);
    try {
      const { error } = await supabase.rpc('delete_po_receipt', { p_receipt_id: r.id });
      if (error) throw error;
      addToast('Receipt removed', 'success');
      await onChanged();
    } catch (e) { addToast(friendlyError(e), 'error'); }
    setBusy('');
  };
  const canRemoveReceipt = canManage && !['draft', 'cancelled'].includes(po.status);

  const canEdit = po.status === 'draft';

  return createPortal(
    <div style={S.modalOverlay} onClick={onClose}>
      <div className="modal-inner" style={{ ...S.modalBox, width: 720, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={S.modalHead}>
          {/* The status lives on the hero card below (its pill rolls when the order moves on). */}
          <span style={S.modalTitle}>PO #{po.po_number}</span>
          <button type="button" onClick={onClose} style={S.modalClose} aria-label="Close">&#215;</button>
        </div>

        {/* One scrolling body inside a flex column (see POForm): the old
            calc(90vh - 190px) was taller than the mobile bottom sheet. */}
        <div style={{ padding: '16px 18px', overflowY: 'auto', WebkitOverflowScrolling: 'touch', flex: 1, minHeight: 0 }}>
          {/* The hero: title, status pill, the pipeline rail (the light travels when the order moves on), the latest event and who. */}
          <PORailCard po={po} items={items} receipts={receipts} audit={audit} names={names} statusColors={statusColors} onLanded={() => landRef.current?.()} />
          <POStageActions po={po} items={items} canManage={canManage} ask={ask} onChanged={onChanged} waitLanded={waitLanded} busy={busy} setBusy={setBusy} onReceive={onReceive} onCloseRemaining={() => setClosing(true)} addToast={addToast} />
          <POHeaderInfo po={po} costingSku={costingSku} names={names} />

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
                        <td style={S.tdStyle}><span style={{ fontSize: 13, color: T.tx }}>{itemLabel(it)}</span>{it.unit && <span style={{ fontSize: 10, color: T.tx3, marginLeft: 4 }}>/{it.unit}</span>}{it.sku && <div style={{ fontSize: 10, color: T.tx3, fontFamily: T.mono, marginTop: 1 }}>{it.sku}</div>}</td>
                        <td style={{ ...S.tdStyle, textAlign: 'right', fontFamily: T.mono }}>{Number(it.quantity)}</td>
                        <td style={{ ...S.tdStyle, textAlign: 'right', fontFamily: T.mono, color: Number(it.received_qty) > 0 ? T.gr : T.tx3 }}>{Number(it.received_qty || 0)}{Number(it.received_qty) > Number(it.quantity) && <span style={{ color: T.yl, fontSize: 10, marginLeft: 4 }}>+{Number(it.received_qty) - Number(it.quantity)}</span>}</td>
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

          <POReceipts receipts={receipts} items={items} names={names} canRemove={canRemoveReceipt} busy={busy} onRemove={removeReceipt} />

          <POActivity audit={audit} poNumber={po.po_number} onRetry={onRetryActivity} />
        </div>

        {/* Actions */}
        <div className="po-actions" style={{ padding: '12px 18px', borderTop: `1px solid ${T.bd}`, display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button onClick={onPrint} style={{ ...S.btnGhost, ...S.btnSm }}>Print / Share</button>
          <button onClick={onPendency} style={{ ...S.btnGhost, ...S.btnSm }}>Vendor pending</button>
          <button onClick={onDuplicate} style={{ ...S.btnGhost, ...S.btnSm }}>Duplicate</button>
          {canEdit && <button onClick={onEdit} style={{ ...S.btnGhost, ...S.btnSm }}>Edit</button>}
        </div>
      </div>
      <ConfirmModal {...modalProps} />
      {closing && <POCloseModal po={po} items={items} onClose={() => setClosing(false)} onClosed={() => { setClosing(false); onChanged(); }} addToast={addToast} />}
    </div>,
    document.body,
  );
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.tx3 }}><span>{label}</span><span style={{ fontFamily: T.mono }}>{value}</span></div>
);
