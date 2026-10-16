// Show a long list the way people read it: the first rows at once, the rest
// a moment later when the phone is idle (300 ms at most). The page paints
// and answers taps sooner instead of freezing while every row is built.
// Only a fresh load starts small again; a background refresh of rows already
// on screen keeps them all, so nothing collapses under someone's thumb.
import { useEffect, useState } from 'react';
import { whenIdle } from '../lib/idle';

export function useProgressive<T>(items: T[], loading: boolean, first = 8): T[] {
  const [full, setFull] = useState(false);
  useEffect(() => {
    if (loading) { setFull(false); return; }
    if (full) return;
    return whenIdle(() => setFull(true), 300);
  }, [loading, full]);
  return full || items.length <= first ? items : items.slice(0, first);
}
