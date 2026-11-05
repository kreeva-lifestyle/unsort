// Swipe down to close a phone bottom sheet (mobile.md §6). A shortcut only:
// the 44px close button stays. Tracks the handle + header, never the body.
// Closes past 120px or when released faster than 0.5px/ms; else springs back.
import { useRef, type CSSProperties, type PointerEvent as RPointerEvent, type RefObject } from 'react';

type H = (e: RPointerEvent<HTMLElement>) => void;
export type SheetDrag = { onPointerDown?: H; onPointerMove?: H; onPointerUp?: H; onPointerCancel?: H; style?: CSSProperties };

export function useSheetDrag(box: RefObject<HTMLElement | null>, onClose: () => void, enabled: boolean): SheetDrag {
  const start = useRef<{ y: number; t: number; id: number } | null>(null);
  const dy = useRef(0);

  const set = (y: number, animate: boolean) => {
    const el = box.current;
    if (!el) return;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.style.transition = animate && !still ? 'transform .3s cubic-bezier(.22,1,.36,1)' : 'none';
    el.style.transform = y ? `translateY(${y}px)` : '';
    el.style.willChange = y && !animate ? 'transform' : '';
  };

  const onPointerDown = (e: RPointerEvent<HTMLElement>) => {
    if (!enabled || e.button !== 0 || (e.target as HTMLElement).closest('button, a, input, select, textarea')) return;
    start.current = { y: e.clientY, t: performance.now(), id: e.pointerId };
    dy.current = 0;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: RPointerEvent<HTMLElement>) => {
    if (!start.current || e.pointerId !== start.current.id) return;
    dy.current = Math.max(0, e.clientY - start.current.y);
    set(dy.current, false);
  };
  const end = (e: RPointerEvent<HTMLElement>) => {
    const s = start.current;
    if (!s || e.pointerId !== s.id) return;
    start.current = null;
    const speed = dy.current / Math.max(1, performance.now() - s.t);
    if (dy.current > 120 || (dy.current > 24 && speed > 0.5)) { set(0, false); onClose(); }
    else set(0, true);
  };
  return enabled
    ? { onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end, style: { touchAction: 'none' } }
    : {};
}
