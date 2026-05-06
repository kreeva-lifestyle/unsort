// Service worker for PWA — cache-first for static assets, network-first for API
const CACHE = 'dailyoffice-v2';
const STATIC = ['/', '/index.html'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Skip non-GET, API calls, and Supabase
  if (e.request.method !== 'GET' || url.hostname.includes('supabase')) return;
  // Static assets: cache-first
  if (url.pathname.match(/\.(js|css|woff2?|png|svg|ico)$/)) {
    e.respondWith(caches.match(e.request).then(c => c || fetch(e.request).then(r => { if (r.ok) { const clone = r.clone(); caches.open(CACHE).then(cache => cache.put(e.request, clone)); } return r; })));
    return;
  }
  // HTML: network-first with cache fallback
  if (e.request.headers.get('accept')?.includes('text/html')) {
    e.respondWith(fetch(e.request).catch(() => caches.match('/index.html')));
  }
});
