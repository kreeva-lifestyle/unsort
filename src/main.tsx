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
      const overlay = document.createElement('div');
      overlay.setAttribute('style', 'position:fixed;inset:0;z-index:99999;background:rgba(6,8,16,.85);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);display:flex;align-items:center;justify-content:center;padding:24px;font-family:Inter,-apple-system,sans-serif');
      overlay.innerHTML = `
        <div style="background:rgba(15,20,32,.95);border:1px solid rgba(99,102,241,.2);border-radius:14px;padding:32px 28px;text-align:center;max-width:340px;width:100%">
          <div style="width:48px;height:48px;margin:0 auto 16px;border-radius:12px;background:rgba(99,102,241,.12);display:flex;align-items:center;justify-content:center">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#818CF8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
          </div>
          <div style="font-family:Sora,Inter,sans-serif;font-size:16px;font-weight:700;color:#E2E8F0;margin-bottom:8px">Update Available</div>
          <div style="font-size:13px;color:#8896B0;line-height:1.5;margin-bottom:24px">A new version of DailyOffice is ready. Please update to continue.</div>
          <button style="width:100%;padding:12px 20px;border-radius:8px;border:none;background:linear-gradient(135deg,oklch(0.55 0.22 265),oklch(0.65 0.18 270));color:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;min-height:44px">Update Now</button>
        </div>`;
      overlay.querySelector('button')!.onclick = () => window.location.reload();
      document.body.appendChild(overlay);
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
