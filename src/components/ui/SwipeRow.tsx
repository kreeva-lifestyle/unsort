import { useRef, useEffect, useCallback } from 'react';

interface Action { label: string; color: string; onClick: () => void }
interface Props { children: React.ReactNode; actions: Action[]; hint?: boolean }

const ACTION_W = 56;
const THRESHOLD = 50;
const isMobile = () => 'ontouchstart' in window && window.innerWidth <= 768;

export default function SwipeRow({ children, actions, hint }: Props) {
  const contentRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const currentX = useRef(0);
  const open = useRef(false);
  const maxReveal = actions.length * ACTION_W;

  const setTranslate = useCallback((x: number, animate = false) => {
    const el = contentRef.current;
    if (!el) return;
    el.style.transition = animate ? 'transform .25s cubic-bezier(.4,0,.2,1)' : 'none';
    el.style.transform = `translateX(${x}px)`;
    currentX.current = x;
  }, []);

  const snap = useCallback((toOpen: boolean) => {
    setTranslate(toOpen ? -maxReveal : 0, true);
    open.current = toOpen;
  }, [maxReveal, setTranslate]);

  useEffect(() => {
    if (!isMobile()) return;
    const el = contentRef.current;
    if (!el) return;

    const onStart = (e: TouchEvent) => { startX.current = e.touches[0].clientX; };
    const onMove = (e: TouchEvent) => {
      const dx = e.touches[0].clientX - startX.current;
      const base = open.current ? -maxReveal : 0;
      const next = Math.max(-maxReveal, Math.min(0, base + dx));
      setTranslate(next);
    };
    const onEnd = () => {
      const moved = Math.abs(currentX.current - (open.current ? -maxReveal : 0));
      if (moved > THRESHOLD) snap(!open.current);
      else snap(open.current);
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: true });
    el.addEventListener('touchend', onEnd);
    return () => { el.removeEventListener('touchstart', onStart); el.removeEventListener('touchmove', onMove); el.removeEventListener('touchend', onEnd); };
  }, [maxReveal, setTranslate, snap]);

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

  return (
    <div className="swipe-row" style={{ position: 'relative', overflow: 'hidden' }}>
      <div ref={contentRef} className="swipe-row-content" style={{ position: 'relative', zIndex: 1, background: 'inherit' }}>
        {children}
      </div>
      <div className="swipe-row-actions" style={{ position: 'absolute', right: 0, top: 0, bottom: 0, display: 'flex' }}>
        {actions.map((a, i) => (
          <div key={i} onClick={a.onClick} style={{ width: ACTION_W, display: 'flex', alignItems: 'center', justifyContent: 'center', background: a.color, color: '#fff', fontSize: 9, fontWeight: 600, cursor: 'pointer', letterSpacing: 0.3 }}>
            {a.label}
          </div>
        ))}
      </div>
    </div>
  );
}
