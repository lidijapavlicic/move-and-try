
/*
 * MOVE&TRY — Notification Centre
 * File: /app/notifications.js
 *
 * Compatible with /app/sw.js (v4)
 * Styles: /app/notifications.css
 *
 * No Supabase access from this module.
 */

(() => {
  'use strict';

  const HOST_ID = 'app-notification-history';
  const MAX_ITEMS = 100;

  const MSG = Object.freeze({
    GET: 'MOVE_TRY_GET_NOTIFICATIONS',
    READ: 'MOVE_TRY_MARK_NOTIFICATION_READ',
    READ_ALL: 'MOVE_TRY_MARK_ALL_NOTIFICATIONS_READ',
    DELETE: 'MOVE_TRY_DELETE_NOTIFICATION',
    CLEAR: 'MOVE_TRY_CLEAR_NOTIFICATIONS',
    HISTORY: 'MOVE_TRY_NOTIFICATIONS_HISTORY',
    UPDATED: 'MOVE_TRY_NOTIFICATIONS_UPDATED',
    ERROR: 'MOVE_TRY_NOTIFICATIONS_ERROR'
  });

  const I18N = {
    hr: {
      heading: 'Primljene obavijesti',
      markAll: 'Označi sve pročitanima',
      clear: 'Obriši sve',
      delete: 'Obriši',
      empty: 'Još nema primljenih obavijesti.',
      error: 'Povijest obavijesti trenutačno nije dostupna.',
      bell: 'Obavijesti',
      unread: 'Nepročitanih obavijesti: ',
      unreadItem: 'Nepročitana obavijest',
      confirmClear: 'Želiš li obrisati sve obavijesti?'
    },
    en: {
      heading: 'Received notifications',
      markAll: 'Mark all as read',
      clear: 'Clear all',
      delete: 'Delete',
      empty: 'No received notifications yet.',
      error: 'Notification history is currently unavailable.',
      bell: 'Notifications',
      unread: 'Unread notifications: ',
      unreadItem: 'Unread notification',
      confirmClear: 'Delete all notifications?'
    }
  };

  let locale = 'hr';
  let initialized = false;
  let records = [];
  let refreshScheduled = false;
  let historyError = false;

  function text() {
    return I18N[locale];
  }

  function host() {
    return document.getElementById(HOST_ID);
  }

  function escapeHTML(value) {
    return String(value ?? '').replace(
      /[&<>"']/g,
      char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[char]
    );
  }

  function safeURL(value) {
    try {
      const url = new URL(
        String(value || '/app/'),
        location.origin
      );

      if (url.origin !== location.origin) {
        return '/app/';
      }

      if (!['http:', 'https:'].includes(url.protocol)) {
        return '/app/';
      }

      return url.pathname + url.search + url.hash;
    } catch (_) {
      return '/app/';
    }
  }

  function timestamp(item) {
    const value =
      item.createdAt ??
      item.receivedAt ??
      item.timestamp ??
      item.date;

    if (typeof value === 'number') {
      return value < 100000000000
        ? value * 1000
        : value;
    }

    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function formattedDate(item) {
    const time = timestamp(item);
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
    if (!item || typeof item !== 'object') {
      return null;
    }

    const id =
      item.id ??
      item.notificationId ??
      item.publicationId ??
      item.deliveryId;

    if (id === undefined || id === null || id === '') {
      return null;
    }

    return {
      id: String(id),
      title: String(item.title || 'MOVE&TRY'),
      body: String(item.body || ''),
      category: String(item.category || ''),
      url: safeURL(item.url),
      createdAt: timestamp(item),
      read: item.read === true
    };
  }

  function updateRecords(items) {
    if (!Array.isArray(items)) return;

    const unique = new Map();

    for (const item of items) {
      const record = normalize(item);

      if (record && !unique.has(record.id)) {
        unique.set(record.id, record);
      }
    }

    records = Array.from(unique.values())
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, MAX_ITEMS);

    historyError = false;
    render();
  }

  function updateBell() {
    const unreadCount = records.filter(
      item => !item.read
    ).length;

    const dot = document.getElementById(
      'notification-dot'
    );

    if (dot) {
      dot.hidden = unreadCount === 0;
    }

    const bell = document.getElementById(
      'notifications-button'
    );

    if (bell) {
      bell.setAttribute(
        'aria-label',
        unreadCount
          ? text().unread + unreadCount
          : text().bell
      );
    }
  }

  function render() {
    updateBell();

    const container = host();
    if (!container) return;

    const unreadCount = records.filter(
      item => !item.read
    ).length;

    const heading = `
      <div class="notification-history-header">
        <h3 class="notification-history-title">
          ${escapeHTML(text().heading)}
        </h3>
        <div class="notification-history-actions">
          ${unreadCount > 0 ? `
            <button
              type="button"
              class="notification-history-action"
              data-notification-action="read-all"
            >${escapeHTML(text().markAll)}</button>
          ` : ''}
          ${records.length > 0 ? `
            <button
              type="button"
              class="notification-history-action"
              data-notification-action="clear"
            >${escapeHTML(text().clear)}</button>
          ` : ''}
        </div>
      </div>
    `;

    if (historyError && !records.length) {
      container.innerHTML = heading + `
        <p class="notification-history-error">
          ${escapeHTML(text().error)}
        </p>
      `;
      return;
    }

    if (!records.length) {
      container.innerHTML = heading + `
        <div class="notification-history-empty">
          ${escapeHTML(text().empty)}
        </div>
      `;
      return;
    }

    const list = records.map(item => {
      const unread = !item.read;

      return `
        <li class="notification-history-item ${unread ? 'is-unread' : ''}">
          <a
            class="notification-history-link"
            href="${escapeHTML(item.url)}"
            data-notification-action="open"
            data-notification-id="${escapeHTML(item.id)}"
            ${unread ? `aria-label="${escapeHTML(text().unreadItem + ': ' + item.title)}"` : ''}
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
              ${escapeHTML(formattedDate(item))}
            </span>

            <button
              type="button"
              class="notification-history-delete"
              data-notification-action="delete"
              data-notification-id="${escapeHTML(item.id)}"
              aria-label="${escapeHTML(text().delete + ': ' + item.title)}"
            >${escapeHTML(text().delete)}</button>
          </div>
        </li>
      `;
    }).join('');

    container.innerHTML = heading + `
      <ul class="notification-history-list">
        ${list}
      </ul>
    `;
  }

  async function send(type, extra = {}) {
    if (!('serviceWorker' in navigator)) {
      return false;
    }

    try {
      const registration =
        await navigator.serviceWorker.ready;

      const worker =
        navigator.serviceWorker.controller ||
        registration.active;

      if (!worker) return false;

      worker.postMessage({
        type,
        ...extra
      });

      return true;
    } catch (error) {
      console.warn(
        'MOVE&TRY notification communication:',
        error
      );
      return false;
    }
  }

  async function refresh() {
    const sent = await send(MSG.GET);

    if (!sent) {
      historyError = true;
      render();
    }

    return sent;
  }

  function scheduleRefresh() {
    if (refreshScheduled) return;

    refreshScheduled = true;

    queueMicrotask(() => {
      refreshScheduled = false;
      refresh();
    });
  }

  function onWorkerMessage(event) {
    const data = event.data;

    if (!data || typeof data !== 'object') {
      return;
    }

    switch (data.type) {
      case MSG.HISTORY:
        updateRecords(data.notifications);
        break;

      case MSG.UPDATED:
        // SW sends an update signal without records.
        // Request the complete current history.
        scheduleRefresh();
        break;

      case MSG.ERROR:
        historyError = true;
        render();
        break;

      default:
        break;
    }
  }

  async function performAction(action, id) {
    switch (action) {
      case 'open':
        if (id) {
          await send(MSG.READ, { id });
        }
        break;

      case 'delete':
        if (id) {
          await send(MSG.DELETE, { id });
        }
        break;

      case 'read-all':
        await send(MSG.READ_ALL);
        break;

      case 'clear':
        if (window.confirm(text().confirmClear)) {
          await send(MSG.CLEAR);
        }
        break;

      default:
        break;
    }
  }

  function onClick(event) {
    const button = event.target.closest(
      '[data-notification-action]'
    );

    if (!button || !host()?.contains(button)) {
      return;
    }

    const action = button.dataset.notificationAction;
    const id = button.dataset.notificationId;

    if (action === 'open') {
      // Keep native link navigation.
      // SW updates the stored read state.
      performAction(action, id);
      return;
    }

    event.preventDefault();
    performAction(action, id);
  }

  function setLocale(next) {
    locale = next === 'en' ? 'en' : 'hr';
    render();
  }

  function ensureHost() {
    let container = host();

    if (container) return container;

    const panel = document.querySelector(
      '#notifications-panel .panel'
    );

    if (!panel) return null;

    container = document.createElement('section');
    container.id = HOST_ID;
    container.setAttribute(
      'aria-label',
      'Notification history'
    );

    const oldEmpty = panel.querySelector(
      '.empty-notifications'
    );

    if (oldEmpty) {
      oldEmpty.hidden = true;
      oldEmpty.insertAdjacentElement(
        'beforebegin',
        container
      );
    } else {
      panel.appendChild(container);
    }

    return container;
  }

  function init(options = {}) {
    setLocale(options.locale);

    const container = ensureHost();

    if (!initialized) {
      initialized = true;

      if (container) {
        container.addEventListener(
          'click',
          onClick
        );
      }

      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener(
          'message',
          onWorkerMessage
        );

        navigator.serviceWorker.addEventListener(
          'controllerchange',
          scheduleRefresh
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
