// Cache only same-origin WebP artwork. All other requests use normal browser behavior.
const CACHE = 'gm-artwork-v1';
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !/\.webp$/i.test(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(event.request);
    if (cached) return cached;
    // Do not automatically store player artwork: only GM preloader populates cache.
    return fetch(event.request);
  })());
});
