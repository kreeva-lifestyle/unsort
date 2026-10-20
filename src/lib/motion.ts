// The app's motion vocabulary (Motion Lab 01): five durations, four curves,
// and one Web Animations helper that honours Reduce Motion — movement is
// stripped, fades stay — and never throws. index.css carries the same
// values as --m-* / --e-* for CSS transitions.
export const M = { instant: 90, fast: 160, base: 220, slow: 320, emph: 450 } as const;
// The settle spring: a damped spring (ζ .62, ω 9.6) sampled into linear(),
// so a stop wobbles once before it rests. Browsers without linear() (before
// Safari 17.2) keep the single-overshoot cubic-bezier, here and in --e-spring.
const spring = (() => {
  const fallback = 'cubic-bezier(.34,1.56,.64,1)';
  try {
    const z = 0.62, w = 9.6, wd = w * Math.sqrt(1 - z * z), n = 40, pts: number[] = [];
    for (let i = 0; i <= n; i++) { const t = i / n; pts.push(+(1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + (z * w / wd) * Math.sin(wd * t))).toFixed(4)); }
    pts[n] = 1;
    const s = `linear(${pts.join(', ')})`;
    if (!CSS.supports('transition-timing-function', s)) return fallback;
    document.documentElement.style.setProperty('--e-spring', s);
    return s;
  } catch { return fallback; }
})();
export const E = {
  out: 'cubic-bezier(.2,.9,.3,1)', emph: 'cubic-bezier(.16,1,.3,1)',
  in: 'cubic-bezier(.4,0,1,1)', spring,
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
