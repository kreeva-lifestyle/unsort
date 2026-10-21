// Read-only PO detail: the hero card with its rail and, right under it, the
// order's next steps (POStageActions: approve / mark sent / receive / close /
// reopen / cancel); "Rev N — tell the vendor" when a revision has not reached
// them yet; header (with who raised / approved / revised / closed it), line
// items with Ordered/Received/Remaining and Cancel on one line, receipts log
// (who received), the history of changes, who did what. Edit / Revise /
// duplicate / receive / print are emitted to the parent; Remind vendor opens
// WhatsApp with what is still pending; Start jobwork (a received fabric PO)
// opens the Jobwork job form filled from the order (useStartJobwork).
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { logSwallowed } from '../../lib/errorLogger';
import { waLink } from '../../lib/whatsapp';
import ConfirmModal, { useConfirm } from '../ui/ConfirmModal';
import { useModalLock } from '../../hooks/useModalLock';
import POCloseModal, { pendingOf } from './POCloseModal';
import POLineCancelModal from './POLineCancelModal';
import POLineTable from './POLineTable';
import POActivity from './POActivity';
import POReceipts from './POReceipts';
import PORevisions from './PORevisions';
import POReviseNotice, { pendingRevision } from './POReviseNotice';
import POHeaderInfo from './POHeaderInfo';
import PORailCard from './PORailCard';
import POStageActions from './POStageActions';
import { useLandedOrder } from './useLandedOrder';
import { useStartJobwork } from './useStartJobwork';
import { reminderText } from './poWhatsApp';
import type { PORevisionRow } from './poDetailData';
import type { PurchaseOrder, PurchaseOrderItem, PurchaseOrderReceipt, AuditLog } from '../../types/database';

const inr = (n: unknown) => Number(n || 0).toLocaleString('en-IN');
const OPEN = ['approved', 'sent', 'partially_received'];

