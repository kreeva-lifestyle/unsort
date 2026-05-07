import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(e => console.error('SW registration failed:', e));
  });
}

// Enable :active CSS on iOS Safari (requires touchstart listener on body)
document.addEventListener('touchstart', () => {}, { passive: true });

// Haptic feedback + ripple on taps (native feel)
document.addEventListener('pointerdown', (e) => {
  const t = e.target as HTMLElement;
  const btn = t.closest('button, [role="button"]') as HTMLElement || (t.style.cursor === 'pointer' ? t : t.closest('[style*="pointer"]')) as HTMLElement;
  if (!btn || btn.closest('.toast-container, .mobile-overlay')) return;
  try { navigator.vibrate?.(8); } catch {}
  const rect = btn.getBoundingClientRect();
  const r = document.createElement('span');
  const size = Math.max(rect.width, rect.height) * 2;
  r.style.cssText = `position:absolute;left:${e.clientX - rect.left - size / 2}px;top:${e.clientY - rect.top - size / 2}px;width:${size}px;height:${size}px;border-radius:50%;background:rgba(255,255,255,.12);pointer-events:none;animation:rippleOut .5s ease forwards`;
  const prev = getComputedStyle(btn).position;
  if (prev === 'static') btn.style.position = 'relative';
  btn.style.overflow = 'hidden';
  btn.appendChild(r);
  r.addEventListener('animationend', () => { r.remove(); if (prev === 'static') btn.style.position = ''; btn.style.overflow = ''; });
});
