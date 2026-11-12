// Keeps the on-screen keyboard's height in --pb-kb (on <html>, so portalled
// sheets read it too) and toggles html.pb-kb while it is open, which hides the
// tab bar (design/mobile.md §7). Mount once in PlaybookApp.
import { useEffect } from 'react';

export function useKeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const sync = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      root.style.setProperty('--pb-kb', `${Math.round(kb)}px`);
      root.classList.toggle('pb-kb', kb > 120);
    };
    // A focused field inside a sheet or form: bring it into view once the keyboard has opened (300 ms).
    // In a sheet, the middle of the sheet's own scrolling body is visible (the sheet sits on the keyboard).
    // On a page, the keyboard covers the bottom of the screen and the sticky save bar sits just above it,
    // about where the middle of the screen is: there the field goes to the upper quarter of what is visible.
    let t: number | undefined;
    const onFocus = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el || !el.matches?.('input, textarea, select') || !el.closest('.pb-scroll, .pb-sheet')) return;
      window.clearTimeout(t);
      t = window.setTimeout(() => {
        if (document.activeElement !== el || !root.classList.contains('pb-kb')) return;
        const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (el.closest('.pb-sheet')) { el.scrollIntoView({ block: 'center', behavior: smooth ? 'smooth' : 'auto' }); return; }
        const page = el.closest('.pb-scroll');
        if (!page) return;
        const want = vv.offsetTop + vv.height * 0.25;
        page.scrollBy({ top: el.getBoundingClientRect().top - want, behavior: smooth ? 'smooth' : 'auto' });
      }, 300);
    };
    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    document.addEventListener('focusin', onFocus);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
      document.removeEventListener('focusin', onFocus);
      window.clearTimeout(t);
      root.style.removeProperty('--pb-kb');
      root.classList.remove('pb-kb');
    };
  }, []);
}
