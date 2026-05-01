// In-app replacement for window.confirm — async, theme-styled, danger-aware.
// Usage:
//   const [confirmState, askConfirm] = useConfirm();
//   if (await askConfirm({ title: 'Delete?', message: '...', danger: true })) { ... }
//   <ConfirmModal {...confirmState} />
import { useCallback, useEffect, useRef, useState } from 'react';
import { T, S } from '../../lib/theme';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface ConfirmModalProps extends ConfirmOptions {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      else if (e.key === 'Enter') onConfirm();
    };
    window.addEventListener('keydown', h);
    confirmRef.current?.focus();
    return () => window.removeEventListener('keydown', h);
  }, [open, onCancel, onConfirm]);

  if (!open) return null;

  return (
    <div style={S.modalOverlay} onClick={onCancel}>
      <div className="modal-inner" style={{ ...S.modalBox, width: 420 }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '18px 20px 14px', borderBottom: `1px solid ${T.bd}` }}>
          <div style={{ fontSize: 14, fontWeight: 700, fontFamily: T.sora, color: danger ? T.re : T.tx }}>{title}</div>
          {message && (
            <div style={{ fontSize: 12, color: T.tx2, marginTop: 8, lineHeight: 1.55 }}>{message}</div>
          )}
        </div>
        <div style={{ padding: '12px 20px', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={S.btnGhost}>{cancelLabel}</button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            style={danger ? { ...S.btnDanger, fontWeight: 600 } : S.btnPrimary}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// Hook for ergonomic async usage. Returns the modal props and an `ask` fn.
export function useConfirm() {
  const [state, setState] = useState<ConfirmOptions & { open: boolean }>({
    open: false,
    title: '',
  });
  const resolverRef = useRef<((v: boolean) => void) | null>(null);

  const ask = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setState({ ...opts, open: true });
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    setState(s => ({ ...s, open: false }));
    resolverRef.current?.(value);
    resolverRef.current = null;
  }, []);

  const modalProps: ConfirmModalProps = {
    ...state,
    onConfirm: () => settle(true),
    onCancel: () => settle(false),
  };

  return { ask, modalProps };
}
