// Run `fn` again every `ms` while the tab is in view, and once when the tab
// comes back into view (a dashboard left open on a phone or a desk shows
// what is true now, not what was true when it was opened). Nothing runs
// while the tab is hidden. `fn` should be the quiet kind of reload: no
// skeleton, no toast.
import { useEffect, useRef } from 'react';

export function useAutoRefresh(fn: () => void, ms = 60_000): void {
  const latest = useRef(fn);
  useEffect(() => { latest.current = fn; }, [fn]);
  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') latest.current(); };
    const id = window.setInterval(tick, ms);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [ms]);
}
