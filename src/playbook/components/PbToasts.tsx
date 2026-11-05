// Playbook's own toasts (DailyWork's NotificationProvider lives in the hidden
// DailyWork tree). V2: pbSheet glass, radius 16, status dot + text, top of the
// screen inside the safe area, at most 4, tap to dismiss; success/info 4 s,
// error 7 s. Errors sit in a role="alert" region, the rest in role="status".
// Every error message must already be friendlyError()'d by the caller.
import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PB, pbSheet } from '../pbTheme';

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

const DOT: Record<PbToastType, string> = { success: PB.live, error: PB.failed, info: PB.busy };

function Item({ t, dismiss }: { t: Toast; dismiss: (id: number) => void }) {
  return (
    <button type="button" className="pb-toast pb-focus" onClick={() => dismiss(t.id)}
      style={{
        ...pbSheet, pointerEvents: 'auto', width: '100%', maxWidth: 420, textAlign: 'left', padding: '12px 16px', minHeight: 48,
        borderRadius: PB.r.toast, fontSize: 13, lineHeight: 1.5, fontFamily: PB.sans, cursor: 'pointer',
        display: 'flex', alignItems: 'flex-start', gap: 12, ...(t.type === 'error' ? { borderColor: PB.failedBd } : null),
      }}>
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 4, background: DOT[t.type], flexShrink: 0, marginTop: 7 }} />
      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{t.msg}</span>
    </button>
  );
}

export function PbToasts({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: number) => void }) {
  const col = { display: 'flex', flexDirection: 'column' as const, alignItems: 'flex-end', gap: 8, width: '100%' };
  return createPortal(
    <div style={{ position: 'fixed', top: 'max(12px, env(safe-area-inset-top))', right: 'max(12px, env(safe-area-inset-right))', left: 'max(12px, env(safe-area-inset-left))', zIndex: 300, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, pointerEvents: 'none' }}>
      <div role="alert" style={col}>{toasts.filter(t => t.type === 'error').map(t => <Item key={t.id} t={t} dismiss={dismiss} />)}</div>
      <div role="status" aria-live="polite" style={col}>{toasts.filter(t => t.type !== 'error').map(t => <Item key={t.id} t={t} dismiss={dismiss} />)}</div>
    </div>, document.body);
}
