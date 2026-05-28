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
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'SW_UPDATED') {
      const bar = document.createElement('div');
      bar.setAttribute('style', 'position:fixed;bottom:0;left:0;right:0;z-index:99999;background:linear-gradient(135deg,oklch(0.55 0.22 265),oklch(0.65 0.18 270));color:#fff;display:flex;align-items:center;justify-content:center;gap:12px;padding:12px 20px;font-family:Inter,-apple-system,sans-serif;font-size:13px;font-weight:600;box-shadow:0 -4px 20px rgba(0,0,0,.3)');
      bar.innerHTML = 'New version available <button style="padding:6px 14px;border-radius:6px;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.15);color:#fff;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">Refresh</button>';
      bar.querySelector('button')!.onclick = () => window.location.reload();
      document.body.appendChild(bar);
    }
  });
}

// Enable :active CSS on iOS Safari (requires touchstart listener on body)
document.addEventListener('touchstart', () => {}, { passive: true });

// Haptic feedback on button taps (native feel)
document.addEventListener('touchstart', (e) => {
  const t = e.target as HTMLElement;
  if (t.closest('button, [role="button"]')) {
    try { navigator.vibrate?.(8); } catch {}
  }
}, { passive: true });
