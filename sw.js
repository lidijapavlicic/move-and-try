
'use strict';

/*
 * MOVE&TRY — Public PWA Service Worker
 *
 * Public website: https://moveandtry.com/
 * Private editor: /editor/ (separate service worker)
 *
 * Public push notifications only.
 */

const PUBLIC_CACHE = 'moveandtry-public-v2';

const OFFLINE_URL = '/offline.html';

const EXCLUDED_PATHS = [
  '/editor/',
  '/app/'
];

function isExcluded(pathname) {
  return EXCLUDED_PATHS.some(path =>
    pathname.startsWith(path)
  );
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(PUBLIC_CACHE)
      .then(cache => cache.addAll([
        '/',
        '/hr/'
      ]))
  );

  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();

    await Promise.all(
      keys
        .filter(key =>
          key.startsWith('moveandtry-public-') &&
          key !== PUBLIC_CACHE
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
    isExcluded(url.pathname)
  ) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(request);

        if (cached) return cached;

        const fallback = await caches.match(
          url.pathname.startsWith('/hr/')
            ? '/hr/'
            : '/'
        );

        return fallback || Response.error();
      })
    );
  }
});

self.addEventListener('push', event => {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {
      body: event.data ? event.data.text() : ''
    };
  }

  const title = data.title || 'MOVE&TRY';

  const options = {
    body: data.body || 'Discover something new to try.',
    icon: '/app/icons/icon-192.png',
    badge: '/app/icons/icon-192.png',
    tag: data.tag || 'moveandtry-update',
    data: {
      url: data.url || '/'
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  const target = event.notification.data?.url || '/';

  const destination = new URL(
    target,
    self.location.origin
  );

  if (
    destination.origin !== self.location.origin ||
    isExcluded(destination.pathname)
  ) {
    return;
  }

  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    });

    for (const client of clientsList) {
      const clientUrl = new URL(client.url);

      if (
        clientUrl.origin === destination.origin &&
        !isExcluded(clientUrl.pathname)
      ) {
        await client.navigate(destination.href);
        return client.focus();
      }
    }

    return self.clients.openWindow(destination.href);
  })());
});
