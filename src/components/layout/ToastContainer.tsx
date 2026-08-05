// Toast notification strip. Portalled to document.body: #root is
// position:fixed and therefore its own stacking context at z-index auto, so
// anything rendered inside it — no matter its z-index — paints BELOW every
// modal overlay portalled to body (z 200) and the full-screen PDF/kiosk
// overlays (z 10000). Errors during uploads were invisible behind the black
// sheet. z 20000 sits above all app overlays, below the fatal boot overlay.
import { createPortal } from 'react-dom';
import { T } from '../../lib/theme';

export default function ToastContainer({ toasts }: { toasts: any[] }) {
  return createPortal((
    <div className="toast-container" style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 20000, pointerEvents: 'none', display: 'flex', flexDirection: 'column' }}>
      {toasts.map((t: any) => (
        <div key={t.id} className={`toast-item${t.leaving ? ' leaving' : ''}`} style={{ background: 'rgba(12,16,28,0.95)', backdropFilter: 'blur(16px)', border: `1px solid ${T.bd2}`, borderRadius: 10, padding: '12px 16px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 8px 32px rgba(0,0,0,.55)', animation: 'toastIn .4s cubic-bezier(.2,1,.3,1)', marginBottom: 8, borderLeft: `3px solid ${t.type === 'error' ? T.re : t.type === 'info' ? T.bl : T.gr}`, color: T.tx, maxWidth: 'min(400px, calc(100vw - 32px))' }}>{t.message}</div>
      ))}
    </div>
  ), document.body);
}
