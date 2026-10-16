// Print / save-as-PDF preview for Received on (same frame as the Purchase
// Order and Salary previews): the A4 document in an iframe, photos fetched
// first so they are in the PDF, a rate & amount switch for admin/manager
// (off by default), and Print / Save PDF through the print queue.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { T, S } from '../../lib/theme';
import { printOrQueue } from '../../lib/printQueue';
import { skuThumbUrl } from '../../lib/skuThumbs';
import { useModalLock } from '../../hooks/useModalLock';
import { useBackClose } from '../../hooks/useBackClose';
import Toggle from '../ui/Toggle';
import { buildReceivedPdf, type ReceivedDoc } from './receivedPdf';
import { fmtDate } from './jobworkModel';

export default function ReceivedPdfOverlay({ doc, boss, onClose, addToast }: {
  doc: Omit<ReceivedDoc, 'photos' | 'money'>; boss: boolean; onClose: () => void; addToast: (m: string, t?: string) => void;
}) {
  useModalLock(true);
  useBackClose(true, onClose);
  const [photos, setPhotos] = useState<Record<string, string | null> | null>(null);
  const [money, setMoney] = useState(false);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  useEffect(() => {
    let live = true;
    const skus = [...new Set(doc.rows.map(r => r.job?.sku).filter((s): s is string => !!s))];
    // skuThumbUrl never rejects: a SKU without a photo resolves to null.
    Promise.all(skus.map(s => skuThumbUrl(s).then(u => [s, u] as const))).then(pairs => { if (live) setPhotos(Object.fromEntries(pairs)); });
    return () => { live = false; };
  }, [doc.rows]);
  const html = useMemo(() => (photos ? buildReceivedPdf({ ...doc, photos, money: boss && money }) : ''), [doc, photos, money, boss]);
  const title = `Received ${fmtDate(doc.date)}${doc.vendor ? ` — ${doc.vendor}` : ''}`;
  const bar = (extra: React.CSSProperties): React.CSSProperties => ({ padding: '10px 16px', background: 'rgba(8,11,20,.95)', ...extra });

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: T.bg, display: 'flex', flexDirection: 'column', overscrollBehavior: 'contain' }}>
      <div style={bar({ paddingTop: 'max(12px, env(safe-area-inset-top))', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid rgba(255,255,255,.08)', backdropFilter: 'blur(20px)' })}>
        <span style={{ fontSize: 13, fontWeight: 600, color: T.tx, fontFamily: T.sora, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        {boss && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: money ? T.yl : T.tx3 }}>
            {money ? 'Amounts shown' : 'Amounts hidden'}
            <Toggle size="sm" on={money} label="Show rate and amount" onToggle={() => setMoney(m => !m)} />
          </label>
        )}
        <button type="button" onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,255,255,.08)', background: 'rgba(255,255,255,.04)', color: T.tx2, cursor: 'pointer', fontSize: 16 }} aria-label="Close">&times;</button>
      </div>
      {html
        ? <iframe ref={frameRef} srcDoc={html} style={{ flex: 1, border: 'none', width: '100%', background: '#fff' }} title="Received on — preview" />
        : <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: T.tx3 }}>Loading photos…</div>}
      <div style={bar({ paddingBottom: 'max(10px, env(safe-area-inset-bottom))', borderTop: '1px solid rgba(255,255,255,.08)', display: 'flex', gap: 8, justifyContent: 'center' })}>
        <button type="button" onClick={onClose} style={{ ...S.btnGhost, flex: 1, maxWidth: 200, minHeight: 44 }}>Close</button>
        <button type="button" disabled={!html} onClick={() => printOrQueue('document', html, 'A4', title, undefined, addToast, frameRef.current)}
          style={{ ...S.btnPrimary, flex: 1, maxWidth: 200, minHeight: 44, opacity: html ? 1 : 0.5, pointerEvents: html ? 'auto' : 'none' }}>Print / Save PDF</button>
      </div>
    </div>, document.body);
}
