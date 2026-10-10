// The app's motion vocabulary (Motion Lab 01): five durations, four curves,
// and one Web Animations helper that honours Reduce Motion — movement is
// stripped, fades stay — and never throws. index.css carries the same
// values as --m-* / --e-* for CSS transitions.
export const M = { instant: 90, fast: 160, base: 220, slow: 320, emph: 450 } as const;
export const E = {
  out: 'cubic-bezier(.2,.9,.3,1)', emph: 'cubic-bezier(.16,1,.3,1)',
  in: 'cubic-bezier(.4,0,1,1)', spring: 'cubic-bezier(.34,1.56,.64,1)',
} as const;

export const reducedMotion = (): boolean => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

const MOVE = ['transform', 'translate', 'scale', 'rotate'];
export interface Motion { finished: Promise<unknown>; cancel: () => void }
const NOOP: Motion = { finished: Promise.resolve(), cancel: () => {} };

/** `el.animate` with the house rules: under Reduce Motion the transform
 *  keys are dropped (a pure movement becomes nothing, a fade stays); a
 *  missing element or an unsupported browser yields a finished no-op. */
export function animate(el: Element | null | undefined, frames: Keyframe[], opts: KeyframeAnimationOptions = {}, keepMotion = false): Motion {
  if (!el || typeof el.animate !== 'function') return NOOP;
  let f = frames;
  if (reducedMotion() && !keepMotion) {
    f = frames.map(k => { const c: Keyframe = { ...k }; for (const p of MOVE) delete (c as Record<string, unknown>)[p]; return c; });
    if (!f.some(k => Object.keys(k).some(p => p !== 'offset' && p !== 'easing' && p !== 'composite'))) return NOOP;
  }
  try {
    const a = el.animate(f, { duration: M.base, ...opts });
    // A cancelled animation rejects `finished`; callers never need to care.
    return { finished: a.finished.catch(() => undefined), cancel: () => a.cancel() };
  } catch { return NOOP; }
}
