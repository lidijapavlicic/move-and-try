/* Upcoming workshops — distinct from permanent activities. */
(() => {
  'use strict';

  let items = null;
  let pending = null;

  const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  const loc = (obj, language) =>
    typeof obj === 'object' && obj
      ? String(obj[language] || obj.hr || '')
      : String(obj || '');

  const safe = url =>
    typeof url === 'string' && /^\/(?!\/)[\w./-]+$/.test(url)
      ? url
      : '#';

  function isAppTicker(node) {
    return node.classList.contains('mt-ws-app-ticker');
  }

  function lang(node) {
    // The app sets the document language after calling mount(view).
    // apply() runs asynchronously, so the document language is ready.
    if (isAppTicker(node)) {
      return document.documentElement.lang === 'en' ? 'en' : 'hr';
    }
    return node.dataset.lang === 'en' ? 'en' : 'hr';
  }

  function today() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Zagreb',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(new Date());

    const value = type => parts.find(p => p.type === type)?.value || '';

    return value('year') + '-' + value('month') + '-' + value('day');
  }

  function upcoming() {
    const currentDate = today();

    return (items || [])
      .filter(workshop =>
        workshop.published === true &&
        /^\d{4}-\d{2}-\d{2}$/.test(workshop.date || '') &&
        workshop.date >= currentDate
      )
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  function date(workshop, language) {
    const [year, month, day] = workshop.date.split('-');

    return language === 'hr'
      ? Number(day) + '. ' + Number(month) + '. ' + year + '.'
      : new Intl.DateTimeFormat('en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC'
        }).format(new Date(workshop.date + 'T12:00:00Z'));
  }

  function load() {
    if (items) return Promise.resolve(items);
    if (pending) return pending;

    pending = fetch('/data/workshops.json', { cache: 'no-store' })
      .then(response => {
        if (!response.ok) {
          throw Error('Workshops HTTP ' + response.status);
        }
        return response.json();
      })
      .then(data => {
        if (!Array.isArray(data.workshops)) {
          throw Error('Invalid workshops');
        }
        items = data.workshops;
        return items;
      })
      .finally(() => {
        pending = null;
      });

    return pending;
  }

  function ticker(workshops, language, inApp = false) {
    const parts = workshops.map(workshop =>
      '<a class="mt-ws-event" href="' +
        escape(safe(loc(workshop.url, language))) + '">' +
        '<strong>' + escape(date(workshop, language)) + '</strong>✦ ' +
        escape(loc(workshop.title, language)) + ' · ' +
        escape(workshop.organizer) +
      '</a>'
    ).join('');

    const href = language === 'hr'
      ? '/hr/where-to-try.html#aktualne-radionice'
      : '/where-to-try.html#aktualne-radionice';

    const allLink = inApp
      ? 'href="#where" data-open-tab="where"'
      : 'href="' + href + '"';

    return '<div class="mt-ws-bar">' +
      '<span class="mt-ws-tag">✦ ' +
        (language === 'hr' ? 'AKTUALNO' : 'UPCOMING') +
      '</span>' +
      '<div class="mt-ws-window"><div class="mt-ws-track">' +
        '<div class="mt-ws-run">' + parts + '</div>' +
        '<div class="mt-ws-run" aria-hidden="true" inert>' +
          parts +
        '</div>' +
      '</div></div>' +
      '<a class="mt-ws-all" ' + allLink + '>' +
        (language === 'hr'
          ? 'POGLEDAJ RADIONICE →'
          : 'VIEW WORKSHOPS →') +
      '</a>' +
    '</div>';
  }

  function listing(workshops, language) {
    return '<div class="mt-ws-list">' +
      '<p class="mt-ws-eyebrow">MOVE&TRY / ' +
        (language === 'hr' ? 'KALENDAR' : 'CALENDAR') +
      '</p>' +
      '<h2>' +
        (language === 'hr'
          ? 'AKTUALNE RADIONICE'
          : 'UPCOMING WORKSHOPS') +
      '</h2>' +
      '<p class="mt-ws-intro">' +
        (language === 'hr'
          ? 'Pronađi konkretne termine i prilike za isprobati nešto novo.'
          : 'Discover upcoming dates and opportunities to try something new.') +
      '</p>' +
      '<div class="mt-ws-cards">' +
        workshops.map(workshop =>
          '<a class="mt-ws-card" href="' +
            escape(safe(loc(workshop.url, language))) + '">' +
            '<img src="' + escape(safe(workshop.image)) +
              '" alt="' + escape(loc(workshop.title, language)) +
              '" loading="lazy">' +
            '<div class="mt-ws-copy">' +
              '<small>' +
                escape(date(workshop, language)) +
                ' · ' + escape(workshop.time) +
              '</small>' +
              '<h3>' +
                escape(loc(workshop.title, language)) +
              '</h3>' +
              '<small>' +
                escape(workshop.organizer) +
                ' · ' + escape(workshop.city) +
              '</small>' +
              '<p>' +
                escape(loc(workshop.description, language)) +
              '</p>' +
              '<span class="mt-ws-action">' +
                (language === 'hr'
                  ? 'DETALJI I PRIJAVA →'
                  : 'DETAILS & REGISTRATION →') +
              '</span>' +
            '</div>' +
          '</a>'
        ).join('') +
      '</div></div>';
  }

  function detail(workshop, language) {
    const box = (key, value) =>
      '<div class="current-workshop-detail">' +
        '<span>' + key + '</span>' +
        '<p>' + value + '</p>' +
      '</div>';

    const email = escape(workshop.registrationEmail);

    return '<span class="current-workshop-label">' +
      (language === 'hr'
        ? 'AKTUALNA RADIONICA'
        : 'CURRENT WORKSHOP') +
      '</span>' +
      '<h4>' +
        escape(loc(workshop.title, language)) +
      '</h4>' +
      '<img src="' + escape(safe(workshop.image)) +
        '" alt="' + escape(loc(workshop.title, language)) +
        '" class="current-workshop-poster" loading="lazy">' +
      '<div class="current-workshop-details">' +
        box(
          language === 'hr' ? 'DATUM' : 'DATE',
          escape(date(workshop, language))
        ) +
        box(
          language === 'hr' ? 'VRIJEME' : 'TIME',
          escape(workshop.time)
        ) +
        box(
          language === 'hr' ? 'ZA KOGA' : "WHO IT'S FOR",
          escape(loc(workshop.audience, language))
        ) +
        box(
          language === 'hr' ? 'MATERIJALI' : 'MATERIALS',
          escape(loc(workshop.materials, language))
        ) +
        box(
          language === 'hr' ? 'NA RADIONICI' : 'AT THE WORKSHOP',
          escape(loc(workshop.description, language))
        ) +
        box(
          language === 'hr' ? 'PRIJAVA' : 'REGISTRATION',
          '<a href="mailto:' + email + '">' + email + '</a>'
        ) +
      '</div>';
  }

  function apply(node) {
    if (!node.isConnected) return;

    const workshops = upcoming();
    const language = lang(node);

    if (node.dataset.mtDetail) {
      const workshop = workshops.find(
        item => item.id === node.dataset.mtDetail
      );

      node.innerHTML = workshop
        ? detail(workshop, language)
        : '';

      node.hidden = !workshop;
      return;
    }

    if (!node.dataset.mtWorkshops) return;

    node.innerHTML = workshops.length
      ? node.dataset.mtWorkshops === 'ticker'
        ? ticker(workshops, language, isAppTicker(node))
        : listing(workshops, language)
      : '';

    node.hidden = !workshops.length;

    if (
      workshops.length &&
      node.id === 'aktualne-radionice' &&
      location.hash === '#aktualne-radionice' &&
      !node.dataset.scrolled
    ) {
      node.dataset.scrolled = '1';

      requestAnimationFrame(() =>
        node.scrollIntoView({ block: 'start' })
      );
    }
  }

  function ensureAppTicker(root) {
    // Home screen only. No changes to the large app/index.html file.
    if (!root || root.id !== 'view') return;

    const intro = Array.from(root.children).find(
      child => child.classList.contains('intro')
    );

    if (!intro || root.querySelector('.mt-ws-app-ticker')) {
      return;
    }

    const tickerNode = document.createElement('div');
    tickerNode.className = 'mt-ws-mount mt-ws-app-ticker';
    tickerNode.dataset.mtWorkshops = 'ticker';
    tickerNode.hidden = true;

    root.insertBefore(tickerNode, intro);
  }


  function mountDecember(root) {
    const active = today() >= '2026-11-27' && today() <= '2026-12-31';
    root.querySelectorAll('[data-mt-workshops="ticker"]').forEach(anchor => {
      if (!anchor.isConnected) return;
      let banner = anchor.nextElementSibling;
      const exists = banner?.classList.contains('mt-dec-mount');
      if (!active) { if (exists) banner.remove(); return; }
      if (!exists) {
        banner = document.createElement('div');
        banner.className = 'mt-dec-mount' + (isAppTicker(anchor) ? ' mt-dec-app-ticker' : '');
        anchor.insertAdjacentElement('afterend', banner);
      }
      const language = lang(anchor);
      if (banner.dataset.lang === language) return;
      const hr = language === 'hr';
      const href = hr ? '/hr/december.html' : '/december.html';
      const words = hr ? '❄ PROSINAC NA MOVE&TRY-U ❄ DRUŽENJA · RADIONICE · NOVA ISKUSTVA ❄' : '❄ DECEMBER ON MOVE&TRY ❄ GATHERINGS · WORKSHOPS · NEW EXPERIENCES ❄';
      const copies = Array.from({length: 4}, (_, i) => '<a class="mt-dec-copy" href="' + href + '"' + (i ? ' tabindex="-1" aria-hidden="true"' : '') + '>' + words + '</a>').join('');
      banner.innerHTML = '<div class="mt-dec-bar"><div class="mt-dec-window"><div class="mt-dec-track"><div class="mt-dec-run">' + copies + '</div><div class="mt-dec-run" aria-hidden="true" inert>' + copies + '</div></div></div><a class="mt-dec-all" href="' + href + '" aria-label="' + (hr ? 'Pogledaj prosinački program' : 'View the December programme') + '">' + (hr ? 'VIŠE →' : 'MORE →') + '</a></div>';
      banner.dataset.lang = language;
    });
  }

  function mount(root = document) {
    ensureAppTicker(root);
    Promise.resolve().then(() => mountDecember(root));

    const nodes = root.querySelectorAll(
      '[data-mt-workshops],[data-mt-detail]'
    );

    if (!nodes.length) return;

    load()
      .then(() => nodes.forEach(apply))
      .catch(error => {
        console.warn('MOVE&TRY workshops', error);

        nodes.forEach(node => {
          if (node.isConnected) {
            node.hidden = true;
          }
        });
      });
  }

  window.MoveTryWorkshops = {
    load,
    mount,
    getUpcoming: upcoming
  };

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      () => mount(),
      { once: true }
    );
  } else {
    mount();
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      mount();
    }
  });
})();
