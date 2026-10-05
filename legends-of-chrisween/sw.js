// The game moved to ../legends-of-lantern-town/. Replaces the old worker: drop its caches,
// unregister, and send open tabs to the new address.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('chrisween-')) await caches.delete(key);
    await self.registration.unregister();
    for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(new URL('../legends-of-lantern-town/', self.registration.scope).href);
  })());
});
