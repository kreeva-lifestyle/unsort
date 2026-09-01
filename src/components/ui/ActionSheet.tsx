// Mobile row-action sheet: a short list of 44px buttons for one record.
// Pages whose desktop table hides its Actions column on phones (Brand Tags)
// open this on row tap so Edit / Print / Delete stay reachable by thumb.
// Renders as a bottom sheet via the shared .modal-inner mobile CSS.
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { T, S } from '../../lib/theme';
import { useBackClose } from '../../hooks/useBackClose';
import { useModalLock } from '../../hooks/useModalLock';

export interface SheetAction {
  label: string;
  onClick: () => void;
  color?: string;   // text colour; defaults to T.tx
  danger?: boolean; // red text + separated from the rest
}

interface ActionSheetProps {
  open: boolean;
  title: string;
  subtitle?: string;
  actions: SheetAction[];
  onClose: () => void;
}

export default function ActionSheet({ open, title, subtitle, actions, onClose }: ActionSheetProps) {
  useBackClose(open, onClose);
  useModalLock(open);
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div style={S.modalOverlay} onClick={onClose}>
      <div className="modal-inner" style={{ ...S.modalBox, width: 360 }} onClick={e => e.stopPropagation()}>
        <div style={S.modalHead}>
          <div style={{ minWidth: 0 }}>
            <div style={{ ...S.modalTitle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
            {subtitle && <div style={{ fontSize: 11, color: T.tx3, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</div>}
          </div>
          <button type="button" onClick={onClose} style={S.modalClose} aria-label="Close">&#215;</button>
        </div>
        <div style={{ padding: '8px 10px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {actions.map((a, i) => (
            <button
              key={i}
              type="button"
              onClick={() => { onClose(); a.onClick(); }}
              style={{
                minHeight: 44, padding: '10px 14px', textAlign: 'left', fontSize: 13, fontWeight: 500,
                fontFamily: T.sans, cursor: 'pointer', borderRadius: T.r,
                background: 'rgba(255,255,255,0.02)', border: `1px solid ${a.danger ? 'rgba(239,68,68,.2)' : T.bd}`,
                color: a.danger ? T.re : (a.color || T.tx),
                marginTop: a.danger && i > 0 ? 6 : 0,
              }}
            >{a.label}</button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
