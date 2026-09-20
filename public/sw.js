// __BUILD_TS__ is replaced at build time by vite.config.ts — forces SW update on every deploy
const CACHE = 'dailyoffice-__BUILD_TS__';

// Product photos and QR codes from Supabase Storage's PUBLIC buckets get a
// cache of their own that is NOT build-stamped, so it survives deploys: a
// photo seen once stays on the device and loads instantly, online or off.
// Safe because every upload gets a NEW url (?v=, timestamped or random
// names), so a cached url can never show a replaced picture. Capped so it
// cannot grow without bound — the oldest entries go first.
const IMG_CACHE = 'dailyoffice-images-v1';
const IMG_MAX = 200;
const isPublicImage = url => url.hostname.includes('supabase') && url.pathname.startsWith('/storage/v1/object/public/');
const trimImages = cache => cache.keys().then(keys =>
  Promise.all(keys.slice(0, Math.max(0, keys.length - IMG_MAX)).map(k => cache.delete(k))));

self.addEventListener('install', e => {
  // Precache the shell so the navigate fallback below has something to
  // serve when the app is launched offline. The cache name is build-stamped,
  // so every deploy installs a fresh copy and activate drops the old one.
  e.waitUntil(caches.open(CACHE).then(c => c.add('/index.html')).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== IMG_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window' }).then(clients => {
        clients.forEach(c => c.postMessage({ type: 'SW_UPDATED' }));
      }))
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // Public storage images: cache-first, forever (see IMG_CACHE above). An
  // <img> request is no-cors, whose opaque response is unusable and
  // quota-padded, so the miss is refetched with CORS (the buckets allow
  // any origin); if that ever fails the plain request goes out as before.
  if (isPublicImage(url)) {
    e.respondWith(caches.open(IMG_CACHE).then(cache => cache.match(url.href).then(hit => hit ||
      fetch(url.href, { mode: 'cors', credentials: 'omit' }).then(r => {
        if (r.ok) { const clone = r.clone(); cache.put(url.href, clone).then(() => trimImages(cache)).catch(() => {}); }
        return r;
      }).catch(() => fetch(e.request)))));
    return;
  }
  if (url.hostname.includes('supabase')) return;

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
