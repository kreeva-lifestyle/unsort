// Bento helpers shared by the dashboard and the Websites page. Website tiles
// by count so every bento row is full (layout-and-components.md §4):
// 12 columns: 1 → 12; 2 → 6+6; 3 → 4+4+4; 4 → 6+6/6+6; 5 → 4+4+4/6+6; 6 → 4×6.
// At 6 columns (769–1099px) span 4 becomes 3 (two per row), so an odd count
// gives its last tile the full row.
import { useSyncExternalStore } from 'react';
import type { PbSpan } from './components/ui';

const QUERY = '(min-width: 769px) and (max-width: 1099px)';
const mql = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(QUERY) : null);
const subscribe = (cb: () => void) => {
  const m = mql();
  if (!m) return () => {};
  m.addEventListener('change', cb);
  return () => m.removeEventListener('change', cb);
};

/** True on the 6-column bento (769–1099px). */
export const useSixCols = () => useSyncExternalStore(subscribe, () => mql()?.matches ?? false, () => false);

export function siteSpans(n: number, six: boolean): PbSpan[] {
  if (n <= 0) return [];
  if (n === 1) return [12];
  const out: PbSpan[] = Array.from({ length: n }, () => 4 as PbSpan);
  if (six) {
    if (n % 2 === 1) out[n - 1] = 12;
    return out;
  }
  const tail = n % 3 === 2 ? 2 : n % 3 === 1 ? 4 : 0;
  for (let i = n - tail; i < n; i++) out[i] = 6;
  return out;
}
