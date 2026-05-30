// Toast notification strip
import { T } from '../../lib/theme';

export default function ToastContainer({ toasts }: { toasts: any[] }) {
  return (
    <div className="toast-container" style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 999, pointerEvents: 'none', display: 'flex', flexDirection: 'column' }}>
      {toasts.map((t: any) => (
        <div key={t.id} className={`toast-item${t.leaving ? ' leaving' : ''}`} style={{ background: 'rgba(12,16,28,0.95)', backdropFilter: 'blur(16px)', border: `1px solid ${T.bd2}`, borderRadius: 10, padding: '12px 16px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 8px 32px rgba(0,0,0,.55)', animation: 'toastIn .4s cubic-bezier(.2,1,.3,1)', marginBottom: 8, borderLeft: `3px solid ${t.type === 'error' ? T.re : t.type === 'info' ? T.bl : T.gr}`, color: T.tx, maxWidth: 'min(400px, calc(100vw - 32px))' }}>{t.message}</div>
      ))}
    </div>
  );
}
