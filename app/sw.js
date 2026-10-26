'use strict';

// MOVE&TRY installed app shell. Scope is strictly /app/.
const CACHE_NAME = 'moveandtry-public-app-shell-v2';
const APP_SHELL = ['/app/', '/app/index.html'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith('moveandtry-public-app-') && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin ||
      !url.pathname.startsWith('/app/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () =>
        (await caches.match('/app/index.html')) || Response.error()
      )
    );
  }
});
