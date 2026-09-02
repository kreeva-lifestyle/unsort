// iOS home-screen ("standalone") web apps: the FIRST time the software
// keyboard opens, WebKit shrinks the layout viewport by the status-bar height
// (852 → 793 on an iPhone 15 Pro, 932 → 873 on a Pro Max) and never grows it
// back until the app is force-quit. innerHeight, visualViewport.height, 100dvh
// and env(safe-area-inset-bottom) all drop together, so every screen shows a
// dead band below the bottom nav and every bottom sheet stops short — the
// owner's screenshots, exactly 59pt tall.
//
// CSS cannot see the real height in that state (dvh is wrong too), and
// nudging a fixed element does not make WebKit re-measure. What does: after
// the keyboard closes, flip `display` off → on on a full-viewport-height
// element with a synchronous reflow in between — WebKit recomputes the
// viewport and the canvas snaps back to its real height. (Re-navigating in an
// SPA has the same effect for the same reason.)
//
// `#root` is that element: position:absolute; inset:0 inside the 100dvh body.
// A display:none round-trip destroys scroll boxes, so scroll positions of the
// page scroller and any open sheet are saved and put back in the same task —
// nothing paints in between, so there is no flicker.
import { useEffect } from 'react';

// Exposed for the ?vpdebug overlay.
export const viewportRestoreStats = { maxH: 0, restores: 0, lastReason: '' };

const isTextField = (el: Element | null): boolean => {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT') { const t = (el as HTMLInputElement).type; return !['button', 'checkbox', 'radio', 'submit', 'range', 'file', 'color'].includes(t); }
  return tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable;
};

const keyboardOpen = (): boolean => {
  if (isTextField(document.activeElement)) return true;
  const vv = window.visualViewport;
  return !!vv && window.innerHeight - vv.height > 100;
};

export function restoreViewport(reason: string): boolean {
  const root = document.getElementById('root');
  if (!root) return false;
  const scrollers = [document.querySelector('main'), ...Array.from(document.querySelectorAll('.modal-inner'))]
    .filter((e): e is HTMLElement => !!e)
    .map(e => [e, e.scrollTop] as const);
  root.style.display = 'none';
  void root.offsetHeight;                  // synchronous reflow while hidden
  root.style.display = '';
  void root.offsetHeight;
  for (const [e, top] of scrollers) e.scrollTop = top;
  viewportRestoreStats.restores += 1;
  viewportRestoreStats.lastReason = reason;
  return window.innerHeight >= viewportRestoreStats.maxH - 1;
}

export function useViewportRestore(): void {
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const track = () => { if (!keyboardOpen()) viewportRestoreStats.maxH = Math.max(viewportRestoreStats.maxH, window.innerHeight); };
    const shrunk = () => viewportRestoreStats.maxH > 0 && window.innerHeight < viewportRestoreStats.maxH - 1 && !keyboardOpen();
    const check = (reason: string) => {
      clearTimeout(t);
      t = setTimeout(() => {
        track();
        if (!shrunk()) return;
        if (restoreViewport(reason)) return;
        // One retry: iOS sometimes reports the old height for a beat after the
        // keyboard animation ends. Never loop beyond this.
        clearTimeout(retry);
        retry = setTimeout(() => { if (shrunk()) restoreViewport(reason + '+retry'); }, 300);
      }, 150);
    };
    track();
    const onFocusOut = () => check('focusout');
    const onVvResize = () => check('vv-resize');
    const onResize = () => check('resize');
    const onShow = () => check('pageshow');
    const onVis = () => { if (document.visibilityState === 'visible') check('visible'); };
    window.addEventListener('focusout', onFocusOut, true);
    window.visualViewport?.addEventListener('resize', onVvResize);
    window.addEventListener('resize', onResize);
    window.addEventListener('pageshow', onShow);
    document.addEventListener('visibilitychange', onVis);
    check('mount');
    return () => {
      clearTimeout(t); clearTimeout(retry);
      window.removeEventListener('focusout', onFocusOut, true);
      window.visualViewport?.removeEventListener('resize', onVvResize);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pageshow', onShow);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);
}
