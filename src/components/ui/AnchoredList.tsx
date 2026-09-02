// Portal dropdown pinned under (or above) an input. Used by the suggestion
// boxes instead of <datalist>, which iOS Safari never renders.
//
// Why a portal with fixed positioning rather than position:absolute inside
// the field: the challan item grid, table cells and SwipeRow wrappers all
// clip overflow, so an in-flow list gets cut off at the row edge. A fixed
// box measured from the input's bounding rect escapes every wrapper, and it
// flips above the input when the on-screen keyboard leaves no room below.
import { useLayoutEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { T } from '../../lib/theme';

interface Pos { top?: number; bottom?: number; left: number; width: number; maxHeight: number }

const GAP = 4;
const MIN_WIDTH = 220;
const LIST_MAX = 220;

export default function AnchoredList({ anchor, open, children }: { anchor: HTMLElement | null; open: boolean; children: ReactNode }) {
  const [pos, setPos] = useState<Pos | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchor) { setPos(null); return; }
    const measure = () => {
      const r = anchor.getBoundingClientRect();
      // visualViewport shrinks when the iOS keyboard is up; window.innerHeight
      // does not, so it is the only honest measure of the room left below.
      const vv = window.visualViewport;
      const vh = vv ? vv.height + vv.offsetTop : window.innerHeight;
      const vw = window.innerWidth;
      const below = vh - r.bottom - GAP;
      const above = r.top - GAP;
      const width = Math.max(MIN_WIDTH, r.width);
      const left = Math.max(8, Math.min(r.left, vw - width - 8));
      if (below >= Math.min(LIST_MAX, 140) || below >= above) {
        setPos({ top: r.bottom + GAP, left, width, maxHeight: Math.max(120, Math.min(LIST_MAX, below)) });
      } else {
        setPos({ bottom: window.innerHeight - r.top + GAP, left, width, maxHeight: Math.max(120, Math.min(LIST_MAX, above)) });
      }
    };
    measure();
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('scroll', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('scroll', measure);
    };
  }, [open, anchor]);

  if (!open || !pos) return null;
  return createPortal(
    <div
      role="listbox"
      style={{
        position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width, maxHeight: pos.maxHeight,
        overflowY: 'auto', WebkitOverflowScrolling: 'touch', zIndex: 1000,
        background: T.s3, border: `1px solid ${T.bd2}`, borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.45)',
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
