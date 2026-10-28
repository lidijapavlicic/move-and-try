
'use strict';

// MOVE&TRY installed app shell.
// Scope is strictly /app/.
const CACHE_NAME = 'moveandtry-public-app-shell-v3';
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
  const request = event.request;
  const url = new URL(request.url);

  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    !url.pathname.startsWith('/app/')
  ) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () =>
        (await caches.match('/app/index.html')) ||
        Response.error()
      )
    );
  }
});

// PUSH NOTIFICATIONS

self.addEventListener('push', event => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    payload = {
      body: event.data ? event.data.text() : ''
    };
  }

  const title = String(payload.title || 'MOVE&TRY');

  const options = {
    body: String(
      payload.body ||
      'Otkrij nešto novo na MOVE&TRY.'
    ),
    icon: '/app/icon-192.png',
    badge: '/app/icon-192.png',
    tag: String(payload.tag || 'moveandtry-update'),
    data: {
      url: payload.url || '/app/'
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// OPEN NOTIFICATION

self.addEventListener('notificationclick', event => {
  event.notification.close();

  const requestedUrl =
    event.notification.data?.url || '/app/';

  const target = new URL(requestedUrl, self.location.origin);

  // Only allow navigation to our own website.
  if (target.origin !== self.location.origin) {
    return;
  }

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    });

    for (const client of windows) {
      if (client.url === target.href && 'focus' in client) {
        return client.focus();
      }
    }

    if (self.clients.openWindow) {
      return self.clients.openWindow(target.href);
    }
  })());
});
