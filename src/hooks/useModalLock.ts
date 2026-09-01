// Body scroll-lock for portal modals (index.css: body.modal-open hides the
// FAB/bottom nav and freezes the page behind a bottom sheet).
//
// On close, the class is dropped ONLY when no other `.modal-inner` is still
// mounted: a confirm or picker that opens on top of an edit sheet must not
// unlock the page behind the sheet when it goes away.
import { useEffect } from 'react';

export function useModalLock(open = true) {
  useEffect(() => {
    if (!open) return;
    document.body.classList.add('modal-open');
    return () => {
      if (!document.querySelector('.modal-inner')) document.body.classList.remove('modal-open');
    };
  }, [open]);
}
