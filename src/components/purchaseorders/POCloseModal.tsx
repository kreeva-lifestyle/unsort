// "Close remaining" — end an order the vendor will never finish delivering.
// The balance is written off, the receipts that already happened stand, and
// the order leaves the pending list and the vendor pendency report. A reason
// is compulsory: a written-off balance nobody can explain is how disputes
// start. Cancel is the wrong tool for this — it voids the whole order.
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { useModalLock } from '../../hooks/useModalLock';
import { useBackClose } from '../../hooks/useBackClose';
import { poAuditLog } from './poAudit';
import type { PurchaseOrder, PurchaseOrderItem } from '../../types/database';

const PRESETS = [
  'Vendor delivered short',
  'Vendor cannot supply the balance',
  'No longer needed',
  'Balance rejected on quality',
];
const qty = (n: number) => Number.isInteger(n) ? String(n) : n.toFixed(2);
export const pendingOf = (it: PurchaseOrderItem) => Math.max(0, Number(it.quantity) - Number(it.received_qty || 0));

export default function POCloseModal({ po, items, onClose, onClosed, addToast }: {
  po: PurchaseOrder;
  items: PurchaseOrderItem[];
  onClose: () => void;
  onClosed: () => void;
  addToast: (m: string, t?: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const errRef = useRef<HTMLDivElement>(null);
  useModalLock();
  useBackClose(true, onClose);
  useEffect(() => { if (error) errRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [error]);

  const open = items.map(it => ({ it, pending: pendingOf(it) })).filter(x => x.pending > 0);
  const totalPending = open.reduce((s, x) => s + x.pending, 0);

  const submit = async () => {
    if (saving) return;
    setError('');
    const r = reason.trim();
    if (!r) { setError('Say why the balance is being closed'); return; }
    setSaving(true);
    try {
      const { error: e } = await supabase.rpc('close_po_short', { p_po_id: po.id, p_reason: r });
      if (e) throw new Error(e.message);
      await poAuditLog('CLOSED', po.id, `PO #${po.po_number} closed with ${qty(totalPending)} pending — ${r}`);
      addToast(`PO #${po.po_number} closed`, 'success');
      onClosed();
    } catch (e) { setError(friendlyError(e)); setSaving(false); return; }
    setSaving(false);
  };

  return createPortal(
    <div style={S.modalOverlay} onClick={onClose}>
      <div className="modal-inner" style={{ ...S.modalBox, width: 460 }} onClick={e => e.stopPropagation()}>
        <div style={S.modalHead}>
          <span style={S.modalTitle}>Close remaining · PO #{po.po_number}</span>
          <button type="button" onClick={onClose} style={S.modalClose} aria-label="Close">&#215;</button>
        </div>

        <div style={{ padding: '16px 18px', overflowY: 'auto', maxHeight: 'calc(90vh - 170px)' }}>
          <div style={{ fontSize: 12, color: T.tx2, lineHeight: 1.5, marginBottom: 12 }}>
            You are saying the rest of this order is not coming. What has already been received stays on record, and the order stops showing in the pending list and the vendor report.
          </div>

          <div style={{ border: `1px solid ${T.bd}`, borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
            {open.map(({ it, pending }) => (
              <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: `1px solid ${T.bd}`, fontSize: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: T.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.item_name}</div>
                  {it.sku && <div style={{ fontSize: 10, color: T.tx3, fontFamily: T.mono }}>{it.sku}</div>}
                </div>
                <div style={{ fontFamily: T.mono, color: T.yl, flexShrink: 0 }}>{qty(pending)}{it.unit ? ` ${it.unit}` : ''}</div>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', fontSize: 12, fontWeight: 700, color: T.tx }}>
              <span>Written off</span><span style={{ fontFamily: T.mono, color: T.yl }}>{qty(totalPending)}</span>
            </div>
          </div>

          <label style={S.fLabel}>Why? *</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '6px 0 8px' }}>
            {PRESETS.map(p => (
              <button key={p} type="button" onClick={() => setReason(p)}
                style={{ ...S.btnGhost, ...S.btnSm, minHeight: 32, padding: '5px 12px', fontSize: 11, borderRadius: 999, borderColor: reason === p ? T.ac3 : T.bd2, color: reason === p ? T.ac2 : T.tx3, background: reason === p ? T.ac3 : 'transparent' }}>
                {p}
              </button>
            ))}
          </div>
          <input value={reason} onChange={e => setReason(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submit(); }}
            placeholder="Tap one above or type your own" aria-label="Reason for closing"
            style={{ ...S.fInput, width: '100%' }} />

          {error && <div ref={errRef} style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: T.re, marginTop: 10 }}>{error}</div>}
        </div>

        <div style={{ padding: '12px 18px', borderTop: `1px solid ${T.bd}`, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={{ ...S.btnGhost, minHeight: 44 }}>Keep waiting</button>
          <button type="button" onClick={submit} disabled={saving}
            style={{ ...S.btnPrimary, minHeight: 44, pointerEvents: saving ? 'none' : 'auto', opacity: saving ? 0.5 : 1 }}>
            {saving ? 'Closing…' : 'Close remaining'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
