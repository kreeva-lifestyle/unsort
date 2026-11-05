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
    // A focused field inside a sheet or form: bring it into view once the keyboard has opened.
    let t: number | undefined;
    const onFocus = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el || !el.matches?.('input, textarea, select') || !el.closest('.pb-scroll, .pb-sheet')) return;
      window.clearTimeout(t);
      t = window.setTimeout(() => { if (document.activeElement === el && root.classList.contains('pb-kb')) el.scrollIntoView({ block: 'center' }); }, 300);
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
