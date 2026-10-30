
'use strict';

// MOVE&TRY PWA Service Worker
// Scope: /app/
// Push notifications and local notification history.

const CACHE_NAME = 'moveandtry-public-app-shell-v4';
const CACHE_PREFIX = 'moveandtry-public-app-';
const APP_SHELL = ['/app/', '/app/index.html'];

const DB_NAME = 'moveandtry-app-notifications';
const DB_VERSION = 1;
const STORE_NAME = 'notifications';
const MAX_HISTORY = 100;

// APP SHELL

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
          key.startsWith(CACHE_PREFIX) &&
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

// DATABASE

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(
          STORE_NAME,
          { keyPath: 'id' }
        );

        store.createIndex('createdAt', 'createdAt');
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function runStore(mode, operation) {
  const db = await openDatabase();

  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);

      let result;
      let settled = false;

      transaction.oncomplete = () => {
        settled = true;
        resolve(result);
      };

      transaction.onerror = () => {
        if (!settled) reject(transaction.error);
      };

      transaction.onabort = () => {
        if (!settled) reject(transaction.error);
      };

      try {
        operation(store, value => {
          result = value;
        });
      } catch (error) {
        transaction.abort();
        reject(error);
      }
    });
  } finally {
    db.close();
  }
}

function getAllNotifications() {
  return runStore('readonly', (store, done) => {
    const request = store.getAll();

    request.onsuccess = () => {
      const records = request.result || [];

      records.sort((a, b) =>
        b.createdAt - a.createdAt
      );

      done(records);
    };
  });
}

async function saveNotification(record) {
  await runStore('readwrite', (store, done) => {
    store.put(record);
    done(true);
  });

  await trimHistory();
}

async function trimHistory() {
  const records = await getAllNotifications();

  if (records.length <= MAX_HISTORY) return;

  const oldRecords = records.slice(MAX_HISTORY);

  await runStore('readwrite', store => {
    for (const record of oldRecords) {
      store.delete(record.id);
    }
  });
}

async function markNotificationRead(id) {
  await runStore('readwrite', store => {
    const request = store.get(id);

    request.onsuccess = () => {
      const record = request.result;

      if (!record) return;

      record.read = true;
      store.put(record);
    };
  });
}

async function markAllNotificationsRead() {
  const records = await getAllNotifications();

  await runStore('readwrite', store => {
    for (const record of records) {
      if (!record.read) {
        record.read = true;
        store.put(record);
      }
    }
  });
}

async function deleteNotification(id) {
  await runStore('readwrite', store => {
    store.delete(id);
  });
}

async function clearNotificationHistory() {
  await runStore('readwrite', store => {
    store.clear();
  });
}

// SAFE LINKS

function safeTargetUrl(value) {
  try {
    const target = new URL(
      String(value || '/app/'),
      self.location.origin
    );

    if (
      target.origin !== self.location.origin ||
      !['https:', 'http:'].includes(target.protocol)
    ) {
      return '/app/';
    }

    return target.pathname +
      target.search +
      target.hash;
  } catch {
    return '/app/';
  }
}

// APP COMMUNICATION

async function notifyOpenClients() {
  const clients = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true
  });

  for (const client of clients) {
    client.postMessage({
      type: 'MOVE_TRY_NOTIFICATIONS_UPDATED'
    });
  }
}

async function sendHistoryToClient(client, requestId) {
  const records = await getAllNotifications();

  client.postMessage({
    type: 'MOVE_TRY_NOTIFICATIONS_HISTORY',
    requestId,
    notifications: records,
    unreadCount: records.filter(
      item => !item.read
    ).length
  });
}

