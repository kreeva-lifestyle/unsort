// Modal frame for Playbook: portal to body, .modal-inner (bottom sheet on
// phones, mobile.md §6), body scroll-lock, device Back closes it
// (useBackClose). V2 look: pbSheet glass over the scrim; desktop = centred
// modal (DESIGN.md §6), phone = sheet with grab handle + swipe-down to close.
// Scrim tap, ×, Back and Escape call onClose. `guard` (a filled form) turns
// off the two accidental closes — scrim tap and swipe-down — so a stray tap
// cannot wipe the form; ×, Back and Escape still close. `footer` sits under
// the scrolling body (flex: none), so the primary stays in view (mobile.md §6).
import { useId, useRef, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useBackClose } from '../../../hooks/useBackClose';
import { useModalLock } from '../../../hooks/useModalLock';
import { PB, pbIconBtn, pbScrim, pbSheet, pbTileTitle } from '../../pbTheme';
import { usePbDialog } from '../../hooks/usePbDialog';
import { useSheetDrag } from '../../hooks/useSheetDrag';
import { useIsPhone } from '../../hooks/useIsPhone';
import PbIcon from '../ui/PbIcon';

export default function PbModal({ open, title, onClose, children, width = 520, footer, guard = false }: {
  open: boolean; title: string; onClose: () => void; children: ReactNode; width?: number;
  footer?: ReactNode; guard?: boolean;
}) {
  useBackClose(open, onClose);
  useModalLock(open);
  const box = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  usePbDialog(open, box, head);
  const phone = useIsPhone();
  const drag = useSheetDrag(box, onClose, phone && !guard);
  if (!open) return null;
  return createPortal(
    <div onClick={guard ? undefined : onClose}
      style={{ ...pbScrim, position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: PB.sans }}>
      <div ref={box} className="modal-inner pb-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}
        onClick={e => e.stopPropagation()}
        style={{ ...pbSheet, width, maxWidth: 'calc(100vw - 32px)', maxHeight: '90dvh', borderRadius: PB.r.heroDesk, boxSizing: 'border-box' }}>
        <div onPointerDown={drag.onPointerDown} onPointerMove={drag.onPointerMove} onPointerUp={drag.onPointerUp} onPointerCancel={drag.onPointerCancel} style={{ flex: 'none', padding: phone ? '8px 16px 8px' : '20px 20px 12px', ...drag.style }}>
          {phone && <div aria-hidden="true" style={{ width: 36, height: 5, borderRadius: PB.r.handle, background: PB.handle, margin: '0 auto 16px' }} />}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <h2 ref={head} id={titleId} tabIndex={-1} style={{ ...pbTileTitle, minWidth: 0, overflowWrap: 'anywhere', outline: 'none' }}>{title}</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="pb-pill"
              style={{ ...pbIconBtn, width: 44, minWidth: 44, height: 44, minHeight: 44, color: PB.tx2 }}>
              <PbIcon name="x" size={18} />
            </button>
          </div>
        </div>
        <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', padding: footer ? (phone ? '4px 16px 16px' : '4px 20px 16px') : phone ? '4px 16px calc(16px + env(safe-area-inset-bottom))' : '4px 20px 20px' } as CSSProperties}>
          {children}
        </div>
        {footer != null && (
          <div style={{ flex: 'none', padding: phone ? '12px 16px calc(16px + env(safe-area-inset-bottom))' : '12px 20px 20px', borderTop: `1px solid ${PB.tileBd}` }}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
