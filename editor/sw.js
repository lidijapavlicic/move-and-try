
'use strict';

const EDITOR_PATH = new URL(self.registration.scope).pathname;
const ICON_URL = new URL('icon-192.png', self.registration.scope).href;

function getNotificationUrl(data) {
  const articleId =
    typeof data?.article_id === 'string'
      ? data.article_id
      : null;

  let requestedUrl = data?.url || EDITOR_PATH;

  // Podrška za stare poveznice /editor/
  // nakon preseljenja na novu poddomenu.
  if (EDITOR_PATH === '/') {
    try {
      const legacy = new URL(requestedUrl, self.location.origin);

      if (
        (legacy.origin === self.location.origin ||
          legacy.origin === 'https://moveandtry.com') &&
        legacy.pathname.startsWith('/editor/')
      ) {
        requestedUrl =
          legacy.pathname.slice('/editor'.length) +
          legacy.search +
          legacy.hash;
      }
    } catch (_) {
      // Provjera adrese nastavlja se ispod.
    }
  }

  if (articleId && requestedUrl === EDITOR_PATH) {
    requestedUrl =
      `${EDITOR_PATH}?article=${encodeURIComponent(articleId)}`;
  }

  try {
    const url = new URL(requestedUrl, self.location.origin);

    if (
      url.origin !== self.location.origin ||
      !url.pathname.startsWith(EDITOR_PATH)
    ) {
      return new URL(EDITOR_PATH, self.location.origin).href;
    }

    return url.href;
  } catch (_) {
    return new URL(EDITOR_PATH, self.location.origin).href;
  }
}

self.addEventListener('push', event => {
  let data = {
    title: 'The Journal',
    body: 'Imaš novu uredničku obavijest.',
    url: EDITOR_PATH
  };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (_) {
      data.body = event.data.text();
    }
  }

  const title = data.title || 'The Journal';

  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || 'Imaš novu uredničku obavijest.',
      icon: ICON_URL,
      badge: ICON_URL,
      data: {
        url: getNotificationUrl(data)
      }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  const targetUrl = getNotificationUrl(
    event.notification.data || {}
  );

  event.waitUntil(
    (async () => {
      const windowClients = await clients.matchAll({
        type: 'window',
        includeUncontrolled: true
      });

      const editorClients = windowClients.filter(client => {
        try {
          const url = new URL(client.url);

          return (
            url.origin === self.location.origin &&
            url.pathname.startsWith(EDITOR_PATH)
          );
        } catch (_) {
          return false;
        }
      });

      if (editorClients.length > 0) {
        const client = editorClients[0];

        await client.navigate(targetUrl);
        await client.focus();

        return;
      }

      await clients.openWindow(targetUrl);
    })()
  );
});
