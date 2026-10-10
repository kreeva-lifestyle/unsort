// The PO print / share preview: an iframe with the A4 HTML, a rates switch
// (OFF by default — the document that reaches a vendor must not carry rates
// or totals, owner's rule; the switch turns them on for an internal copy),
// Print through the queue and Share as an image. Split out of
// pages/PurchaseOrders.tsx so the page stays under the 200-line limit.
import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { T, S } from '../../lib/theme';
import { printOrQueue } from '../../lib/printQueue';
import Toggle from '../ui/Toggle';
import { buildPoPdf } from './poPdf';
import { sharePoImage } from './poImage';
import type { PurchaseOrder, PurchaseOrderItem } from '../../types/database';

export default function POPrintOverlay({ po, items, onClose, addToast }: {
  po: PurchaseOrder; items: PurchaseOrderItem[]; onClose: () => void; addToast: (m: string, t?: string) => void;
}) {
  const [rates, setRates] = useState(false);
  const [sharing, setSharing] = useState(false);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const html = useMemo(() => buildPoPdf(po, items, { rates }), [po, items, rates]);
  const bar = (extra: React.CSSProperties): React.CSSProperties => ({ padding: '10px 16px', background: 'rgba(8,11,20,.95)', ...extra });
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
        <button onClick={() => { if (sharing) return; setSharing(true); sharePoImage(po, items, addToast, { rates }).finally(() => setSharing(false)); }} style={{ padding: '10px 18px', borderRadius: 8, border: 'none', ...S.btnPrimary, fontSize: 13, flex: 1, maxWidth: 130, opacity: sharing ? 0.5 : 1, pointerEvents: sharing ? 'none' : 'auto' }}>{sharing ? 'Sharing…' : 'Share'}</button>
      </div>
    </div>, document.body);
}
