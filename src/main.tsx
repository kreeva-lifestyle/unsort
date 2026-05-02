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
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// Haptic feedback on button taps (native feel)
document.addEventListener('touchstart', (e) => {
  const t = e.target as HTMLElement;
  if (t.closest('button, [role="button"]')) {
    try { navigator.vibrate?.(8); } catch {}
  }
}, { passive: true });
