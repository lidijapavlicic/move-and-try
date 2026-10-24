'use strict';

self.addEventListener('push', event => {
  let data = {
    title: 'The Journal',
    body: 'Imaš novu uredničku obavijest.',
    url: '/editor/'
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
      icon: '/editor/icon-192.png',
      badge: '/editor/icon-192.png',
      data: {
        url: data.url || '/editor/'
      }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  const targetUrl = new URL(
    event.notification.data?.url || '/editor/',
    self.location.origin
  ).href;

  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then(windowClients => {
      for (const client of windowClients) {
        if (client.url.startsWith(self.location.origin)) {
          return client.focus().then(() => client.navigate(targetUrl));
        }
      }

      return clients.openWindow(targetUrl);
    })
  );
});
