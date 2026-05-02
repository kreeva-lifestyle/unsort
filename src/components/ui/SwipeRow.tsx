import { useRef, useEffect, useCallback } from 'react';

interface Action { label: string; color: string; onClick: () => void }
interface Props { children: React.ReactNode; actions: Action[]; hint?: boolean }

const ACTION_W = 56;
const THRESHOLD = 50;
const isMobile = () => 'ontouchstart' in window && window.innerWidth <= 768;

const openRows = new Set<() => void>();

export default function SwipeRow({ children, actions, hint }: Props) {
  const contentRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const startY = useRef(0);
  const currentX = useRef(0);
  const open = useRef(false);
  const locked = useRef<'h' | 'v' | null>(null);
  const maxReveal = actions.length * ACTION_W;

  const setTranslate = useCallback((x: number, animate = false) => {
    const el = contentRef.current;
    if (!el) return;
    el.style.transition = animate ? 'transform .25s cubic-bezier(.4,0,.2,1)' : 'none';
    el.style.transform = `translateX(${x}px)`;
    currentX.current = x;
  }, []);

  const closeThis = useCallback(() => {
    setTranslate(0, true);
    open.current = false;
  }, [setTranslate]);

  const snap = useCallback((toOpen: boolean) => {
    if (toOpen) {
      openRows.forEach(fn => { if (fn !== closeThis) fn(); });
      openRows.clear();
      openRows.add(closeThis);
    } else {
      openRows.delete(closeThis);
    }
    setTranslate(toOpen ? -maxReveal : 0, true);
    open.current = toOpen;
  }, [maxReveal, setTranslate, closeThis]);

  useEffect(() => {
    if (!isMobile()) return;
    const el = contentRef.current;
    if (!el) return;

    const onStart = (e: TouchEvent) => {
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
      locked.current = null;
    };
    const onMove = (e: TouchEvent) => {
      const dx = e.touches[0].clientX - startX.current;
      const dy = e.touches[0].clientY - startY.current;
      if (!locked.current) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        locked.current = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
        if (locked.current === 'h') {
          openRows.forEach(fn => { if (fn !== closeThis) fn(); });
          openRows.clear();
        }
      }
      if (locked.current !== 'h') return;
      const base = open.current ? -maxReveal : 0;
      const next = Math.max(-maxReveal, Math.min(0, base + dx));
      setTranslate(next);
    };
    const onEnd = () => {
      if (locked.current !== 'h') return;
      const moved = Math.abs(currentX.current - (open.current ? -maxReveal : 0));
      if (moved > THRESHOLD) snap(!open.current);
      else snap(open.current);
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: true });
    el.addEventListener('touchend', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      openRows.delete(closeThis);
    };
  }, [maxReveal, setTranslate, snap, closeThis]);

  useEffect(() => {
    if (!hint || !isMobile()) return;
    const key = 'swipe-hint-shown';
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    const t = setTimeout(() => {
      setTranslate(-40, true);
      setTimeout(() => setTranslate(0, true), 600);
    }, 800);
    return () => clearTimeout(t);
  }, [hint, setTranslate]);

  if (!isMobile()) return <>{children}</>;

  return (
    <div style={{ position: 'relative', overflow: 'hidden' }}>
      <div ref={contentRef} style={{ position: 'relative', zIndex: 1, background: '#060810' }}>
        {children}
      </div>
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, display: 'flex' }}>
        {actions.map((a, i) => (
          <div key={i} onClick={a.onClick} style={{ width: ACTION_W, display: 'flex', alignItems: 'center', justifyContent: 'center', background: a.color, color: '#fff', fontSize: 9, fontWeight: 600, cursor: 'pointer', letterSpacing: 0.3 }}>
            {a.label}
          </div>
        ))}
      </div>
    </div>
  );
}
