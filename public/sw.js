/* Drayvenn Lab service worker.
   Network-first for documents/scripts/styles so fresh deploys always land
   (the "one refresh" workflow stays intact), cache-first for versioned static
   images under /brand and /vendor (filenames change when content changes),
   network-only for /api/ - booking and auth data is never cached. */
const CACHE = 'drayvenn-shell-v47';
const SHELL = ['/', '/index.html', '/styles.css', '/app.js', '/brand/icon.png'];
const STATIC_RE = /^\/(brand|vendor)\/.*\.(png|webp|jpg|jpeg|svg|ico|css|js|woff2?)$/;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // network only

  if (e.request.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = await fetch(e.request);
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
        return res;
      } catch {
        return (await caches.match(e.request)) || (await caches.match('/index.html')) || Response.error();
      }
    })());
    return;
  }

  if (STATIC_RE.test(url.pathname)) {
    e.respondWith((async () => {
      const cached = await caches.match(e.request);
      if (cached) return cached;
      const res = await fetch(e.request);
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    })());
    return;
  }

  // app.js, styles.css and anything else: network-first with cache fallback
  e.respondWith((async () => {
    try {
      const res = await fetch(e.request);
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    } catch {
      return (await caches.match(e.request)) || Response.error();
    }
  })());
});
