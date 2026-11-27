// "Cancel PO" asks why (owner, 27 Nov 2026): 28 of 147 orders had been
// cancelled and none said why. One tap on a reason, or a typed one — it is
// compulsory, saved on the order (cancel_reason, shown in its header) and
// written to its trail by cancel_po. The order stays on record, closed to
// edits and receiving. A tap outside does not close this box: the typed
// reason would be lost.
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { useModalLock } from '../../hooks/useModalLock';
import { useBackClose } from '../../hooks/useBackClose';
import type { PurchaseOrder, PurchaseOrderItem } from '../../types/database';

const PRESETS = [
  'Vendor cannot supply',
  'No longer needed',
  'Mistake in the order',
  'Merged into another order',
  'Ordering from another vendor',
];

export default function POCancelModal({ po, items, onClose, onCancelled, addToast }: {
  po: PurchaseOrder;
  items: PurchaseOrderItem[];
  onClose: () => void;
  onCancelled: () => void;
  addToast: (m: string, t?: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const errRef = useRef<HTMLDivElement>(null);
  useModalLock();
  useBackClose(true, onClose);
  useEffect(() => { if (error) errRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [error]);

  const say = (v: string) => { setReason(v); setError(''); };
  const arrived = items.some(it => Number(it.received_qty || 0) > 0);
  // Edit is for a draft, Revise and "Close remaining" for an order the vendor has; a closed order has neither.
  const open = ['approved', 'sent', 'partially_received'].includes(po.status);
  const fix = po.status === 'draft' ? 'Edit' : 'Revise';

  const submit = async () => {
    if (saving) return;
    setError('');
    const r = reason.trim();
    if (!r) { setError('Say why the order is being cancelled'); return; }
    setSaving(true);
    try {
      const { error: e } = await supabase.rpc('cancel_po', { p_po_id: po.id, p_reason: r });
      if (e) throw e;
      addToast(`PO #${po.po_number} cancelled`, 'success');
      onCancelled();
    } catch (e) { setError(friendlyError(e)); setSaving(false); return; }
    setSaving(false);
  };

  return createPortal(
    <div style={S.modalOverlay} onClick={e => e.stopPropagation()}>
      <div className="modal-inner" style={{ ...S.modalBox, width: 460, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={S.modalHead}>
          <span style={S.modalTitle}>Cancel PO #{po.po_number}?</span>
          <button type="button" onClick={onClose} style={S.modalClose} aria-label="Close">&#215;</button>
        </div>

        <div style={{ padding: '16px 18px', overflowY: 'auto', WebkitOverflowScrolling: 'touch', flex: 1, minHeight: 0 }}>
          <div style={{ fontSize: 12, color: T.tx2, lineHeight: 1.5, marginBottom: 12 }}>
            The order for <b style={{ color: T.tx }}>{po.vendor_name}</b> stays on record but is closed to further edits and receiving. This cannot be undone.
            {arrived && open
              ? ' Part of it has already arrived — “Close remaining” keeps what came and writes off only the rest.'
              : !arrived && (open || po.status === 'draft') ? ` If only a detail is wrong, keep the order and use ${fix} instead.` : ''}
          </div>

          <label style={S.fLabel}>Why? *</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '6px 0 8px' }}>
            {PRESETS.map(p => (
              <button key={p} type="button" className="touch44" onClick={() => say(p)} aria-pressed={reason === p}
                style={{ ...S.btnGhost, ...S.btnSm, minHeight: 32, padding: '5px 12px', fontSize: 11, borderRadius: 999, borderColor: reason === p ? T.ac3 : T.bd2, color: reason === p ? T.ac2 : T.tx3, background: reason === p ? T.ac3 : 'transparent' }}>
                {p}
              </button>
            ))}
          </div>
          <input value={reason} onChange={e => say(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submit(); }} maxLength={200}
            placeholder="Tap one above or type your own" aria-label="Reason for cancelling the order"
            style={{ ...S.fInput, width: '100%' }} />

          {error && <div ref={errRef} style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: T.re, marginTop: 10 }}>{error}</div>}
        </div>

        <div style={{ padding: '12px 18px', borderTop: `1px solid ${T.bd}`, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={{ ...S.btnGhost, minHeight: 44 }}>Keep order</button>
          <button type="button" onClick={submit} disabled={saving}
            style={{ ...S.btnDanger, minHeight: 44, pointerEvents: saving ? 'none' : 'auto', opacity: saving ? 0.5 : 1 }}>
            {saving ? 'Cancelling…' : 'Cancel PO'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