export default function PODetail({ po: livePo, items: liveItems, receipts: liveReceipts, audit, names, revisions, statusColors, canManage, onClose, onChanged, onRetryActivity, onEdit, onDuplicate, onReceive, onPrint, onPendency, addToast }: {
  po: PurchaseOrder;
  items: PurchaseOrderItem[];
  receipts: PurchaseOrderReceipt[];
  /** null while loading; 'error' when the trail could not be read (onRetryActivity reloads it). */
  audit: AuditLog[] | null | 'error';
  /** Profile names by id, for every actor column and receipt; null until they have loaded. */
  names: Record<string, string> | null;
  /** Rev 2, Rev 3 … newest first; null until the trail has loaded. */
  revisions: PORevisionRow[] | null;
  onRetryActivity: () => void;
  statusColors: Record<string, { bg: string; color: string }>;
  canManage: boolean;
  onClose: () => void;
  /** Re-reads the order; awaited so a button stays "Approving…" until the new stage has landed. */
  onChanged: () => void | Promise<void>;
  /** Edit a draft, or revise an approved / sent order (the form knows which). */
  onEdit: () => void;
  onDuplicate: () => void;
  onReceive: () => void;
  onPrint: () => void;
  /** Vendor pendency report, preselected on this PO's vendor. */
  onPendency: () => void;
  addToast: (m: string, t?: string) => void;
}) {
  const { ask, modalProps } = useConfirm();
  // Everything below the rail shows the order as it was until the rail's light lands.
  const { shown, holding, land } = useLandedOrder({ po: livePo, items: liveItems, receipts: liveReceipts }, audit);
  const { po, items, receipts } = shown;
  useModalLock();
  // One gate for every write on this sheet: a stage change and a receipt undo never overlap.
  const [busy, setBusy] = useState('');
  const [closing, setClosing] = useState(false);
  const [cancelling, setCancelling] = useState<PurchaseOrderItem | null>(null);
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

  const open = OPEN.includes(po.status);
  const canEdit = po.status === 'draft';
  // After approval the order is revised (Rev 2 …), never re-edited in place.
  const canRevise = open && canManage;
  // The reminder lists what is still to come, so it needs something pending.
  const remind = open && items.some(it => pendingOf(it) > 0) ? reminderText(po, items) : null;
  // Best effort: the reminder already went; the trail just says so.
  const logReminder = () => {
    supabase.rpc('audit_write', { p_module: 'purchase_order', p_action: 'REMINDED', p_record: po.id, p_details: `PO #${po.po_number} — reminder sent on WhatsApp` })
      .then(({ error }) => { if (error) logSwallowed('PO reminder audit', error); });
  };
  const rev = pendingRevision(po, revisions, audit);
  const jw = useStartJobwork({ po, items, onDone: () => { void onChanged(); }, addToast });

  return createPortal(
    <>
      <div style={S.modalOverlay} onClick={onClose}>
        <div className="modal-inner" style={{ ...S.modalBox, width: 720, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
          <div style={S.modalHead}>
            {/* The status lives on the hero card below (its pill rolls when the order moves on). */}
            <span style={S.modalTitle}>PO #{po.po_number}{po.revision > 1 && <span style={{ fontFamily: T.mono, fontSize: 11, color: T.ac2, marginLeft: 8 }}>Rev {po.revision}</span>}</span>
            <button type="button" onClick={onClose} style={S.modalClose} aria-label="Close">&#215;</button>
          </div>

          {/* One scrolling body inside a flex column (see POForm): the old
              calc(90vh - 190px) was taller than the mobile bottom sheet. */}
          <div style={{ padding: '16px 18px', overflowY: 'auto', WebkitOverflowScrolling: 'touch', flex: 1, minHeight: 0 }}>
            {/* The hero: title, status pill, the pipeline rail (the light travels when the order moves on), the latest event and who. */}
            <PORailCard po={livePo} items={liveItems} shown={shown} audit={audit} names={names} statusColors={statusColors} onLanded={() => { land(); landRef.current?.(); }} />
            <POStageActions po={po} items={items} canManage={canManage} ask={ask} onChanged={onChanged} waitLanded={waitLanded} busy={busy} holding={holding} setBusy={setBusy} onReceive={onReceive} onCloseRemaining={() => setClosing(true)} addToast={addToast} />
            {rev && <POReviseNotice key={rev.id} po={po} items={items} rev={rev} onDone={() => { void onChanged(); }} addToast={addToast} />}
            <POHeaderInfo po={po} costingSku={costingSku} names={names} jobs={jw.jobs} />

            <POLineTable items={items} canCancel={open && canManage && !holding} busy={!!busy} onCancel={setCancelling} />

            {/* Totals */}
            <div style={{ marginLeft: 'auto', maxWidth: 260, display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 16 }}>
              <Row label="Subtotal" value={`₹${inr(po.subtotal)}`} />
              {Number(po.discount_amount) > 0 && <Row label="Discount" value={`−₹${inr(po.discount_amount)}`} />}
              {Number(po.tax_amount) > 0 && <Row label={`Tax (${Number(po.tax_percent)}%)`} value={`₹${inr(po.tax_amount)}`} />}
              {Number(po.other_charges) > 0 && <Row label="Other charges" value={`₹${inr(po.other_charges)}`} />}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${T.bd}`, paddingTop: 6, marginTop: 2, fontSize: 15, fontWeight: 700, color: T.tx }}><span>Grand Total</span><span style={{ fontFamily: T.mono }}>₹{inr(po.grand_total)}</span></div>
            </div>

            <POReceipts receipts={receipts} items={items} names={names} canRemove={canRemoveReceipt} busy={busy} onRemove={removeReceipt} />

            <PORevisions po={po} items={items} revisions={revisions} onSent={() => { void onChanged(); }} addToast={addToast} />

            <POActivity audit={audit} poNumber={po.po_number} onRetry={onRetryActivity} />
          </div>

          {/* Actions */}
          <div className="po-actions" style={{ padding: '12px 18px', borderTop: `1px solid ${T.bd}`, display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button onClick={onPrint} style={{ ...S.btnGhost, ...S.btnSm }}>Print / Share</button>
            {/* A real link: the tap itself opens WhatsApp with the pending lines typed in. */}
            {remind && <a href={waLink(remind, po.vendor_phone)} target="_blank" rel="noopener noreferrer" onClick={logReminder} className="touch44" style={{ ...S.btnSuccess, ...S.btnSm, textDecoration: 'none' }}>Remind vendor</a>}
            {jw.button}
            <button onClick={onPendency} style={{ ...S.btnGhost, ...S.btnSm }}>Vendor pending</button>
            <button onClick={onDuplicate} style={{ ...S.btnGhost, ...S.btnSm }}>Duplicate</button>
            {(canEdit || canRevise) && <button onClick={onEdit} disabled={!!busy || holding} style={{ ...S.btnGhost, ...S.btnSm, opacity: busy || holding ? 0.5 : 1 }}>{canEdit ? 'Edit' : 'Revise'}</button>}
          </div>
        </div>
        <ConfirmModal {...modalProps} />
        {closing && <POCloseModal po={po} items={items} onClose={() => setClosing(false)} onClosed={() => { setClosing(false); onChanged(); }} addToast={addToast} />}
      </div>
      {/* Outside the sheet's overlay: a tap on this modal's backdrop must not bubble up and close the order. */}
      {jw.sheet}
      {cancelling && <POLineCancelModal po={po} item={cancelling} onClose={() => setCancelling(null)} onDone={() => { setCancelling(null); void onChanged(); }} addToast={addToast} />}
    </>,
    document.body,
  );
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.tx3 }}><span>{label}</span><span style={{ fontFamily: T.mono }}>{value}</span></div>
);
