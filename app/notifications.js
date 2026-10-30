
/*
 * MOVE&TRY — Notification History
 * File: /app/notifications.js
 *
 * Requires /app/sw.js with the MOVE_TRY_* message protocol.
 * Styles: /app/notifications.css
 */

(() => {
  'use strict';

  const HOST_ID = 'app-notification-history';
  const MAX_ITEMS = 100;

  const MESSAGES = {
    get: 'MOVE_TRY_GET_NOTIFICATIONS',
    read: 'MOVE_TRY_MARK_NOTIFICATION_READ',
    readAll: 'MOVE_TRY_MARK_ALL_NOTIFICATIONS_READ',
    remove: 'MOVE_TRY_DELETE_NOTIFICATION',
    clear: 'MOVE_TRY_CLEAR_NOTIFICATIONS',
    history: 'MOVE_TRY_NOTIFICATIONS_HISTORY',
    updated: 'MOVE_TRY_NOTIFICATIONS_UPDATED'
  };

  const TEXT = {
    hr: {
      title: 'Primljene obavijesti',
      readAll: 'Označi sve pročitanima',
      clear: 'Obriši sve',
      remove: 'Obriši',
      empty: 'Još nema primljenih obavijesti.',
      unavailable: 'Povijest obavijesti nije dostupna na ovom uređaju.',
      open: 'Otvori obavijest',
      unread: 'Nepročitana obavijest',
      bell: 'Obavijesti',
      unreadCount: 'Nepročitanih obavijesti: '
    },
    en: {
      title: 'Received notifications',
      readAll: 'Mark all as read',
      clear: 'Clear all',
      remove: 'Delete',
      empty: 'No received notifications yet.',
      unavailable: 'Notification history is unavailable on this device.',
      open: 'Open notification',
      unread: 'Unread notification',
      bell: 'Notifications',
      unreadCount: 'Unread notifications: '
    }
  };

  let locale = 'hr';
  let initialized = false;
  let listening = false;
  let records = [];
  let workerReady = false;

  function t() {
    return TEXT[locale];
  }

  function host() {
    return document.getElementById(HOST_ID);
  }

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  function safeURL(value) {
    if (typeof value !== 'string') return '/app/';

    try {
      const url = new URL(value, location.origin);

      if (
        url.origin !== location.origin ||
        !['https:', 'http:'].includes(url.protocol)
      ) {
        return '/app/';
      }

      return url.pathname + url.search + url.hash;
    } catch (_) {
      return '/app/';
    }
  }

  function dateValue(item) {
    const value =
      item.receivedAt ??
      item.createdAt ??
      item.timestamp ??
      item.date ??
      null;

    const time = typeof value === 'number'
      ? value < 100000000000 ? value * 1000 : value
      : Date.parse(value);

    return Number.isFinite(time) ? time : 0;
  }

  function dateLabel(item) {
    const time = dateValue(item);
    if (!time) return '';

    try {
      return new Intl.DateTimeFormat(
        locale === 'hr' ? 'hr-HR' : 'en-GB',
        {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }
      ).format(new Date(time));
    } catch (_) {
      return '';
    }
  }

  function normalize(item) {
    if (!item || typeof item !== 'object') return null;

    const id =
      item.id ??
      item.notificationId ??
      item.publicationId ??
      item.deliveryId;

    if (id === null || id === undefined || id === '') {
      return null;
    }

    return {
      ...item,
      id: String(id),
      title: String(item.title ?? 'MOVE&TRY'),
      body: String(item.body ?? ''),
      category: String(item.category ?? ''),
      url: safeURL(item.url ?? item.targetUrl ?? '/app/'),
      read: item.read === true || item.isRead === true
    };
  }

  function setRecords(items) {
    if (!Array.isArray(items)) return;

    const unique = new Map();

    for (const item of items) {
      const normalized = normalize(item);
      if (normalized && !unique.has(normalized.id)) {
        unique.set(normalized.id, normalized);
      }
    }

    records = [...unique.values()]
      .sort((a, b) => dateValue(b) - dateValue(a))
      .slice(0, MAX_ITEMS);

    render();
  }

  function updateBell() {
    const unread = records.filter(item => !item.read).length;

    const dot = document.getElementById('notification-dot');
    if (dot) dot.hidden = unread === 0;

    const button = document.getElementById('notifications-button');

    if (button) {
      button.setAttribute(
        'aria-label',
        unread
          ? t().unreadCount + unread
          : t().bell
      );
    }
  }

  function render() {
    updateBell();

    const container = host();
    if (!container) return;

    const unread = records.filter(item => !item.read).length;

    const header = `
      <div class="notification-history-header">
        <h3 class="notification-history-title">
          ${escapeHTML(t().title)}
        </h3>
        <div class="notification-history-actions">
          ${unread ? `
            <button
              type="button"
              class="notification-history-action"
              data-notification-action="read-all"
            >${escapeHTML(t().readAll)}</button>
          ` : ''}
          ${records.length ? `
            <button
              type="button"
              class="notification-history-action"
              data-notification-action="clear"
            >${escapeHTML(t().clear)}</button>
          ` : ''}
        </div>
      </div>
    `;

    if (!records.length) {
      container.innerHTML = header + `
        <div class="notification-history-empty">
          ${escapeHTML(t().empty)}
        </div>
      `;
      return;
    }

    container.innerHTML = header + `
      <ul class="notification-history-list">
        ${records.map(item => `
          <li class="notification-history-item ${item.read ? '' : 'is-unread'}">
            <a
              class="notification-history-link"
              href="${escapeHTML(item.url)}"
              data-notification-action="open"
              data-notification-id="${escapeHTML(item.id)}"
              ${item.read ? '' : `aria-label="${escapeHTML(t().unread + ': ' + item.title)}"`}
            >
              <strong class="notification-history-item-title">
                ${escapeHTML(item.title)}
              </strong>
              ${item.body ? `
                <span class="notification-history-item-body">
                  ${escapeHTML(item.body)}
                </span>
              ` : ''}
            </a>
            <div class="notification-history-item-meta">
              <span>
                ${item.category ? `
                  <span class="notification-history-category">
                    ${escapeHTML(item.category)}
                  </span>
                ` : ''}
                ${escapeHTML(dateLabel(item))}
              </span>
              <button
                type="button"
                class="notification-history-delete"
                data-notification-action="delete"
                data-notification-id="${escapeHTML(item.id)}"
                aria-label="${escapeHTML(t().remove + ': ' + item.title)}"
              >${escapeHTML(t().remove)}</button>
            </div>
          </li>
        `).join('')}
      </ul>
    `;
  }

  async function send(type, extra = {}) {
    if (!('serviceWorker' in navigator)) {
      workerReady = false;
      return false;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const worker =
        navigator.serviceWorker.controller ||
        registration.active;

      if (!worker) {
        workerReady = false;
        return false;
      }

      worker.postMessage({ type, ...extra });
      workerReady = true;
      return true;
    } catch (error) {
      console.warn('MOVE&TRY notification history:', error);
      workerReady = false;
      return false;
    }
  }

  function refresh() {
    return send(MESSAGES.get);
  }

  function onWorkerMessage(event) {
    const data = event.data;

    if (!data || typeof data !== 'object') return;

    if (
      data.type !== MESSAGES.history &&
      data.type !== MESSAGES.updated
    ) {
      return;
    }

    const items =
      Array.isArray(data.notifications)
        ? data.notifications
        : Array.isArray(data.history)
          ? data.history
          : Array.isArray(data.items)
            ? data.items
            : null;

    if (items) setRecords(items);
  }

  function onHistoryClick(event) {
    const target = event.target.closest(
      '[data-notification-action]'
    );

    if (!target || !host()?.contains(target)) return;

    const action = target.dataset.notificationAction;
    const id = target.dataset.notificationId;

    if (action === 'open' && id) {
      // Navigation remains native.
      // The service worker stores the read state.
      send(MESSAGES.read, { id });
      return;
    }

    if (action === 'delete' && id) {
      event.preventDefault();
      send(MESSAGES.remove, { id });
      return;
    }

    if (action === 'read-all') {
      event.preventDefault();
      send(MESSAGES.readAll);
      return;
    }

    if (action === 'clear') {
      event.preventDefault();
      send(MESSAGES.clear);
    }
  }

  function setLocale(next) {
    locale = next === 'en' ? 'en' : 'hr';
    render();
  }

  function init(options = {}) {
    setLocale(options.locale);

    if (!initialized) {
      initialized = true;

      const container = host();
      if (container) {
        container.addEventListener(
          'click',
          onHistoryClick
        );
      }

      if (
        'serviceWorker' in navigator &&
        !listening
      ) {
        listening = true;

        navigator.serviceWorker.addEventListener(
          'message',
          onWorkerMessage
        );

        navigator.serviceWorker.addEventListener(
          'controllerchange',
          refresh
        );
      }
    }

    render();
    return refresh();
  }

  window.MoveTryNotifications = Object.freeze({
    init,
    refresh,
    setLocale
  });
})();
