// Modal frame for Playbook's product screens: portal to body, .modal-inner (bottom
// sheet on phones), body scroll-lock, device Back closes it (useBackClose).
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { S } from '../../../lib/theme';
import { useBackClose } from '../../../hooks/useBackClose';
import { useModalLock } from '../../../hooks/useModalLock';

export default function PbModal({ open, title, onClose, children, width = 480 }: {
  open: boolean; title: string; onClose: () => void; children: ReactNode; width?: number;
}) {
  useBackClose(open, onClose);
  useModalLock(open);
  if (!open) return null;
  return createPortal(
    <div style={S.modalOverlay} onClick={onClose}>
      <div className="modal-inner" role="dialog" aria-modal="true" aria-label={title}
        style={{ ...S.modalBox, width }} onClick={e => e.stopPropagation()}>
        <div style={S.modalHead}>
          <h2 style={S.modalTitle}>{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" style={{ ...S.modalClose, width: 44, height: 44 }}>&#215;</button>
        </div>
        <div style={{ padding: 18 }}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
