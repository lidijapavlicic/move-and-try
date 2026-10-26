(() => {
  'use strict';

  const path = window.location.pathname;

  // Ne prikazujemo navigaciju unutar Editora
  // niti na samoj naslovnici aplikacije.
  if (
    path.startsWith('/editor/') ||
    path.startsWith('/app/')
  ) {
    return;
  }

  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  const params = new URLSearchParams(window.location.search);

  const sessionKey = 'moveandtry_public_app_session';

  const cameFromApp =
    params.get('source') === 'moveandtry-app' ||
    document.referrer.includes('/app/');

  if (cameFromApp) {
    try {
      sessionStorage.setItem(sessionKey, '1');
    } catch (_) {}
  }

  let activeSession = cameFromApp;

  try {
    activeSession =
      activeSession ||
      sessionStorage.getItem(sessionKey) === '1';
  } catch (_) {}

  // Navigacija se prikazuje samo unutar instalirane aplikacije.
  if (!standalone || !activeSession) {
    return;
  }

  if (document.getElementById('moveandtry-app-nav')) {
    return;
  }

  const isHR = path.startsWith('/hr/');

  const labels = isHR
    ? ['Početna', 'Istraži', 'Journal', 'Spremljeno']
    : ['Home', 'Explore', 'Journal', 'Saved'];

  const links = [
    '/app/',
    '/app/?tab=explore',
    '/app/?tab=journal',
    '/app/?tab=saved'
  ];

  const icons = [
    '<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>',
    '<circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/>',
    '<path d="M4 4h12a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z"/><path d="M8 9h7M8 13h7"/>',
    '<path d="M6 3h12v18l-6-4-6 4z"/>'
  ];

  const nav = document.createElement('nav');

  nav.id = 'moveandtry-app-nav';
  nav.className = 'moveandtry-app-nav';
  nav.setAttribute(
    'aria-label',
    isHR ? 'Navigacija aplikacije' : 'App navigation'
  );

  const items = labels.map((label, index) => {
    const svg = `
      <svg
        viewBox="0 0 24 24"
        width="22"
        height="22"
        fill="none"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        ${icons[index]}
      </svg>
    `;

    const current =
      index === 2 && path.includes('journal')
        ? ' aria-current="page"'
        : index === 1 && !path.includes('journal')
          ? ' aria-current="page"'
          : '';

    return `
      <a href="${links[index]}"${current}>
        ${svg}
        <span>${label}</span>
      </a>
    `;
  }).join('');

  nav.innerHTML = items;

  document.body.appendChild(nav);
  document.body.classList.add('moveandtry-app-active');
})();
