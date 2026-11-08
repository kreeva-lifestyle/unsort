// Modal frame for Playbook: portal to body, .modal-inner (bottom sheet on
// phones, mobile.md §6), body scroll-lock, device Back closes it
// (useBackClose). V2 look: pbSheet glass over the scrim; desktop = centred
// modal (DESIGN.md §6), phone = sheet with grab handle + swipe-down to close.
// Scrim tap, ×, Back and Escape call onClose. `dirty` (typing in the form)
// turns off the two accidental closes — scrim tap and swipe-down — and makes
// ×, Back and Escape ask "Discard changes?" (`discardTitle` names the thing)
// instead of dropping the typing: Discard runs `onDiscardConfirm` (default
// onClose), Keep editing only closes the question. Device Back pops the
// question first; a second Back asks again. `footer` sits under the scrolling
// body (flex: none), so the primary stays in view (mobile.md §6).
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useBackClose } from '../../../hooks/useBackClose';
import { useModalLock } from '../../../hooks/useModalLock';
import { PB, pbBody, pbIconBtn, pbScrim, pbSheet, pbTileTitle } from '../../pbTheme';
import { usePbDialog } from '../../hooks/usePbDialog';
import { useSheetDrag } from '../../hooks/useSheetDrag';
import { useIsPhone } from '../../hooks/useIsPhone';
import PbButton from '../ui/PbButton';
import PbIcon from '../ui/PbIcon';
import { DISCARD_TITLE, discardAsk } from '../ui/discard';

type Props = {
  open: boolean; title: string; onClose: () => void; children: ReactNode; width?: number; footer?: ReactNode;
  /** Unsaved typing: scrim tap and swipe are off, and ×/Back/Escape ask first. */
  dirty?: boolean;
  /** The question, naming the thing: "Discard this product?" */
  discardTitle?: string;
  /** What Discard runs (reset the form, then close). Defaults to onClose. */
  onDiscardConfirm?: () => void;
};

export default function PbModal({ open, title, onClose, children, width = 520, footer, dirty = false, discardTitle = DISCARD_TITLE, onDiscardConfirm }: Props) {
  const [asking, setAsking] = useState(false);
  // ×, Escape (closeTopLayer) and device Back all land here. `force` = the page
  // itself is going away (closeAllLayers): nothing to ask then.
  const request = (force?: boolean): void | boolean => {
    if (dirty && !force) { setAsking(true); return false; }
    onClose();
  };
  const keep = () => setAsking(false);
  const discard = () => { setAsking(false); (onDiscardConfirm ?? onClose)(); };
  useEffect(() => { if (!open) setAsking(false); }, [open]);
  useBackClose(open, request);
  useModalLock(open);
  const box = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  usePbDialog(open, box, head);
  const phone = useIsPhone();
  const drag = useSheetDrag(box, onClose, phone && !dirty);
  if (!open) return null;
  const ask = discardAsk(discardTitle);
  const discardBtn = <PbButton kind="danger" block={phone} onClick={discard}>{ask.confirmLabel}</PbButton>;
  const keepBtn = <PbButton block={phone} autoFocus onClick={keep}>{ask.cancelLabel}</PbButton>;
  return createPortal(
    <div onClick={dirty ? undefined : onClose}
      style={{ ...pbScrim, position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: PB.sans }}>
      <div ref={box} className="modal-inner pb-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}
        onClick={e => e.stopPropagation()}
        style={{ ...pbSheet, width, maxWidth: 'calc(100vw - 32px)', maxHeight: '90dvh', borderRadius: PB.r.heroDesk, boxSizing: 'border-box' }}>
        <div onPointerDown={drag.onPointerDown} onPointerMove={drag.onPointerMove} onPointerUp={drag.onPointerUp} onPointerCancel={drag.onPointerCancel} style={{ flex: 'none', padding: phone ? '8px 16px 8px' : '20px 20px 12px', ...drag.style }}>
          {phone && <div aria-hidden="true" style={{ width: 36, height: 5, borderRadius: PB.r.handle, background: PB.handle, margin: '0 auto 16px' }} />}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <h2 ref={head} id={titleId} tabIndex={-1} style={{ ...pbTileTitle, minWidth: 0, overflowWrap: 'anywhere', outline: 'none' }}>{title}</h2>
            <button type="button" onClick={() => request()} aria-label="Close" className="pb-pill"
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
      {/* The "Discard changes?" question: the same frame, one level up. Focus starts on Keep editing, so a stray Enter never discards. */}
      <PbModal open={asking} title={ask.title} onClose={keep} width={440}
        footer={phone
          ? <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>{discardBtn}{keepBtn}</div>
          : <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, flexWrap: 'wrap' }}>{keepBtn}{discardBtn}</div>}>
        <p style={{ ...pbBody, fontSize: 14, color: 'inherit', margin: 0, overflowWrap: 'anywhere' }}>{ask.message}</p>
      </PbModal>
    </div>,
    document.body,
  );
}
