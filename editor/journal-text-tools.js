/* MOVE&TRY Journal: local, free-of-charge text tools.
   This module never uploads files, sends API requests, or saves by itself. */
(() => {
  'use strict';
  if (window.MoveTryJournalTextTools) return;
  const MAX_FILE_BYTES = 1024 * 1024;
  const MAX_PREVIEW_CHARS = 1000000;

  const create = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (text, handler, cls = 'btn secondary small-btn') => {
    const node = create('button', cls, text);
    node.type = 'button';
    node.addEventListener('click', handler);
    return node;
  };
  const normalize = value => String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map(line => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  function metrics(text) {
    const words = String(text || '').match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu) || [];
    const letters = String(text || '').length;
    return { words: words.length, letters, minutes: words.length ? Math.max(1, Math.ceil(words.length / 200)) : 0 };
  }

  function attach({ toolbar, paper, getArticleText, putArticleText, lang = 'hr' }) {
    const isEnglish = lang === 'en';
    const panel = create('section', 'mt-text-tools');
    panel.id = 'mt-text-tools-' + lang;
    panel.hidden = true;
    panel.setAttribute('aria-label', isEnglish ? 'Text tools' : 'Alati za tekst');

    const trigger = button(isEnglish ? '✍ TEXT TOOLS' : '✍ ALATI ZA TEKST', () => {
      panel.hidden = !panel.hidden;
      trigger.setAttribute('aria-expanded', String(!panel.hidden));
      if (!panel.hidden) source.focus();
    }, 'mt-text-tools-trigger');
    trigger.setAttribute('aria-controls', panel.id);
    trigger.setAttribute('aria-expanded', 'false');
    toolbar.append(trigger);
    paper.before(panel);

    const heading = create('h3', '', isEnglish ? 'Free text tools' : 'Besplatni alati za tekst');
    const note = create('p', 'mt-text-tools-note', isEnglish
      ? 'Files are read on your device. Review your text before sending it to the article.'
      : 'Datoteke se čitaju na tvojem uređaju. Pregledaj tekst prije umetanja u članak.');
    const sourceLabel = create('label', '', isEnglish ? 'Original text' : 'Izvorni tekst');
    const source = create('textarea');
    source.id = panel.id + '-source';
    source.lang = lang;
    source.rows = 7;
    source.placeholder = isEnglish ? 'Paste text or import .txt/.md' : 'Zalijepi tekst ili učitaj .txt/.md';
    sourceLabel.htmlFor = source.id;

    const controls = create('div', 'mt-text-tools-controls');
    const fileLabel = create('label', 'mt-text-tools-file');
    fileLabel.append(create('span', '', isEnglish ? 'Import TXT / Markdown' : 'Učitaj TXT / Markdown'));
    const fileInput = create('input');
    fileInput.type = 'file';
    fileInput.accept = '.txt,.md,text/plain,text/markdown';
    fileLabel.append(fileInput);
    const fromArticle = button(isEnglish ? 'Copy from article' : 'Preuzmi iz članka', () => {
      const current = getArticleText();
      if (!current.trim()) return setStatus(isEnglish ? 'The article is empty.' : 'Članak je još prazan.', true);
      if (current.length > MAX_PREVIEW_CHARS) return setStatus(isEnglish ? 'The article is too long to copy.' : 'Tekst je predugačak za pregled.', true);
      if (source.value.trim() && !confirm(isEnglish ? 'Replace text in the tools panel?' : 'Zamijeniti tekst u panelu alata?')) return;
      source.value = current;
      preview.value = '';
      update();
      setStatus(isEnglish ? 'Copied to the panel. The article has not changed.' : 'Tekst je kopiran u panel. Članak nije promijenjen.');
    });
    controls.append(fileLabel, fromArticle);

    const stats = create('p', 'mt-text-tools-note');
    const clean = button(isEnglish ? 'Clean spaces and empty lines' : 'Uredi razmake i prazne retke', () => {
      if (!source.value.trim()) return setStatus(isEnglish ? 'Enter text first.' : 'Najprije unesi tekst.', true);
      preview.value = normalize(source.value);
      update();
      setStatus(isEnglish
        ? 'Cleaned line endings, trailing spaces and repeated empty lines. No grammar was rewritten.'
        : 'Uređeni su prijelomi, završni razmaci i suvišni prazni redci. Rečenice nisu prepisivane.');
    });
    const copyUnchanged = button(isEnglish ? 'Preview unchanged text' : 'Pregledaj bez izmjena', () => {
      preview.value = source.value;
      update();
      setStatus(isEnglish ? 'Original text is ready for review.' : 'Izvorni tekst spreman je za pregled.');
    });
    const resultLabel = create('label', '', isEnglish ? 'Preview (editable)' : 'Pregled (možeš uređivati)');
    const preview = create('textarea');
    preview.id = panel.id + '-preview';
    preview.rows = 7;
    preview.lang = lang;
    preview.placeholder = isEnglish ? 'Review the text here before inserting.' : 'Ovdje pregledaj tekst prije umetanja.';
    resultLabel.htmlFor = preview.id;
    const finalStats = create('p', 'mt-text-tools-note');
    const status = create('p', 'message');
    status.setAttribute('role', 'status');
    const actions = create('div', 'mt-text-tools-actions');

    const append = button(isEnglish ? 'Append to article' : 'Dodaj na kraj članka', () => put('append'), 'btn green small-btn');
    const replace = button(isEnglish ? 'Replace article text' : 'Zamijeni tekst članka', () => put('replace'), 'btn secondary small-btn');
    const close = button(isEnglish ? 'Close' : 'Zatvori', () => {
      panel.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      trigger.focus();
    });
    actions.append(append, replace, close);
    panel.append(heading, note, sourceLabel, source, controls, stats, clean, copyUnchanged,
      resultLabel, preview, finalStats, status, actions);

    function setStatus(message, bad = false) {
      status.textContent = message;
      status.classList.toggle('error', bad);
    }
    function formatMetrics(value) {
      const m = metrics(value);
      const n = value => value.toLocaleString(lang === 'en' ? 'en-US' : 'hr-HR');
      return isEnglish
        ? n(m.words) + ' words · ' + n(m.letters) + ' characters · approx. ' + n(m.minutes) + ' min read'
        : n(m.words) + ' riječi · ' + n(m.letters) + ' znakova · oko ' + n(m.minutes) + ' min čitanja';
    }
    function update() {
      stats.textContent = (isEnglish ? 'Original: ' : 'Izvornik: ') + formatMetrics(source.value);
      finalStats.textContent = (isEnglish ? 'Preview: ' : 'Pregled: ') + formatMetrics(preview.value);
      append.disabled = replace.disabled = !preview.value.trim();
    }
    function put(mode) {
      const value = preview.value.trim();
      if (!value) return;
      const existing = getArticleText();
      if (mode === 'replace' && existing.trim()) {
        if (!confirm(isEnglish
          ? 'Replace the current article body? This is not saved until you save the draft.'
          : 'Zamijeniti postojeći tekst članka? Promjena se sprema tek kad spremiš skicu.')) return;
      }
      try {
        putArticleText(value, mode);
        setStatus(isEnglish ? 'Inserted. Review your article and save the draft.' : 'Tekst je umetnut. Pregledaj članak i spremi skicu.');
        panel.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
      } catch (error) {
        console.warn('MOVE&TRY local text tool:', error);
        setStatus(isEnglish ? 'Could not insert text. You can copy it manually.' : 'Umetanje nije uspjelo. Tekst možeš ručno kopirati.', true);
      }
    }

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      fileInput.value = '';
      if (!/\.(txt|md)$/i.test(file.name) || !file.size || file.size > MAX_FILE_BYTES) {
        return setStatus(isEnglish ? 'Choose a .txt or .md file under 1 MB.' : 'Odaberi .txt ili .md datoteku do 1 MB.', true);
      }
      if (source.value.trim() && !confirm(isEnglish ? 'Replace text in the tools panel?' : 'Zamijeniti tekst u panelu alata?')) return;
      try {
        const content = await file.text();
        if (content.length > MAX_PREVIEW_CHARS) throw new Error('too-long');
        source.value = content;
        preview.value = content;
        update();
        setStatus(isEnglish ? 'File loaded locally; no upload to a service.' : 'Datoteka je učitana lokalno, bez slanja servisu.');
      } catch (_) {
        setStatus(isEnglish ? 'File could not be read.' : 'Datoteku nije moguće pročitati.', true);
      }
    });
    source.addEventListener('input', () => { preview.value = ''; update(); });
    preview.addEventListener('input', update);
    update();
    return {
      reset() {
        panel.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
        fileInput.value = '';
        source.value = '';
        preview.value = '';
        setStatus('');
        update();
      }
    };
  }
  window.MoveTryJournalTextTools = { attach };
})();