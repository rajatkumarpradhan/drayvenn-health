// Same-origin OpenStreetMap tile proxy with edge caching.
// Third-party image hosts are blocked on some networks/devices; serving tiles
// same-origin keeps the map reliable. Tiles are immutable for days, so we cache
// aggressively at the Cloudflare edge. Attribution stays with OSM in the UI.
export async function onRequestGet(context) {
  const u = new URL(context.request.url);
  const z = u.searchParams.get('z'), x = u.searchParams.get('x'), y = u.searchParams.get('y');
  if (!/^\d{1,2}$/.test(z || '') || !/^\d{1,6}$/.test(x || '') || !/^\d{1,6}$/.test(y || '')) {
    return new Response('bad tile coords', { status: 400 });
  }
  const cache = caches.default;
  const key = new Request(u.origin + u.pathname + '?z=' + z + '&x=' + x + '&y=' + y);
  const hit = await cache.match(key);
  if (hit) return hit;
  const upstream = await fetch('https://tile.openstreetmap.org/' + z + '/' + x + '/' + y + '.png', {
    headers: { 'User-Agent': 'DrayvennHealthDemo/0.1 (+https://drayvenn-health.pages.dev)' }
  });
  if (!upstream.ok) return new Response('tile unavailable', { status: 502 });
  const res = new Response(upstream.body, {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400, immutable' }
  });
  context.waitUntil(cache.put(key, res.clone()));
  return res;
}
