const CACHE = 'dailyoffice-v4';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.hostname.includes('supabase')) return;

  // HTML: network-first, cache the response for offline
  if (e.request.mode === 'navigate' || e.request.headers.get('accept')?.includes('text/html')) {
    e.respondWith(
      fetch(e.request).then(r => {
        if (r.ok) { const c = r.clone(); caches.open(CACHE).then(cache => cache.put(e.request, c)); }
        return r;
      }).catch(() => caches.match(e.request).then(c => c || caches.match('/index.html')))
    );
    return;
  }

  // JS/CSS: network-first with cache fallback (prevents stale chunk errors)
  if (url.pathname.match(/\.(js|css)$/)) {
    e.respondWith(
      fetch(e.request).then(r => {
        if (r.ok) { const c = r.clone(); caches.open(CACHE).then(cache => cache.put(e.request, c)); }
        return r;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Other static assets (fonts, images): cache-first
  if (url.pathname.match(/\.(woff2?|png|svg|ico|webp)$/)) {
    e.respondWith(caches.match(e.request).then(c => c || fetch(e.request).then(r => {
      if (r.ok) { const clone = r.clone(); caches.open(CACHE).then(cache => cache.put(e.request, clone)); }
      return r;
    })));
  }
});