self.addEventListener('message', event => {
  const data = event.data || {};
  const client = event.source;

  if (!client || typeof client.postMessage !== 'function') {
    return;
  }

  const allowedTypes = new Set([
    'MOVE_TRY_GET_NOTIFICATIONS',
    'MOVE_TRY_MARK_NOTIFICATION_READ',
    'MOVE_TRY_MARK_ALL_NOTIFICATIONS_READ',
    'MOVE_TRY_DELETE_NOTIFICATION',
    'MOVE_TRY_CLEAR_NOTIFICATIONS'
  ]);

  if (!allowedTypes.has(data.type)) return;

  event.waitUntil((async () => {
    try {
      if (data.type === 'MOVE_TRY_GET_NOTIFICATIONS') {
        await sendHistoryToClient(client, data.requestId);
        return;
      }

      if (
        data.type === 'MOVE_TRY_MARK_NOTIFICATION_READ' &&
        typeof data.id === 'string'
      ) {
        await markNotificationRead(data.id);
      }

      if (data.type === 'MOVE_TRY_MARK_ALL_NOTIFICATIONS_READ') {
        await markAllNotificationsRead();
      }

      if (
        data.type === 'MOVE_TRY_DELETE_NOTIFICATION' &&
        typeof data.id === 'string'
      ) {
        await deleteNotification(data.id);
      }

      if (data.type === 'MOVE_TRY_CLEAR_NOTIFICATIONS') {
        await clearNotificationHistory();
      }

      await notifyOpenClients();

      await sendHistoryToClient(
        client,
        data.requestId
      );
    } catch (error) {
      console.error(
        'MOVE&TRY notification history:',
        error
      );

      client.postMessage({
        type: 'MOVE_TRY_NOTIFICATIONS_ERROR',
        requestId: data.requestId
      });
    }
  })());
});

// PUSH NOTIFICATIONS

self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let payload = {};

    try {
      payload = event.data
        ? event.data.json()
        : {};
    } catch {
      payload = {
        body: event.data
          ? event.data.text()
          : ''
      };
    }

    if (
      !payload ||
      typeof payload !== 'object' ||
      Array.isArray(payload)
    ) {
      payload = {};
    }

    const title = String(
      payload.title || 'MOVE&TRY'
    ).slice(0, 200);

    const body = String(
      payload.body ||
      'Otkrij nešto novo na MOVE&TRY.'
    ).slice(0, 500);

    const url = safeTargetUrl(payload.url);

    const category = String(
      payload.category || ''
    ).slice(0, 50);

    const tag = String(
      payload.tag || 'moveandtry-update'
    ).slice(0, 150);

    const id = String(
      payload.notificationId ||
      payload.publicationId ||
      payload.deliveryId ||
      crypto.randomUUID()
    ).slice(0, 200);

    const record = {
      id,
      title,
      body,
      url,
      category,
      createdAt: Date.now(),
      read: false
    };

    // Save first, so the notification can appear
    // in the app's notification centre.
    try {
      await saveNotification(record);
      await notifyOpenClients();
    } catch (error) {
      // A storage error must not block system push.
      console.error(
        'MOVE&TRY notification save:',
        error
      );
    }

    await self.registration.showNotification(
      title,
      {
        body,
        icon: '/app/icon-192.png',
        badge: '/app/icon-192.png',
        tag,
        data: {
          url,
          notificationId: id
        }
      }
    );
  })());
});

// OPEN NOTIFICATION

self.addEventListener('notificationclick', event => {
  event.notification.close();

  event.waitUntil((async () => {
    const id =
      event.notification.data?.notificationId;

    if (typeof id === 'string') {
      try {
        await markNotificationRead(id);
        await notifyOpenClients();
      } catch (error) {
        console.error(
          'MOVE&TRY notification read:',
          error
        );
      }
    }

    const requestedUrl =
      event.notification.data?.url || '/app/';

    const path = safeTargetUrl(requestedUrl);
    const target = new URL(
      path,
      self.location.origin
    );

    const windows = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    });

    for (const client of windows) {
      if (
        client.url === target.href &&
        'focus' in client
      ) {
        return client.focus();
      }
    }

    if (self.clients.openWindow) {
      return self.clients.openWindow(target.href);
    }
  })());
});
