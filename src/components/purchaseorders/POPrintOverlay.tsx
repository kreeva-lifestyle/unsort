// The PO print / share preview: an iframe with the A4 HTML, a rates switch
// (OFF by default — the document that reaches a vendor must not carry rates
// or totals, owner's rule; the switch turns them on for an internal copy),
// Print through the queue and Share as an image. After a share of an
// approved order, "Mark as sent?" (owner's ask — orders shared but never
// marked sent stayed "To send"); never on a cancelled share. Split out of
// pages/PurchaseOrders.tsx so the page stays under the 200-line limit.
import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { printOrQueue } from '../../lib/printQueue';
import Toggle from '../ui/Toggle';
import ConfirmModal, { useConfirm } from '../ui/ConfirmModal';
import { buildPoPdf } from './poPdf';
import { sharePoImage } from './poImage';
import type { PurchaseOrder, PurchaseOrderItem } from '../../types/database';

export default function POPrintOverlay({ po, items, canManage, onClose, onSent, addToast }: {
  po: PurchaseOrder; items: PurchaseOrderItem[];
  /** Marking sent is an admin / manager step (the server checks it too). */
  canManage: boolean;
  onClose: () => void;
  /** The order was marked sent from here: re-read it. */
  onSent: () => void | Promise<void>;
  addToast: (m: string, t?: string) => void;
}) {
  const [rates, setRates] = useState(false);
  const [sharing, setSharing] = useState(false);
  const { ask, modalProps } = useConfirm();
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const html = useMemo(() => buildPoPdf(po, items, { rates }), [po, items, rates]);
  const bar = (extra: React.CSSProperties): React.CSSProperties => ({ padding: '10px 16px', background: 'rgba(8,11,20,.95)', ...extra });

  // share() goes first, straight from the tap (nothing slow before it, or the
  // phone drops the share); the question comes after it settles.
  const share = async () => {
    if (sharing) return;
    setSharing(true);
    const out = await sharePoImage(po, items, addToast, { rates });
    if ((out === 'shared' || out === 'downloaded') && po.status === 'approved' && canManage) {
      const yes = await ask({ title: `Mark PO #${po.po_number} as sent?`, message: 'Once the vendor has the order, mark it sent — the list then shows it as With vendor and starts counting its due date.', confirmLabel: 'Mark sent', cancelLabel: 'Not yet' });
      if (yes) {
        const { error } = await supabase.rpc('set_po_status', { p_po_id: po.id, p_status: 'sent' });
        if (error) addToast(friendlyError(error), 'error');
        else { addToast(`PO #${po.po_number} marked sent`, 'success'); await onSent(); }
      }
    }
    setSharing(false);
  };

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: T.bg, display: 'flex', flexDirection: 'column', overscrollBehavior: 'contain' }}>
      <div style={bar({ padding: '12px 16px', paddingTop: 'max(12px, env(safe-area-inset-top))', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,.08)', backdropFilter: 'blur(20px)' })}>
        <span style={{ fontSize: 13, fontWeight: 600, color: T.tx, fontFamily: T.sora }}>Purchase Order</span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: rates ? T.yl : T.tx3, marginLeft: 'auto', marginRight: 12 }}>
          {rates ? 'Rates shown' : 'Rates hidden'}
          <Toggle size="sm" on={rates} label="Show rates" onToggle={() => setRates(r => !r)} />
        </label>
        <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,255,255,.08)', background: 'rgba(255,255,255,.04)', color: T.tx2, cursor: 'pointer', fontSize: 16 }} aria-label="Close">&times;</button>
      </div>
      <iframe ref={frameRef} srcDoc={html} style={{ flex: 1, border: 'none', width: '100%', background: '#fff' }} title="Purchase Order preview" />
      <div style={bar({ paddingBottom: 'max(10px, env(safe-area-inset-bottom))', borderTop: '1px solid rgba(255,255,255,.08)', display: 'flex', gap: 8, justifyContent: 'center' })}>
        <button onClick={onClose} style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid rgba(255,255,255,.08)', background: 'rgba(255,255,255,.04)', color: T.tx2, fontSize: 13, cursor: 'pointer', fontWeight: 500, flex: 1, maxWidth: 130 }}>Close</button>
        <button onClick={() => printOrQueue('document', html, 'A4', 'Purchase Order', undefined, addToast, frameRef.current)} style={{ padding: '10px 18px', borderRadius: 8, border: `1px solid ${T.ac3}`, background: T.ac3, color: T.ac2, fontSize: 13, fontWeight: 600, cursor: 'pointer', flex: 1, maxWidth: 130 }}>Print</button>
        <button onClick={share} style={{ padding: '10px 18px', borderRadius: 8, border: 'none', ...S.btnPrimary, fontSize: 13, flex: 1, maxWidth: 130, opacity: sharing ? 0.5 : 1, pointerEvents: sharing ? 'none' : 'auto' }}>{sharing ? 'Sharing…' : 'Share'}</button>
      </div>
      {/* Above the preview, which sits at 10000. */}
      <ConfirmModal {...modalProps} zIndex={10001} />
    </div>, document.body);
}
