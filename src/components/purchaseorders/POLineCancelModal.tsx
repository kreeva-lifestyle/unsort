// "Cancel this item" — one line of a multi-line order is not coming (owner's
// ask): its balance is cancelled, what already arrived stays on record, and
// the rest of the order carries on. A reason is compulsory, as for Close
// remaining. The order moves to its next revision, so the detail then offers
// to tell the vendor on WhatsApp.
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { useModalLock } from '../../hooks/useModalLock';
import { useBackClose } from '../../hooks/useBackClose';
import { itemLabel } from './poItemLabel';
import { fmtQty } from './poStats';
import type { PurchaseOrder, PurchaseOrderItem } from '../../types/database';

const PRESETS = [
  'Vendor cannot supply this fabric',
  'No longer needed',
  'Ordered by mistake',
  'Ordering it from another vendor',
];

export default function POLineCancelModal({ po, item, onClose, onDone, addToast }: {
  po: PurchaseOrder;
  item: PurchaseOrderItem;
  onClose: () => void;
  onDone: () => void;
  addToast: (m: string, t?: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const errRef = useRef<HTMLDivElement>(null);
  useModalLock();
  useBackClose(true, onClose);
  useEffect(() => { if (error) errRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [error]);

  const got = Number(item.received_qty || 0);
  const pending = Math.max(0, Number(item.quantity) - got);
  const unit = item.unit ? ` ${item.unit}` : '';

  const submit = async () => {
    if (saving) return;
    setError('');
    const r = reason.trim();
    if (!r) { setError('Say why this item is being cancelled'); return; }
    setSaving(true);
    try {
      const { error: e } = await supabase.rpc('cancel_po_line', { p_item_id: item.id, p_reason: r });
      if (e) throw e;
      addToast(`${itemLabel(item)} cancelled on PO #${po.po_number}`, 'success');
      onDone();
    } catch (e) { setError(friendlyError(e)); setSaving(false); return; }
    setSaving(false);
  };

  return createPortal(
    <div style={S.modalOverlay} onClick={onClose}>
      <div className="modal-inner" style={{ ...S.modalBox, width: 460, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={S.modalHead}>
          <span style={S.modalTitle}>Cancel item · PO #{po.po_number}</span>
          <button type="button" onClick={onClose} style={S.modalClose} aria-label="Close">&#215;</button>
        </div>

        <div style={{ padding: '16px 18px', overflowY: 'auto', WebkitOverflowScrolling: 'touch', flex: 1, minHeight: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '10px 12px', border: `1px solid ${T.bd}`, borderRadius: 10, marginBottom: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{itemLabel(item)}</div>
              {item.sku && <div style={{ fontSize: 10, color: T.tx3, fontFamily: T.mono }}>{item.sku}</div>}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: 13, color: T.re, flexShrink: 0 }}>{fmtQty(pending)}{unit}</div>
          </div>
          <div style={{ fontSize: 12, color: T.tx2, lineHeight: 1.5, marginBottom: 12 }}>
            {got > 0
              ? `The ${fmtQty(got)}${unit} already received stays on record; only the ${fmtQty(pending)}${unit} still to come is cancelled. Check that ${fmtQty(got)}${unit} is right — after the cancel its receipts cannot be undone.`
              : `This item comes off the order. The other items carry on as they are.`}
          </div>

          <label style={S.fLabel}>Why? *</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '6px 0 8px' }}>
            {PRESETS.map(p => (
              <button key={p} type="button" className="touch44" onClick={() => setReason(p)}
                style={{ ...S.btnGhost, ...S.btnSm, minHeight: 32, padding: '5px 12px', fontSize: 11, borderRadius: 999, borderColor: reason === p ? T.ac3 : T.bd2, color: reason === p ? T.ac2 : T.tx3, background: reason === p ? T.ac3 : 'transparent' }}>
                {p}
              </button>
            ))}
          </div>
          <input value={reason} onChange={e => setReason(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submit(); }}
            placeholder="Tap one above or type your own" aria-label="Reason for cancelling the item"
            style={{ ...S.fInput, width: '100%' }} />

          {error && <div ref={errRef} style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: T.re, marginTop: 10 }}>{error}</div>}
        </div>

        <div style={{ padding: '12px 18px', borderTop: `1px solid ${T.bd}`, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={{ ...S.btnGhost, minHeight: 44 }}>Keep it</button>
          <button type="button" onClick={submit} disabled={saving}
            style={{ ...S.btnDanger, minHeight: 44, pointerEvents: saving ? 'none' : 'auto', opacity: saving ? 0.5 : 1 }}>
            {saving ? 'Cancelling…' : 'Cancel item'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
