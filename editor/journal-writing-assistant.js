/* MOVE&TRY Journal Writing Assistant. No direct third-party API calls or credentials. */
(() => {
  'use strict';
  if (window.MoveTryJournalWritingAssistant) return;
  const FUNCTION_NAME = 'journal-writing-assistant';
  const MAX_EDIT_CHARS = 12000;
  const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
  const AUDIO_EXTENSIONS = /\.(mp3|mp4|mpeg|mpga|m4a|wav|webm|ogg)$/i;
  const TEXT_EXTENSIONS = /\.(txt|md)$/i;

  function element(tag, options = {}) {
    const node = document.createElement(tag);
    if (options.className) node.className = options.className;
    if (options.text) node.textContent = options.text;
    return node;
  }
  function button(text, className, handler) {
    const node = element('button', { className, text });
    node.type = 'button';
    node.addEventListener('click', handler);
    return node;
  }
  function fileInput(accept) {
    const field = document.createElement('input');
    field.type = 'file';
    field.accept = accept;
    return field;
  }

  function attach({ toolbar, paper, prepareInsertion, getCurrentText, lang = 'hr' }) {
    const db = window.MoveTryJournalDraftBridge?.db;
    const panel = element('section', { className: 'mt-writing-assistant' });
    panel.hidden = true;
    panel.setAttribute('aria-label', 'Journal Writing Assistant');

    const trigger = button('✨ AI POMOĆNIK', 'mt-rich-assistant-button', () => {
      if (!panel.hidden) {
        close();
      } else {
        insertIntoArticle = prepareInsertion();
        panel.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        source.focus();
      }
    });
    trigger.setAttribute('aria-controls', 'journal-writing-assistant-' + lang);
    trigger.setAttribute('aria-expanded', 'false');
    panel.id = 'journal-writing-assistant-' + lang;
    toolbar.append(trigger);
    paper.before(panel);

    const heading = element('h3', { text: 'Journal Writing Assistant' });
    const introduction = element('p', {
      className: 'mt-wa-note',
      text: 'Pripremi tekst prije umetanja u članak. Izvornik se ne mijenja automatski.'
    });
    const sourceLabel = element('label', { text: 'Izvorni tekst / prijepis' });
    const source = element('textarea');
    source.rows = 7;
    source.lang = lang;
    source.placeholder = 'Zalijepi tekst, učitaj .txt ili .md ili pretvori audiozapis u tekst.';
    sourceLabel.htmlFor = panel.id + '-source';
    source.id = sourceLabel.htmlFor;
    const sourceCount = element('p', { className: 'mt-wa-note' });
    const loadCurrent = button('Preuzmi tekst članka', 'btn secondary small-btn', () => {
      const current = (getCurrentText?.() || '').trim();
      if (!current) return message('U članku još nema teksta.', true);
      if (current.length > MAX_EDIT_CHARS) return message('Članak je predugačak za jednu AI obradu. Kopiraj jedan dio do 12.000 znakova.', true);
      source.value = current;
      clearResult();
      updateCount();
      message('Tekst je kopiran u pomoćnik. Članak ostaje neizmijenjen.');
    });

    const imports = element('div', { className: 'mt-wa-imports' });
    const textGroup = element('label', { className: 'mt-wa-file' });
    textGroup.append(element('span', { text: 'Učitaj tekst (.txt, .md)' }));
    const textFile = fileInput('.txt,.md,text/plain,text/markdown');
    textGroup.append(textFile);
    textFile.addEventListener('change', async () => {
      const file = textFile.files?.[0];
      if (!file) return;
      if (!TEXT_EXTENSIONS.test(file.name) || file.size > 1024 * 1024) {
        message('Odaberi .txt ili .md do 1 MB.', true);
        textFile.value = '';
        return;
      }
      try {
        const content = await file.text();
        source.value = content;
        clearResult();
        updateCount();
        message('Tekst je učitan lokalno. Nije poslan AI servisu.');
      } catch (_) {
        message('Datoteka se ne može pročitati.', true);
      }
      textFile.value = '';
    });
    const audioGroup = element('label', { className: 'mt-wa-file' });
    audioGroup.append(element('span', { text: 'Učitaj snimku (.mp3, .m4a, .wav…)' }));
    const audioFile = fileInput('.mp3,.m4a,.mp4,.mpeg,.mpga,.wav,.webm,.ogg,audio/*');
    audioGroup.append(audioFile);
    imports.append(textGroup, audioGroup);
    const transcribe = button('Pretvori snimku u tekst', 'btn secondary small-btn', () => processAudio());
    const consent = element('p', {
      className: 'mt-wa-note',
      text: 'Klikom na pretvaranje snimka se šalje vanjskom servisu za prepoznavanje govora. Šalji samo snimke za koje imaš odgovarajuće dopuštenje.'
    });

    const modeRow = element('div', { className: 'mt-wa-mode-row' });
    const modeLabel = element('label', { text: 'Način uređivanja' });
    const mode = element('select');
    for (const [value, label] of [
      ['proofread', 'Ispravi pravopis i interpunkciju'],
      ['style', 'Uredi rečenice i stil'],
      ['article', 'Predloži strukturu članka']
    ]) {
      const option = element('option', { text: label });
      option.value = value;
      mode.append(option);
    }
    modeLabel.append(mode);
    const edit = button('✨ Predloži uređeni tekst', 'btn green small-btn', () => processText());
    modeRow.append(modeLabel, edit);
    const editDisclosure = element('p', { className: 'mt-wa-note', text: 'Tekst se šalje vanjskom AI servisu tek kad klikneš gumb za uređivanje. Usporedi prijedlog s izvornikom prije prihvaćanja.' });

    const resultLabel = element('label', { text: 'Prijedlog (možeš dodatno urediti)' });
    const result = element('textarea');
    result.rows = 8;
    result.lang = lang;
    resultLabel.htmlFor = panel.id + '-result';
    result.id = resultLabel.htmlFor;
    result.placeholder = 'Uređeni tekst pojavit će se ovdje.';
    const status = element('p', { className: 'message' });
    status.setAttribute('role', 'status');
    const actions = element('div', { className: 'actions mt-wa-actions' });
    const insert = button('Umetni prijedlog u članak', 'btn green small-btn', () => {
      if (!insertIntoArticle || !result.value.trim() || busy) return;
      try {
        insertIntoArticle(result.value.trim());
        message('Tekst je umetnut. Pregledaj članak i spremi skicu.');
        close();
      } catch (error) {
        console.warn('Journal Writing Assistant insert failed', error);
        message('Umetanje nije uspjelo. Prijedlog možeš kopirati iz polja.', true);
      }
    });
    const closeButton = button('Zatvori', 'btn secondary small-btn', () => {
      close();
      trigger.focus();
    });
    actions.append(insert, closeButton);
    panel.append(
      heading, introduction, sourceLabel, source, sourceCount,
      loadCurrent, imports, transcribe, consent,
      modeRow, editDisclosure, resultLabel, result, status, actions
    );

    let busy = false;
    let insertIntoArticle = null;
    let requestId = 0;
    source.addEventListener('input', () => {
      clearResult();
      updateCount();
    });
    result.addEventListener('input', updateControls);
    audioFile.addEventListener('change', () => {
      clearResult();
      const f = audioFile.files?.[0];
      if (f) message('Odabrano: ' + f.name + '. Snimka se ne šalje dok ne klikneš Pretvori.');
    });
    updateCount();

    function clearResult() {
      result.value = '';
      updateControls();
    }
    function updateCount() {
      sourceCount.textContent = source.value.length.toLocaleString('hr-HR') + ' / ' +
        MAX_EDIT_CHARS.toLocaleString('hr-HR') + ' znakova za jedan AI zahtjev';
      updateControls();
    }
    function updateControls() {
      const validText = source.value.trim().length > 0 && source.value.length <= MAX_EDIT_CHARS;
      transcribe.disabled = busy || !audioFile.files?.length;
      edit.disabled = busy || !validText;
      insert.disabled = busy || !result.value.trim();
      source.readOnly = busy;
      result.readOnly = busy;
      textFile.disabled = busy;
      audioFile.disabled = busy;
      loadCurrent.disabled = busy;
      closeButton.disabled = busy;
      mode.disabled = busy;
    }
    function message(text, isError = false) {
      status.textContent = text;
      status.classList.toggle('error', isError);
    }
    function close() {
      requestId += 1;
      insertIntoArticle = null;
      panel.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      source.value = '';
      result.value = '';
      audioFile.value = '';
      status.textContent = '';
      updateCount();
    }
    async function invoke(body) {
      if (!db) throw new Error('Editor nije povezan sa sesijom.');
      const { data: sessionData, error: authError } = await db.auth.getSession();
      if (authError || !sessionData.session?.access_token) {
        throw new Error('Prijava je istekla. Prijavi se ponovno.');
      }
      const { data, error } = await db.functions.invoke(FUNCTION_NAME, {
        body,
        headers: { Authorization: 'Bearer ' + sessionData.session.access_token }
      });
      if (error) {
        let detail = '';
        try { detail = (await error.context?.json())?.error || ''; } catch (_) { /* no JSON */ }
        throw new Error(detail || 'AI obrada nije dostupna. Funkcija možda još nije aktivirana.');
      }
      if (!data?.success || typeof data?.text !== 'string') {
        throw new Error(data?.error || 'AI obrada nije vratila tekst.');
      }
      return data.text;
    }
    async function processAudio() {
      const file = audioFile.files?.[0];
      if (!file || busy) return;
      if (!AUDIO_EXTENSIONS.test(file.name) || !file.size || file.size > MAX_AUDIO_BYTES) {
        return message('Odaberi podržanu snimku do 20 MB.', true);
      }
      const body = new FormData();
      body.append('action', 'transcribe');
      body.append('language', lang);
      body.append('audio', file, file.name);
      await run(async () => {
        const text = await invoke(body);
        source.value = text;
        clearResult();
        updateCount();
        message('Prijepis je spreman. Možeš ga urediti ili umetnuti u članak.');
      }, 'Pretvaram snimku…');
    }
    async function processText() {
      const text = source.value.trim();
      if (!text || text.length > MAX_EDIT_CHARS || busy) return;
      await run(async () => {
        result.value = await invoke({ action: 'edit', text, mode: mode.value, language: lang });
        updateControls();
        message('Prijedlog je spreman. Usporedi ga s izvornikom prije umetanja.');
      }, 'Pripremam prijedlog…');
    }
    async function run(action, workingMessage) {
      busy = true;
      const activeId = ++requestId;
      message(workingMessage);
      updateControls();
      try {
        await action();
      } catch (error) {
        if (requestId === activeId) message(error?.message || 'Obrada nije uspjela.', true);
      } finally {
        if (requestId === activeId) {
          busy = false;
          updateControls();
        }
      }
    }
    return { reset: close };
  }
  window.MoveTryJournalWritingAssistant = { attach };
})();
