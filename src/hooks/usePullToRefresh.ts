import { useRef, useEffect, useCallback } from 'react';

const THRESHOLD = 80;
const isMobile = () => window.innerWidth <= 768;

export function usePullToRefresh(onRefresh: () => void) {
  const startY = useRef(0);
  const pulling = useRef(false);
  const indicator = useRef<HTMLDivElement | null>(null);

  const getIndicator = useCallback(() => {
    if (!indicator.current) {
      const el = document.createElement('div');
      el.id = 'ptr-indicator';
      el.style.cssText = 'position:fixed;top:0;left:0;right:0;height:3px;z-index:9999;background:linear-gradient(90deg,#6366F1,#818CF8);transform:scaleX(0);transform-origin:left;transition:transform .15s ease;pointer-events:none;';
      document.body.appendChild(el);
      indicator.current = el;
    }
    return indicator.current;
  }, []);

  useEffect(() => {
    if (!isMobile()) return;

    const onStart = (e: TouchEvent) => {
      const scrollEl = document.querySelector('main');
      if (!scrollEl || scrollEl.scrollTop > 5) return;
      startY.current = e.touches[0].clientY;
      pulling.current = true;
    };

    const onMove = (e: TouchEvent) => {
      if (!pulling.current) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy < 0) { pulling.current = false; return; }
      const progress = Math.min(dy / THRESHOLD, 1);
      getIndicator().style.transform = `scaleX(${progress})`;
    };

    const onEnd = () => {
      if (!pulling.current) return;
      pulling.current = false;
      const bar = getIndicator();
      const wasFull = bar.style.transform === 'scaleX(1)';
      bar.style.transform = 'scaleX(0)';
      if (wasFull) onRefresh();
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onEnd);
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      indicator.current?.remove();
      indicator.current = null;
    };
  }, [onRefresh, getIndicator]);
}
