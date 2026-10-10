// A line of text that rolls when it changes (Motion Lab 06: the status pill
// and the caption under the rail). The old text slides up and fades out
// (120 ms, --e-in) while the new one rides in from below (160 ms, --e-out);
// under Reduce Motion the new text simply fades in. Nothing happens on the
// first paint. The outgoing ghost is a plain DOM node appended after
// React's own child, so React never sees it.
import { useLayoutEffect, useRef } from 'react';
import { animate, E, M, reducedMotion } from '../../lib/motion';

export default function Roll({ text, style }: { text: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(text);
  useLayoutEffect(() => {
    const el = ref.current, old = prev.current;
    prev.current = text;
    if (!el || old === text) return;
    const fresh = el.firstElementChild;
    if (reducedMotion()) { animate(fresh, [{ opacity: .3 }, { opacity: 1 }], { duration: M.fast }); return; }
    const ghost = document.createElement('span');
    ghost.textContent = old; ghost.setAttribute('aria-hidden', 'true');
    el.appendChild(ghost);
    animate(ghost, [{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(-65%)', opacity: 0 }], { duration: 120, easing: E.in, fill: 'forwards' }).finished.then(() => ghost.remove());
    animate(fresh, [{ transform: 'translateY(65%)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], { duration: M.fast, delay: 40, easing: E.out, fill: 'backwards' });
  }, [text]);
  return <span ref={ref} className="roll" style={style}><span>{text}</span></span>;
}
