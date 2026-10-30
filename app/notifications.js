
'use strict';

// MOVE&TRY — PWA notification centre.
// Works with the notification history stored by /app/sw.js.

(() => {
  const TYPES = {
    get: 'MOVE_TRY_GET_NOTIFICATIONS',
    read: 'MOVE_TRY_MARK_NOTIFICATION_READ',
    all: 'MOVE_TRY_MARK_ALL_NOTIFICATIONS_READ',
    remove: 'MOVE_TRY_DELETE_NOTIFICATION',
    clear: 'MOVE_TRY_CLEAR_NOTIFICATIONS',
    history: 'MOVE_TRY_NOTIFICATIONS_HISTORY',
    changed: 'MOVE_TRY_NOTIFICATIONS_UPDATED',
    error: 'MOVE_TRY_NOTIFICATIONS_ERROR'
  };

  const LABELS = {
    hr: {
      empty: 'Još nema obavijesti.',
      unread: 'Nepročitano',
      all: 'Sve',
      markAll: 'Označi sve pročitanim',
      clear: 'Obriši povijest',
      remove: 'Obriši',
      open: 'Otvori',
      loading: 'Učitavam obavijesti…',
      error: 'Obavijesti se trenutačno ne mogu učitati.',
      confirm: 'Obrisati cijelu povijest obavijesti?'
    },
    en: {
      empty: 'No notifications yet.',
      unread: 'Unread',
      all: 'All',
      markAll: 'Mark all as read',
      clear: 'Clear history',
      remove: 'Delete',
      open: 'Open',
      loading: 'Loading notifications…',
      error: 'Notifications are currently unavailable.',
      confirm: 'Clear all notification history?'
    }
  };

  const state = {
    records: [],
    unreadCount: 0,
    filter: 'all',
    locale: 'hr',
    requestId: 0,
    controller: null,
    ready: false
  };

  const el = id => document.getElementById(id);

  const escapeHTML = value =>
    String(value ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[c]);

  const labels = () => LABELS[state.locale];

  function safeUrl(value) {
    try {
      const url = new URL(
        String(value || '/app/'),
        location.origin
      );

      return url.origin === location.origin
        ? url.pathname + url.search + url.hash
        : '/app/';
    } catch {
      return '/app/';
    }
  }

  function dateText(timestamp) {
    const time = Number(timestamp);

    if (!Number.isFinite(time)) return '';

    return new Intl.DateTimeFormat(
      state.locale === 'hr' ? 'hr-HR' : 'en-GB',
      {
        dateStyle: 'medium',
        timeStyle: 'short'
      }
    ).format(new Date(time));
  }

  async function worker() {
    if (!('serviceWorker' in navigator)) {
      throw new Error('Service worker unavailable');
    }

    const registration =
      await navigator.serviceWorker.ready;

    if (!registration.active) {
      throw new Error('Service worker inactive');
    }

    return registration.active;
  }

  async function send(type, extra = {}) {
    const active = await worker();

    active.postMessage({
      type,
      requestId: ++state.requestId,
      ...extra
    });
  }

  function render() {
    const dot = el('notification-dot');

    if (dot) {
      dot.hidden = state.unreadCount === 0;
    }

    const button = el('notifications-button');

    if (button) {
      const name = state.locale === 'hr'
        ? 'Obavijesti'
        : 'Notifications';

      button.setAttribute(
        'aria-label',
        state.unreadCount
          ? `${name} (${state.unreadCount})`
          : name
      );
    }

    const host = el('app-notification-history');

    if (!host) return;

    const t = labels();

    const shown = state.filter === 'unread'
      ? state.records.filter(item => !item.read)
      : state.records;

    host.innerHTML = `
      <div class="app-notification-toolbar">
        <div class="app-notification-filters">
          <button
            type="button"
            data-notification-filter="all"
            aria-pressed="${state.filter === 'all'}"
          >${t.all}</button>

          <button
            type="button"
            data-notification-filter="unread"
            aria-pressed="${state.filter === 'unread'}"
          >${t.unread} (${state.unreadCount})</button>
        </div>

        <div class="app-notification-actions">
          <button
            type="button"
            data-notification-action="mark-all"
            ${state.unreadCount ? '' : 'disabled'}
          >${t.markAll}</button>

          <button
            type="button"
            data-notification-action="clear"
            ${state.records.length ? '' : 'disabled'}
          >${t.clear}</button>
        </div>
      </div>

      ${
        shown.length
          ? `<div class="app-notification-list">
              ${shown.map(item => `
                <article
                  class="app-notification-item"
                  data-unread="${!item.read}"
                >
                  <div class="app-notification-meta">
                    ${escapeHTML(item.category || 'MOVE&TRY')}
                    ·
                    ${escapeHTML(dateText(item.createdAt))}
                  </div>

                  <strong>${escapeHTML(item.title)}</strong>
                  <p>${escapeHTML(item.body)}</p>

                  <div class="app-notification-item-actions">
                    <a
                      href="${escapeHTML(safeUrl(item.url))}"
                      data-notification-open="${escapeHTML(item.id)}"
                    >${t.open} →</a>

                    <button
                      type="button"
                      data-notification-action="remove"
                      data-notification-id="${escapeHTML(item.id)}"
                    >${t.remove}</button>
                  </div>
                </article>
              `).join('')}
            </div>`
          : `<p class="app-notification-empty">
              ${t.empty}
            </p>`
      }
    `;
  }

  async function refresh() {
    const host = el('app-notification-history');

    if (host && !state.ready) {
      host.textContent = labels().loading;
    }

    try {
      await send(TYPES.get);
    } catch (error) {
      if (host) {
        host.textContent = labels().error;
      }

      console.warn('MOVE&TRY notifications:', error);
    }
  }

  function onMessage(event) {
    if (event.origin !== location.origin) return;

    const data = event.data || {};

    if (data.type === TYPES.changed) {
      refresh();
      return;
    }

    if (data.type === TYPES.history) {
      state.records = Array.isArray(data.notifications)
        ? data.notifications.filter(
            item => item && typeof item.id === 'string'
          )
        : [];

      state.unreadCount = state.records.filter(
        item => !item.read
      ).length;

      state.ready = true;
      render();
    } else if (data.type === TYPES.error) {
      const host = el('app-notification-history');

      if (host) {
        host.textContent = labels().error;
      }
    }
  }

  function onClick(event) {
    const filter = event.target.closest(
      '[data-notification-filter]'
    );

    if (filter) {
      state.filter = filter.dataset.notificationFilter;
      render();
      return;
    }

    const open = event.target.closest(
      '[data-notification-open]'
    );

    if (open) {
      send(TYPES.read, {
        id: open.dataset.notificationOpen
      }).catch(console.warn);

      return;
    }

    const action = event.target.closest(
      '[data-notification-action]'
    );

    if (!action) return;

    const name = action.dataset.notificationAction;

    if (name === 'mark-all') {
      send(TYPES.all).catch(console.warn);
    }

    if (name === 'remove') {
      send(TYPES.remove, {
        id: action.dataset.notificationId
      }).catch(console.warn);
    }

    if (
      name === 'clear' &&
      window.confirm(labels().confirm)
    ) {
      send(TYPES.clear).catch(console.warn);
    }
  }

  function init(options = {}) {
    if (
      options.locale === 'hr' ||
      options.locale === 'en'
    ) {
      state.locale = options.locale;
    }

    if (!state.controller) {
      state.controller = new AbortController();

      navigator.serviceWorker?.addEventListener(
        'message',
        onMessage,
        { signal: state.controller.signal }
      );

      document.addEventListener(
        'click',
        onClick,
        { signal: state.controller.signal }
      );
    }

    render();
    refresh();
  }

  function setLocale(locale) {
    if (locale !== 'hr' && locale !== 'en') return;

    state.locale = locale;
    render();
  }

  window.MoveTryNotifications = Object.freeze({
    init,
    refresh,
    setLocale
  });
})();

