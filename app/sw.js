'use strict';

// Service worker javne MOVE&TRY aplikacije.
// Registrira se isključivo s opsegom /app/.

const CACHE_NAME = 'moveandtry-public-app-shell-v1';

const APP_SHELL = [
  '/app/',
  '/app/index.html'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();

    await Promise.all(
      keys
        .filter(key =>
          key.startsWith('moveandtry-public-app-') &&
          key !== CACHE_NAME
        )
        .map(key => caches.delete(key))
    );

    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (
    event.request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    !url.pathname.startsWith('/app/')
  ) {
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(async () =>
        (await caches.match('/app/index.html')) ||
        Response.error()
      )
    );
  }
});
