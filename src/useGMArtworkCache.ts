import { useEffect } from 'react';

declare const __GM_ARTWORK_MANIFEST__: { url: string; sha: string }[];

const CACHE = 'gm-artwork-v1';
const METADATA = '/__gm-artwork-metadata-v1.json';
let started = false;

async function warmArtwork() {
  if (!('caches' in window) || !('serviceWorker' in navigator)) return;
  // Only GM desktop sessions initiate bulk downloading; tablets and players do not.
  const registration = await navigator.serviceWorker.register('/gm-artwork-sw.js');
  await navigator.serviceWorker.ready;
  if (!registration.active) return;
  const cache = await caches.open(CACHE);
  const previous = await cache.match(METADATA);
  let known: Record<string, string> = {};
  try { if (previous) known = await previous.json() as Record<string, string>; } catch { /* Rebuild metadata. */ }
  const entries = __GM_ARTWORK_MANIFEST__;
  const current = Object.fromEntries(entries.map(({ url, sha }) => [url, sha]));
  // Remove obsolete files without touching unrelated browser caches.
  for (const url of Object.keys(known)) if (!(url in current)) await cache.delete(url);
  const queue = entries.filter(({ url, sha }) => known[url] !== sha);
  let next = 0;
  async function worker() {
    while (next < queue.length) {
      const { url, sha } = queue[next++];
      try {
        const response = await fetch(url, { cache: 'reload' });
        if (!response.ok || response.type === 'opaque') continue;
        await cache.put(url, response);
        known[url] = sha;
      } catch { /* Offline or storage quota: retry next GM session. */ }
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, queue.length) }, () => worker()));
  await cache.put(METADATA, new Response(JSON.stringify(Object.fromEntries(
    Object.entries(known).filter(([url]) => url in current)
  )), { headers: { 'Content-Type': 'application/json' } }));
}

export function useGMArtworkCache() {
  useEffect(() => {
    if (started || !window.matchMedia('(min-width: 1024px) and (pointer: fine)').matches) return;
    started = true;
    void warmArtwork().catch(() => { started = false; });
  }, []);
}
