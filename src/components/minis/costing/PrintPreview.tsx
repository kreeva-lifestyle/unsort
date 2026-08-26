// Full-screen print preview (house iframe pattern, no window.open) with
// Print / Save-as-PDF — serves both costing documents: the purchase plan
// and the product-costing sheet. The EDITOR validates before opening; by
// the time this renders, the html is good.
import { createPortal } from 'react-dom';
import { T, S } from '../../../lib/theme';

export default function PrintPreview({ title, html, onClose }: {
  title: string;
  html: string;
  onClose: () => void;
}) {
  const print = () => {
    const frame = document.getElementById('costing-print-frame') as HTMLIFrameElement | null;
    frame?.contentWindow?.focus();
    frame?.contentWindow?.print();
  };

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: '#060810', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', paddingTop: 'max(12px, env(safe-area-inset-top))', borderBottom: `1px solid ${T.bd}` }}>
        <div style={{ fontFamily: T.sora, fontSize: 14, fontWeight: 700, color: T.tx }}>{title}</div>
      </div>
      <iframe id="costing-print-frame" title={title} srcDoc={html} style={{ flex: 1, width: '100%', border: 'none', background: '#fff' }} />
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', padding: '10px 16px', paddingBottom: 'max(10px, env(safe-area-inset-bottom))', borderTop: `1px solid ${T.bd}` }}>
        <button onClick={onClose} style={{ ...S.btnGhost, flex: 1, maxWidth: 200, minHeight: 44 }}>Close</button>
        <button onClick={print} style={{ ...S.btnPrimary, flex: 1, maxWidth: 200, minHeight: 44 }}>Print / Save PDF</button>
      </div>
    </div>,
    document.body,
  );
}
