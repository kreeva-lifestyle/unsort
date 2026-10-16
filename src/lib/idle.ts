// Run low-priority work once the browser is idle (or after a short delay
// where requestIdleCallback is missing, e.g. Safari): used to prefetch the
// code of forms and sheets after a page's list is on screen, so the first tap
// on one is instant without that code competing with the page's first paint.
export function whenIdle(fn: () => void, timeout = 2500): () => void {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
  if (w.requestIdleCallback) { const id = w.requestIdleCallback(fn, { timeout }); return () => w.cancelIdleCallback?.(id); }
  const t = setTimeout(fn, 1200);
  return () => clearTimeout(t);
}
