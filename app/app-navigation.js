(() => {
  'use strict';

  const path = window.location.pathname;

  // The app shell has its own navigation.
  if (path.startsWith('/app/')) {
    return;
  }

  // Public pages get the app frame only when they are actually
  // displayed inside the installed MOVE&TRY PWA.
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    navigator.standalone === true;

  if (!standalone) return;
  if (document.getElementById('moveandtry-app-nav')) return;

  const isHR = path.startsWith('/hr/');

  const labels = isHR
    ? ['Početna', 'Istraži', 'Gdje probati', 'Journal', 'Spremljeno']
    : ['Home', 'Explore', 'Where to Try', 'Journal', 'Saved'];

  // Always return to the real app tabs. Public content pages are
  // detail views inside the app experience, not a second navigation system.
  const links = [
    '/app/',
    '/app/?tab=explore',
    '/app/?tab=where',
    '/app/?tab=journal',
    '/app/?tab=saved'
  ];

  const icons = [
    '<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>',
    '<circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/>',
    '<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="2.5"/>',
    '<path d="M4 4h12a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z"/><path d="M8 9h7M8 13h7"/>',
    '<path d="M6 3h12v18l-6-4-6 4z"/>'
  ];

  const isWherePage =
    path.endsWith('/where-to-try.html') ||
    path.endsWith('-where-to-try.html') ||
    path.endsWith('/be-part-of-where-to-try.html');

  const bodyClass = document.body?.className || '';
  const isJournalPage = /(^|\s)journal-/.test(bodyClass);

  // Detail/activity pages belong to Explore by default.
  // Where to Try and Journal content highlight their own app sections.
  const selected = isWherePage ? 2 : isJournalPage ? 3 : 1;

  const nav = document.createElement('nav');

  nav.id = 'moveandtry-app-nav';
  nav.className = 'moveandtry-app-nav';

  nav.setAttribute(
    'aria-label',
    isHR ? 'Navigacija aplikacije' : 'App navigation'
  );

  nav.innerHTML = labels.map((label, index) => {
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

    const ariaCurrent =
      index === selected ? ' aria-current="page"' : '';

    return `
      <a href="${links[index]}"${ariaCurrent}>
        ${svg}
        <span>${label}</span>
      </a>
    `;
  }).join('');

  document.body.appendChild(nav);
  document.body.classList.add('moveandtry-app-active');
})();
