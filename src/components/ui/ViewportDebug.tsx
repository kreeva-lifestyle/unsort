// Viewport diagnostic overlay for the iOS-standalone bottom-nav gap hunt.
// Renders ONLY when the URL contains ?vpdebug or localStorage.vpdebug is set —
// zero cost otherwise. In the home-screen app (no address bar) five quick taps
// on the header crest toggle it (Header.tsx). Shows the live numbers that identify which viewport the
// OS is misreporting (screen vs inner vs visualViewport vs safe-area inset vs
// where the fixed nav actually landed), so a surviving gap can be diagnosed
// from a single screenshot instead of guesswork.
import { useState, useEffect } from 'react';
import { viewportRestoreStats } from '../../hooks/useViewportRestore';

declare const __APP_BUILD__: string; // injected by vite define (build stamp)

const enabled = () => {
  try { return window.location.search.includes('vpdebug') || !!localStorage.getItem('vpdebug'); }
  catch { return false; }
};

/** Flip the overlay on/off for the next load; returns the new state. */
export function toggleViewportDebug(): boolean {
  try {
    if (localStorage.getItem('vpdebug')) { localStorage.removeItem('vpdebug'); return false; }
    localStorage.setItem('vpdebug', '1'); return true;
  } catch { return false; }
}

export default function ViewportDebug() {
  const [on] = useState(enabled);
  const [m, setM] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!on) return;
    // Probe element: computed padding-bottom = env(safe-area-inset-bottom).
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:-9999px;padding-bottom:env(safe-area-inset-bottom,0px);';
    document.body.appendChild(probe);
    const read = () => {
      const vv = window.visualViewport;
      const nav = document.querySelector('.mobile-hamburger');
      const nr = nav ? nav.getBoundingClientRect() : null;
      setM({
        'screen.h': String(window.screen.height),
        'inner.h': String(window.innerHeight),
        'vv.h': vv ? vv.height.toFixed(1) : 'n/a',
        'vv.top': vv ? vv.offsetTop.toFixed(1) : 'n/a',
        'sab(env)': getComputedStyle(probe).paddingBottom,
        'nav.bottom': nr ? nr.bottom.toFixed(1) : 'no nav',
        'nav.h': nr ? nr.height.toFixed(1) : '-',
        'gap(inner-navBot)': nr ? (window.innerHeight - nr.bottom).toFixed(1) : '-',
        standalone: String(window.matchMedia('(display-mode: standalone)').matches),
        maxH: String(viewportRestoreStats.maxH),
        want: String(viewportRestoreStats.want || '-'),
        failedAt: String(viewportRestoreStats.failedAt || '-'),
        restores: `${viewportRestoreStats.restores}${viewportRestoreStats.lastReason ? ' (' + viewportRestoreStats.lastReason + ')' : ''}`,
        build: typeof __APP_BUILD__ === 'string' ? __APP_BUILD__ : 'dev',
      });
    };
    read();
    const iv = setInterval(read, 700);
    return () => { clearInterval(iv); probe.remove(); };
  }, [on]);

  if (!on) return null;
  return (
    <div style={{ position: 'fixed', top: 'calc(env(safe-area-inset-top, 0px) + 60px)', left: 8, zIndex: 99999, background: 'rgba(0,0,0,.82)', border: '1px solid oklch(0.55 0.22 265 / .5)', borderRadius: 8, padding: '8px 10px', fontFamily: 'monospace', fontSize: 10, lineHeight: 1.6, color: '#7dd3fc', pointerEvents: 'none' }}>
      {Object.entries(m).map(([k, v]) => <div key={k}>{k}: <b style={{ color: '#fff' }}>{v}</b></div>)}
    </div>
  );
}
