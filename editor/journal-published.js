(() => {
  'use strict';

  const publicOrigin = 'https://moveandtry.com';
  const $ = id => document.getElementById(id);
  const panel = $('published-reader');
  const list = $('published-articles');
  const frameHost = $('published-frame');
  const download = $('published-pdf');
  const languages = { hr: $('published-hr'), en: $('published-en') };
  const status = $('published-message');
  const web = $('published-web');
  const closeButton = $('published-close');
  if (![panel, list, frameHost, download, languages.hr, languages.en, status, web, closeButton].every(Boolean)) return;
  const pdfModuleUrl = new URL('./journal-published-pdf.js', document.currentScript.src);
  let selection;
  let frame;
  let downloadRequest = 0;
  let waitingForSource = false;
  let timer;
  let trigger;

  function setStatus(message = '', error = false) {
    status.textContent = message;
    status.classList.toggle('error', error);
  }

  function close(restoreFocus = false) {
    clearTimeout(timer);
    frameHost.replaceChildren();
    frame = null;
    selection = null;
    download.disabled = true;
    downloadRequest++;
    waitingForSource = false;
    setStatus();
    panel.hidden = true;
    if (restoreFocus) trigger?.focus();
    trigger = null;
  }

  function showArticle(article, lang) {
    clearTimeout(timer);
    selection = { article, lang };
    downloadRequest++;
    waitingForSource = false;
    panel.hidden = false;
    download.disabled = true;
    setStatus('Učitavanje objavljenog članka…');

    const path = lang === 'hr' ? '/hr/journal/article.html' : '/journal/article.html';
    const url = new URL(path, publicOrigin);
    url.searchParams.set('id', article.id);
    web.href = url.href;
    url.searchParams.set('view', 'editor');

    languages.hr.setAttribute('aria-pressed', String(lang === 'hr'));
    languages.en.setAttribute('aria-pressed', String(lang === 'en'));
    languages.en.hidden = !article.title_en || !article.content_en;

    frame = document.createElement('iframe');
    frame.title = lang === 'hr' ? article.title : article.title_en;
    frame.src = url.href;
    frame.referrerPolicy = 'origin';
    frameHost.replaceChildren(frame);
    timer = setTimeout(() => {
      setStatus('Prikaz se još učitava. Članak možeš otvoriti i na webu.', true);
    }, 10000);
  }

  function render(articles) {
    if (selection && !articles.some(article => article.id === selection.article.id)) close();
    const rows = [...articles].sort((a, b) =>
      Date.parse(b.published_at || b.scheduled_at || b.updated_at) -
      Date.parse(a.published_at || a.scheduled_at || a.updated_at)
    );
    list.replaceChildren();
    if (!rows.length) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = 'Još nema objavljenih članaka.';
      list.append(empty);
      return;
    }

    for (const article of rows) {
      const row = document.createElement('article');
      row.className = 'article-row';
      const info = document.createElement('div');
      info.className = 'article-info';
      const title = document.createElement('p');
      title.className = 'article-title';
      title.textContent = article.title || 'Bez naslova';
      const date = document.createElement('p');
      date.className = 'article-meta';
      date.textContent = window.MoveTryJournalByline.formatPublicationDate(
        article.published_at || article.scheduled_at, 'hr'
      );
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn secondary small-btn';
      button.textContent = 'ČITAJ ČLANAK';
      button.setAttribute('aria-label', 'Čitaj „' + title.textContent + '”');
      button.addEventListener('click', () => {
        trigger = button;
        showArticle(article, 'hr');
        panel.scrollIntoView({ behavior: 'smooth' });
        languages.hr.focus({ preventScroll: true });
      });
      if (selection?.article.id === article.id) trigger = button;
      info.append(title, date);
      row.append(info, button);
      list.append(row);
    }
  }

  for (const [lang, button] of Object.entries(languages)) {
    button.addEventListener('click', () => {
      if (selection && selection.lang !== lang) showArticle(selection.article, lang);
    });
  }

  closeButton.addEventListener('click', () => close(true));
  download.addEventListener('click', () => {
    if (download.disabled || !selection || !frame?.contentWindow) return;
    const { article, lang } = selection;
    const requestId = ++downloadRequest;
    download.disabled = true;
    waitingForSource = true;
    setStatus('Priprema PDF-a…');
    frame.contentWindow.postMessage(
      { type: 'moveandtry-journal-pdf', id: article.id, lang, requestId },
      publicOrigin
    );
    timer = setTimeout(() => {
      downloadRequest++;
      waitingForSource = false;
      download.disabled = false;
      setStatus('Prikaz nije odgovorio. Pokušaj ponovo.', true);
    }, 10000);
  });

  window.addEventListener('message', async event => {
    const data = event.data;
    if (event.origin !== publicOrigin || !frame || event.source !== frame.contentWindow ||
        !selection || data?.id !== selection.article.id || data.lang !== selection.lang) return;

    if (data.type === 'moveandtry-journal-article') {
      clearTimeout(timer);
      download.disabled = data.status !== 'ready';
      setStatus(
        data.status === 'error' ? 'Objavljeni članak trenutačno se ne može učitati.' :
          download.disabled ? 'Objavljena verzija nije dostupna za ovaj jezik.' : '',
        download.disabled
      );
      return;
    }
    if (!waitingForSource || data.type !== 'moveandtry-journal-pdf-source' || data.requestId !== downloadRequest ||
        typeof data.html !== 'string') return;
    clearTimeout(timer);
    waitingForSource = false;
    const requestId = downloadRequest;
    try {
      const { makePublishedPdf, downloadPdf } = await import(pdfModuleUrl.href);
      const result = await makePublishedPdf(data.html, data.lang, web.href, data.images);
      if (requestId !== downloadRequest) return;
      downloadPdf(result);
      setStatus(result.skippedPhotos ? 'PDF je preuzet. Neke fotografije nisu bile dostupne.' : '');
    } catch (error) {
      if (requestId !== downloadRequest) return;
      console.warn('Journal PDF:', error);
      setStatus('PDF nije izrađen. Provjeri vezu i pokušaj ponovo.', true);
    } finally {
      if (requestId === downloadRequest) download.disabled = false;
    }
  });

  window.MoveTryJournalPublished = { render, close };
})();

