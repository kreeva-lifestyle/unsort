// The full-screen print preview every label / document uses: a header with
// the title and a close button, the rendered HTML in an iframe, and a
// Close + Print footer. `onPrint` gets the iframe so printOrQueue can print
// the frame already on screen (no second render). Portaled to body.
import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { T, S } from '../../lib/theme';

export default function PrintPreview({ title, html, onClose, onPrint, printLabel = 'Print', busy }: {
  title: string;
  html: string;
  onClose: () => void;
  onPrint: (frame: HTMLIFrameElement | null) => void;
  printLabel?: string;
  /** "Sending…": the Print button is disabled and shows this. */
  busy?: string;
}) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: T.bg, display: 'flex', flexDirection: 'column', overscrollBehavior: 'contain' }}>
      <div style={{ padding: '12px 16px', paddingTop: 'max(12px, env(safe-area-inset-top))', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, borderBottom: '1px solid rgba(255,255,255,.08)', background: 'rgba(8,11,20,.95)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: T.tx, fontFamily: T.sora, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        <button type="button" onClick={onClose} style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 8, border: '1px solid rgba(255,255,255,.08)', background: 'rgba(255,255,255,.04)', color: T.tx2, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-label="Close">&#215;</button>
      </div>
      <iframe ref={frame} title={title} srcDoc={html} style={{ flex: 1, border: 'none', width: '100%', background: '#fff' }} />
      <div style={{ padding: '10px 16px', paddingBottom: 'max(10px, env(safe-area-inset-bottom))', background: 'rgba(8,11,20,.95)', borderTop: '1px solid rgba(255,255,255,.08)', display: 'flex', gap: 10, justifyContent: 'center' }}>
        <button type="button" onClick={onClose} style={{ padding: '10px 24px', borderRadius: 8, border: '1px solid rgba(255,255,255,.08)', background: 'rgba(255,255,255,.04)', color: T.tx2, fontSize: 13, cursor: 'pointer', fontWeight: 500, flex: 1, maxWidth: 200 }}>Close</button>
        <button type="button" onClick={() => onPrint(frame.current)} style={{ ...S.btnPrimary, padding: '10px 24px', fontSize: 13, flex: 1, maxWidth: 200, pointerEvents: busy ? 'none' : 'auto', opacity: busy ? 0.5 : 1 }}>{busy || printLabel}</button>
      </div>
    </div>,
    document.body,
  );
}
