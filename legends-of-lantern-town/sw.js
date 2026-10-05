// Serves the decrypted game from Cache Storage under ./play/.
// Without an unlocked cache for this build, play/ redirects to the passcode page.
const BUILD = 'fdadf7eeec80';
const CACHE = `lantern-${BUILD}`;
const SCOPE = new URL('./', self.location).href;
const PLAY = `${SCOPE}play/`;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('lantern-') && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  url.search = ''; url.hash = '';
  if (event.request.method !== 'GET' || !url.href.startsWith(PLAY)) return;
  const key = url.href.endsWith('/') ? `${url.href}index.html` : url.href;
  event.respondWith((async () => {
    const hit = await (await caches.open(CACHE)).match(key);
    if (hit) return hit;
    if (event.request.mode === 'navigate') return Response.redirect(SCOPE, 302);
    return new Response('Locked', { status: 403 });
  })());
});
