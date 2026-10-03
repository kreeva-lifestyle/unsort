// Full-screen print preview (house iframe pattern, no window.open) with
// Print / Save-as-PDF — serves both costing documents: the purchase plan
// and the product-costing sheet. The EDITOR validates before opening; by
// the time this renders, the html is good. With `onShare` a Share button
// sends the document as an image through the phone's share sheet (same
// as the Purchase Order overlay).
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { T, S } from '../../../lib/theme';
import { useBackClose } from '../../../hooks/useBackClose';

export default function PrintPreview({ title, html, onClose, onShare }: {
  title: string;
  html: string;
  onClose: () => void;
  onShare?: () => Promise<void>;
}) {
  const [sharing, setSharing] = useState(false);
  // Device Back closes the preview only, never the sheet or tool under it.
  useBackClose(true, onClose);
  const print = () => {
    const frame = document.getElementById('costing-print-frame') as HTMLIFrameElement | null;
    frame?.contentWindow?.focus();
    frame?.contentWindow?.print();
  };
  const share = () => {
    if (!onShare || sharing) return;
    setSharing(true);
    onShare().finally(() => setSharing(false));
  };

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: '#060810', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', paddingTop: 'max(12px, env(safe-area-inset-top))', borderBottom: `1px solid ${T.bd}` }}>
        <div style={{ fontFamily: T.sora, fontSize: 14, fontWeight: 700, color: T.tx }}>{title}</div>
      </div>
      <iframe id="costing-print-frame" title={title} srcDoc={html} style={{ flex: 1, width: '100%', border: 'none', background: '#fff' }} />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', padding: '10px 16px', paddingBottom: 'max(10px, env(safe-area-inset-bottom))', borderTop: `1px solid ${T.bd}` }}>
        <button onClick={onClose} style={{ ...S.btnGhost, flex: 1, maxWidth: 160, minHeight: 44 }}>Close</button>
        {onShare
          ? <>
              <button onClick={print} style={{ ...S.btnGhost, flex: 1, maxWidth: 160, minHeight: 44, border: `1px solid ${T.ac3}`, background: T.ac3, color: T.ac2, fontWeight: 600 }}>Print / PDF</button>
              <button onClick={share} style={{ ...S.btnPrimary, flex: 1, maxWidth: 160, minHeight: 44, opacity: sharing ? 0.5 : 1, pointerEvents: sharing ? 'none' : 'auto' }}>{sharing ? 'Sharing…' : 'Share'}</button>
            </>
          : <button onClick={print} style={{ ...S.btnPrimary, flex: 1, maxWidth: 200, minHeight: 44 }}>Print / Save PDF</button>}
      </div>
    </div>,
    document.body,
  );
}
