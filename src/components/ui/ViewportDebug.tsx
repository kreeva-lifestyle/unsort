// Viewport diagnostic overlay for the iOS-standalone bottom-nav gap hunt.
// Renders ONLY when the URL contains ?vpdebug or localStorage.vpdebug is set —
// zero cost otherwise. Shows the live numbers that identify which viewport the
// OS is misreporting (screen vs inner vs visualViewport vs safe-area inset vs
// where the fixed nav actually landed), so a surviving gap can be diagnosed
// from a single screenshot instead of guesswork.
import { useState, useEffect } from 'react';

declare const __APP_BUILD__: string; // injected by vite define (build stamp)

const enabled = () => {
  try { return window.location.search.includes('vpdebug') || !!localStorage.getItem('vpdebug'); }
  catch { return false; }
};

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
        build: typeof __APP_BUILD__ === 'string' ? __APP_BUILD__ : 'dev',
      });
    };
    read();
    const iv = setInterval(read, 700);
    return () => { clearInterval(iv); probe.remove(); };
  }, [on]);

  if (!on) return null;
  return (
    <div style={{ position: 'fixed', top: 'calc(env(safe-area-inset-top, 0px) + 60px)', left: 8, zIndex: 99999, background: 'rgba(0,0,0,.82)', border: '1px solid rgba(99,102,241,.5)', borderRadius: 8, padding: '8px 10px', fontFamily: 'monospace', fontSize: 10, lineHeight: 1.6, color: '#7dd3fc', pointerEvents: 'none' }}>
      {Object.entries(m).map(([k, v]) => <div key={k}>{k}: <b style={{ color: '#fff' }}>{v}</b></div>)}
    </div>
  );
}
