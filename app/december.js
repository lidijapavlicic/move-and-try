/* Seasonal programme rendered inside the MOVE&TRY app shell.
   The public HR/EN pages remain the single source of content. */
(() => {
  'use strict';
  let requestId = 0;
  const labels = {
    hr: { back: '← NATRAG NA POČETNU', loading: 'Učitavanje prosinačkog programa…', error: 'Program trenutno nije dostupan.', retry: 'POKUŠAJ PONOVNO' },
    en: { back: '← BACK TO HOME', loading: 'Loading the December programme…', error: 'The programme is currently unavailable.', retry: 'TRY AGAIN' }
  };
  function render(language) {
    const t = labels[language === 'en' ? 'en' : 'hr'];
    return '<section class="app-december" aria-label="MOVE&TRY · December"><div class="app-december-back"><a href="#home" data-open-tab="home">' + t.back + '</a></div><div class="app-december-content" aria-live="polite"><p class="app-december-message">' + t.loading + '</p></div></section>';
  }
  function applyStyle(css) {
    let style = document.getElementById('app-december-styles');
    if (!style) {
      style = document.createElement('style');
      style.id = 'app-december-styles';
      document.head.append(style);
    }
    style.textContent = css + '\n' +
      '.app-december{min-width:0;overflow:hidden}' +
      '.app-december-back{padding:14px 20px;background:#f7f6f2;border-top:1px solid #d5d5d0;font-size:10px;font-weight:800;letter-spacing:.08em}' +
      '.app-december-message{padding:24px 20px;font-size:14px}' +
      '.app-december-retry{margin:0 20px 24px;padding:12px 16px;border:0;border-radius:20px;background:#812c40;color:#fff4dc;font-weight:800;font-size:11px}' +
      '.app-december .dec-hero{padding:32px 20px 26px}' +
      '.app-december .dec-hero h1{font-size:clamp(39px,10.5vw,62px)}' +
      '.app-december .dec-heroimage{height:auto;aspect-ratio:3/2}' +
      '.app-december .dec-intro{padding:34px 20px 20px}' +
      '.app-december .dec-intro h2{font-size:clamp(35px,8vw,52px)}' +
      '.app-december .dec-layout{padding:22px 14px 35px;grid-template-columns:minmax(0,1fr);gap:20px}' +
      '.app-december .dec-timeline,.app-december .dec-side{height: min(620px, 76dvh)}' +
      '.app-december .dec-path-content{padding-left:54px;padding-right:12px}' +
      '.app-december .dec-date:before{left:-29px}' +
      '.app-december .dec-sidecopy{padding:22px}' +
      '.app-december .dec-closing{padding:35px 20px}' +
      '.app-december .dec-event{overflow-wrap:anywhere}';
  }
  async function mount(view, language) {
    const host = view.querySelector('.app-december-content');
    if (!host) return;
    const id = ++requestId;
    const lang = language === 'en' ? 'en' : 'hr';
    const t = labels[lang];
    try {
      const response = await fetch(lang === 'hr' ? '/hr/december.html' : '/december.html', {cache:'no-cache'});
      if (!response.ok) throw Error('December HTTP ' + response.status);
      const parsed = new DOMParser().parseFromString(await response.text(), 'text/html');
      const main = parsed.querySelector('main.december-page');
      const css = parsed.querySelector('head style')?.textContent;
      if (!main || !css) throw Error('Missing December content');
      if (id !== requestId || !host.isConnected) return;
      applyStyle(css);
      const section = document.createElement('section');
      section.className = main.className;
      // Only import the public content, never its header, menu, footer or scripts.
      main.querySelectorAll('script').forEach(node => node.remove());
      for (const child of main.childNodes) section.append(document.importNode(child, true));
      host.replaceChildren(section);
      host.removeAttribute('aria-live');
      const sc = section.querySelector('.dec-path-scroll');
      if (sc) requestAnimationFrame(() => {
        const first = sc.querySelector('.dec-station');
        if (sc.isConnected && first) sc.scrollTop = Math.max(0, first.offsetTop - 24);
      });
    } catch (error) {
      if (id !== requestId || !host.isConnected) return;
      console.warn('MOVE&TRY December', error);
      const p = document.createElement('p'); p.className = 'app-december-message'; p.textContent = t.error;
      const button = document.createElement('button'); button.type = 'button'; button.className = 'app-december-retry'; button.textContent = t.retry;
      button.addEventListener('click', () => mount(view, lang), {once:true});
      host.replaceChildren(p, button);
    }
  }
  window.MoveTryDecember = {render, mount};
})();
