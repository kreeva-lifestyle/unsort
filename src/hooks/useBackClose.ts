// One history entry per open layer (modal, full-screen overlay, sub-view), so
// the device Back button closes exactly ONE level instead of leaving the page.
//
// Why a single module-level stack + ONE window listener: every page used to
// register its own bare `popstate` handler, and because pages are kept mounted
// (App.tsx hides them with display:none) a single Back press fired ALL of them
// — closing half-filled forms in tabs the user wasn't even looking at. A DOM
// event can't be addressed to one listener, so ownership has to be explicit:
// each layer carries an incrementing navId, and a pop only closes layers whose
// id is above the entry we landed on.
//
// The in-app close button and the device Back run the SAME path: closing from
// inside pops our history entry (so Back is never left "dead"), and closing via
// Back skips that pop because the entry is already gone.
import { useEffect, useRef } from 'react';

type Layer = { id: number; close: () => void };

let seq = 0;
const stack: Layer[] = [];
let wired = false;

const currentNavId = (): number => (window.history.state?.navId as number | undefined) ?? 0;

// An entry whose layer is gone (closed out of order, or left behind by a tab
// switch). navId 0 is a real page/tab entry and is never dead.
const isDeadEntry = (): boolean => {
  const cur = currentNavId();
  return cur !== 0 && !stack.some(l => l.id === cur);
};

function wire() {
  if (wired) return;
  wired = true;
  window.addEventListener('popstate', () => {
    // Close every layer we just navigated back past, topmost first. Nested
    // layers (modal over a sub-view) therefore unwind one press at a time.
    while (stack.length && stack[stack.length - 1].id > currentNavId()) {
      stack.pop()!.close();
    }
    // Landing on an orphaned entry would cost the user a Back press that does
    // nothing visible, so skip straight past it. ids only decrease going back,
    // so this always terminates at a real page entry.
    if (isDeadEntry()) window.history.back();
  });
}

// Closes every open layer without touching history — used when the tab changes,
// so a modal can never outlive the page it belongs to (it is portalled to
// document.body and would otherwise float over the next tab). The entries it
// leaves behind are skipped by the dead-entry check above.
export function closeAllLayers() {
  while (stack.length) stack.pop()!.close();
}

export function hasOpenLayers(): boolean {
  return stack.length > 0;
}

// Closes the topmost layer, if any. Used by the global Escape handler. It goes
// through the layer's own close(), so the unmount cleanup below owns the
// history pop — exactly the same path as tapping ×.
export function closeTopLayer(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.close();
  return true;
}

/**
 * Give an open layer its own history entry.
 * @param open  true while the layer is on screen
 * @param close what to run when the device/browser Back dismisses it
 */
export function useBackClose(open: boolean, close: () => void) {
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (!open) return;
    wire();
    const id = ++seq;
    const layer: Layer = { id, close: () => closeRef.current() };
    // One layer replacing another in the same commit (challan detail → edit
    // form) must REUSE the entry it is standing on, not stack a second one —
    // otherwise Back closes the new layer and then hits the old layer's
    // orphaned entry.
    const reuse = isDeadEntry();
    stack.push(layer);
    if (reuse) window.history.replaceState({ navId: id }, '');
    else window.history.pushState({ navId: id }, '');

    return () => {
      const i = stack.indexOf(layer);
      if (i === -1) return; // already unwound by Back — its entry is gone too
      stack.splice(i, 1);
      // Closed from inside the app: drop our entry so Back isn't a dead press.
      // Deferred, because a replacement layer opening in this same commit
      // takes the entry over (above) and there is then nothing to pop.
      if (currentNavId() === id) {
        queueMicrotask(() => { if (currentNavId() === id) window.history.back(); });
      }
    };
  }, [open]);
}
