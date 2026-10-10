// The branded launch (Motion Lab 09). index.html paints the splash before
// any script: the gold AD crest centred, the wordmark under it. This takes
// over the moment the bundle runs: the crest catches one sheen, then, as
// soon as the app's header is up, flies into its brand slot while the
// splash fades and the app shows underneath. One move, once per cold
// start, never looping. A timeout means the splash can never get stuck;
// Reduce Motion makes it a plain crossfade; public pages (short links, the
// rate card, password recovery) and the sign-in page skip the fly.
import { animate, E, M, reducedMotion } from './motion';

const SLOT = '#brand-slot';          // the header's crest (Header.tsx)
const END = '[data-launch-end]';     // a page that has no header (sign-in)
const SHEEN_MS = 1050;               // the sheen is over by then
const GIVE_UP_MS = 3000;             // the app is slow: show it anyway

export function runLaunch(): void {
  const splash = document.getElementById('splash'), crest = document.getElementById('splash-crest'), sheen = document.getElementById('splash-sheen');
  if (!splash) return;
  const html = document.documentElement;
  const remove = () => { html.classList.remove('launching'); splash.remove(); crest?.remove(); };
  if (/^#\/(s|rc)\//.test(location.hash) || location.hash.includes('type=recovery')) { remove(); return; }
  html.classList.add('launching');   // keeps the header slot invisible until the crest lands
  const rm = reducedMotion();
  if (!rm) animate(sheen, [{ transform: 'translateX(-10%)' }, { transform: 'translateX(290%)' }], { duration: 700, delay: 300, easing: 'cubic-bezier(.45,0,.25,1)' });

  let obs: MutationObserver | null = null;
  const ready = new Promise<HTMLElement | null>(resolve => {
    const check = () => {
      const slot = document.querySelector<HTMLElement>(SLOT);
      if (slot) { resolve(slot); return true; }
      if (document.querySelector(END)) { resolve(null); return true; }
      return false;
    };
    if (check()) return;
    obs = new MutationObserver(() => { if (check()) obs?.disconnect(); });
    obs.observe(document.body, { childList: true, subtree: true });
  });
  const minShow = new Promise<void>(r => setTimeout(r, rm ? 500 : SHEEN_MS));
  const giveUp = new Promise<null>(r => setTimeout(() => r(null), GIVE_UP_MS));

  Promise.all([minShow, Promise.race([ready, giveUp])]).then(([, slot]) => {
    obs?.disconnect();
    const texts = [...splash.querySelectorAll<HTMLElement>('.splash-text')];
    if (slot && crest && !rm) {
      const c = crest.getBoundingClientRect(), t = slot.getBoundingClientRect();
      if (c.width > 0 && t.width > 0) {
        const fly = animate(crest, [{ transform: 'translate(0,0) scale(1)' }, { transform: `translate(${t.left - c.left}px,${t.top - c.top}px) scale(${t.width / c.width})` }], { duration: M.emph, easing: E.emph, fill: 'forwards' }, true);
        texts.forEach(el => animate(el, [{ opacity: 1 }, { opacity: 0 }], { duration: M.fast, fill: 'forwards' }));
        animate(splash, [{ opacity: 1 }, { opacity: 0 }], { duration: M.slow, delay: 80, easing: E.out, fill: 'forwards' });
        fly.finished.then(remove);
        return;
      }
    }
    // No slot (sign-in, a slow app, Reduce Motion): a plain crossfade.
    animate(splash, [{ opacity: 1 }, { opacity: 0 }], { duration: M.base, fill: 'forwards' });
    animate(crest, [{ opacity: 1 }, { opacity: 0 }], { duration: M.base, fill: 'forwards' }).finished.then(remove);
  });
}
