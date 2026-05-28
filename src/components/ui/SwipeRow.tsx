import { useRef, useEffect, useCallback, useState } from 'react';

interface Action { label: string; color: string; onClick: () => void }
interface Props { children: React.ReactNode; actions: Action[]; hint?: boolean; hintKey?: string }

const ACTION_W = 56;
const LOCK_THRESHOLD = 6;
const SNAP_THRESHOLD = 40;
const VELOCITY_THRESHOLD = 0.3;
const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
const EASE_OUT = 'cubic-bezier(0.25, 0.1, 0.25, 1)';
const isMobile = () => 'ontouchstart' in window && window.innerWidth <= 768;

const ICONS: Record<string, string> = {
  Edit:   'M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z',
  Del:    'M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2',
  Delete: 'M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2',
  Add:    'M12 5v14M5 12h14',
  Remove: 'M5 12h14',
  Print:  'M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z',
  Remind: 'M22 2L11 13M22 2l-7 20-4-9-9-4z',
  Void:   'M4.93 4.93l14.14 14.14M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z',
};

const renderIcon = (label: string) => {
  const s = { width: 20, height: 20, fill: 'none' as const, stroke: '#fff', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (label === 'View') return <svg viewBox="0 0 24 24" style={s}><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>;
  if (ICONS[label]) return <svg viewBox="0 0 24 24" style={s}><path d={ICONS[label]} /></svg>;
  return <span style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>{label}</span>;
};

const openRows = new Set<() => void>();

export default function SwipeRow({ children, actions, hint, hintKey }: Props) {
  const rowRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const isOpenRef = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const currentX = useRef(0);
  const locked = useRef<'h' | 'v' | null>(null);
  const lastMoveT = useRef(0);
  const lastMoveX = useRef(0);
  const velocity = useRef(0);
  const maxReveal = actions.length * ACTION_W;

  const setTranslate = useCallback((x: number, animate = false, closing = false) => {
    const el = contentRef.current;
    if (!el) return;
    el.style.transition = animate ? (closing ? `transform .35s ${EASE_OUT}` : `transform .3s ${SPRING}`) : 'none';
    el.style.transform = `translateX(${x}px)`;
    currentX.current = x;
  }, []);

  const closeThisRef = useRef(() => {});
  closeThisRef.current = () => { setTranslate(0, true, true); setIsOpen(false); isOpenRef.current = false; };
  const closeThis = useCallback(() => closeThisRef.current(), []);

  const snap = useCallback((toOpen: boolean) => {
    if (toOpen) {
      openRows.forEach(fn => { if (fn !== closeThis) fn(); });
      openRows.clear();
      openRows.add(closeThis);
    } else {
      openRows.delete(closeThis);
    }
    setTranslate(toOpen ? -maxReveal : 0, true, !toOpen);
    setIsOpen(toOpen);
    isOpenRef.current = toOpen;
  }, [maxReveal, setTranslate, closeThis]);

  useEffect(() => {
    if (!isMobile()) return;
    const el = contentRef.current;
    if (!el) return;

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      startX.current = t.clientX;
      startY.current = t.clientY;
      lastMoveX.current = t.clientX;
      lastMoveT.current = e.timeStamp;
      velocity.current = 0;
      locked.current = null;
      // Kill any running animation so drag feels instant
      const el = contentRef.current;
      if (el) {
        const mx = new DOMMatrix(getComputedStyle(el).transform);
        currentX.current = mx.m41;
        el.style.transition = 'none';
        el.style.transform = `translateX(${currentX.current}px)`;
      }
    };

    const onMove = (e: TouchEvent) => {
      const t = e.touches[0];
      const dx = t.clientX - startX.current;
      const dy = t.clientY - startY.current;

      if (!locked.current) {
        if (Math.abs(dx) < LOCK_THRESHOLD && Math.abs(dy) < LOCK_THRESHOLD) return;
        locked.current = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
        if (locked.current === 'h') {
          openRows.forEach(fn => { if (fn !== closeThis) fn(); });
          openRows.clear();
        }
      }

      if (locked.current === 'v') return;

      // Prevent vertical scroll while swiping horizontally
      e.preventDefault();

      // Track velocity
      const now = e.timeStamp;
      const dt = now - lastMoveT.current;
      if (dt > 0) {
        velocity.current = (t.clientX - lastMoveX.current) / dt;
      }
      lastMoveT.current = now;
      lastMoveX.current = t.clientX;

      const base = isOpenRef.current ? -maxReveal : 0;
      const raw = base + dx;

      if (raw < -maxReveal) {
        const over = -maxReveal - raw;
        setTranslate(-maxReveal - over * 0.15);
      } else if (raw > 0) {
        setTranslate(raw * 0.15);
      } else {
        setTranslate(raw);
      }
    };

    const onEnd = () => {
      if (locked.current !== 'h') return;

      const x = currentX.current;
      const v = velocity.current; // px/ms, negative = swiping left (opening)

      // Velocity-based snap: a fast flick opens/closes regardless of distance
      if (Math.abs(v) > VELOCITY_THRESHOLD) {
        snap(v < 0);
        return;
      }

      // Distance-based snap
      if (isOpenRef.current) {
        snap(x < -(maxReveal - SNAP_THRESHOLD));
      } else {
        snap(x < -SNAP_THRESHOLD);
      }
    };

    // touchmove must be non-passive so we can preventDefault during horizontal swipe
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);

    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      openRows.delete(closeThis);
    };
  }, [maxReveal, setTranslate, snap, closeThis]);

  // Close on tap outside
  useEffect(() => {
    if (!isOpen) return;
    const onTap = (e: PointerEvent) => {
      if (rowRef.current && !rowRef.current.contains(e.target as Node)) snap(false);
    };
    document.addEventListener('pointerdown', onTap, true);
    return () => document.removeEventListener('pointerdown', onTap, true);
  }, [isOpen, snap]);

  // Close on intentional scroll (not micro-jitter)
  useEffect(() => {
    if (!isOpen) return;
    const main = document.querySelector('main');
    if (!main) return;
    let scrollStart: number | null = null;
    const onScroll = () => {
      if (scrollStart === null) { scrollStart = main.scrollTop; return; }
      if (Math.abs(main.scrollTop - scrollStart) > 10) {
        snap(false);
        scrollStart = null;
      }
    };
    main.addEventListener('scroll', onScroll, { passive: true, capture: true });
    return () => main.removeEventListener('scroll', onScroll, true);
  }, [isOpen, snap]);

  // Auto-hint
  useEffect(() => {
    if (!hint || !isMobile()) return;
    const key = `swipe-hint-${hintKey || 'default'}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    const t = setTimeout(() => { setTranslate(-40, true); setTimeout(() => setTranslate(0, true, true), 600); }, 800);
    return () => clearTimeout(t);
  }, [hint, setTranslate]);

  if (!isMobile()) return <>{children}</>;

  return (
    <div ref={rowRef} style={{ position: 'relative', overflow: 'hidden' }}>
      <div ref={contentRef} style={{ position: 'relative', zIndex: 1, background: isOpen ? '#0d1220' : '#060810', willChange: 'transform' }}>
        {children}
      </div>
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, display: 'flex', alignItems: 'center', gap: 10, paddingRight: 12, paddingLeft: 8 }}>
        {actions.map((a, i) => (
          <div key={i} onClick={() => { a.onClick(); snap(false); }} style={{ width: 42, height: 42, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: a.color, cursor: 'pointer', flexShrink: 0 }}>
            {renderIcon(a.label)}
          </div>
        ))}
      </div>
    </div>
  );
}
