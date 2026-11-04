// Playbook's own toasts (DailyWork's NotificationProvider lives in the hidden DailyWork tree).
import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { T } from '../../lib/theme';

export type PbToastType = 'success' | 'error' | 'info';
export type AddToast = (msg: string, type?: PbToastType) => void;
type Toast = { id: number; msg: string; type: PbToastType };

export function usePbToasts(): { addToast: AddToast; toasts: Toast[]; dismiss: (id: number) => void } {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const n = useRef(0);
  const dismiss = useCallback((id: number) => setToasts(t => t.filter(x => x.id !== id)), []);
  const addToast = useCallback<AddToast>((msg, type = 'info') => {
    const id = ++n.current;
    setToasts(t => [...t.slice(-3), { id, msg, type }]);
    setTimeout(() => dismiss(id), type === 'error' ? 7000 : 4000);
  }, [dismiss]);
  return { addToast, toasts, dismiss };
}

export function PbToasts({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: number) => void }) {
  return createPortal(
    <div role="status" aria-live="polite" style={{ position: 'fixed', top: 'max(12px, env(safe-area-inset-top))', right: 12, left: 12, zIndex: 300, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, pointerEvents: 'none' }}>
      {toasts.map(t => {
        const c = t.type === 'success' ? T.gr : t.type === 'error' ? T.re : T.bl;
        return (
          <button key={t.id} type="button" onClick={() => dismiss(t.id)}
            style={{ pointerEvents: 'auto', maxWidth: 420, textAlign: 'left', padding: '10px 14px', minHeight: 44, borderRadius: T.r, background: T.s2, border: `1px solid ${T.bd2}`, borderLeft: `3px solid ${c}`, color: T.tx, fontSize: 12, fontFamily: T.sans, boxShadow: '0 8px 24px rgba(0,0,0,.4)', cursor: 'pointer' }}>
            {t.msg}
          </button>
        );
      })}
    </div>, document.body);
}
