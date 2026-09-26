/* Migration worker: old versions scraped and cached API responses.
 * The app unregisters this worker; clear stale caches during activation. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await caches.delete('mp-map-dir-v1');
    await self.registration.unregister();
  })());
});
