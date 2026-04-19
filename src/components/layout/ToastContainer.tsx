// Toast notification strip
import { T } from '../../lib/theme';

export default function ToastContainer({ toasts }: { toasts: any[] }) {
  return (
    <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 999 }}>
      {toasts.map((t: any) => (
        <div key={t.id} style={{ background: 'rgba(12,16,28,0.95)', backdropFilter: 'blur(16px)', border: `1px solid ${T.bd2}`, borderRadius: 6, padding: '8px 14px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 7, boxShadow: '0 4px 20px rgba(0,0,0,.5)', animation: 'su .18s ease', marginBottom: 6, borderLeft: `2px solid ${t.type === 'error' ? T.re : T.gr}`, color: T.tx, maxWidth: 'calc(100vw - 32px)' }}>{t.message}</div>
      ))}
    </div>
  );
}
