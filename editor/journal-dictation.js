/* Croatian dictation into the existing Journal writing surface. */
(() => {
  'use strict';

  const messages = {
    'no-speech': 'Govor nije prepoznat. Pokušaj ponovno.',
    'audio-capture': 'Mikrofon nije dostupan. Provjeri dozvolu i pokušaj ponovno.',
    'not-allowed': 'Pristup mikrofonu nije dopušten. Provjeri dozvolu za ovu stranicu.',
    'service-not-allowed': 'Preglednik je blokirao prepoznavanje govora. Možeš pokušati mikrofonom na tipkovnici.',
    'language-not-supported': 'Prepoznavanje hrvatskog nije dostupno u ovom pregledniku. Možeš pokušati mikrofonom na tipkovnici.',
    network: 'Servis za prepoznavanje govora nije dostupan. Provjeri internetsku vezu.'
  };

  function makeButton(text, className, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = text;
    button.addEventListener('click', onClick);
    return button;
  }

  function attach({ toolbar, paper, saveSelection, prepareInsertion }) {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition = null;
    let insertText = null;

    const panel = document.createElement('section');
    panel.id = 'journal-hr-dictation';
    panel.className = 'mt-dictation';
    panel.hidden = true;
    panel.setAttribute('aria-label', 'Diktiranje na hrvatskom');
    const note = document.createElement('p');
    note.className = 'muted small';
    note.textContent = Recognition
      ? 'Diktiraj jedan odlomak. Preglednik može poslati zvuk svojem servisu za prepoznavanje govora.'
      : 'Diktiranje nije dostupno u ovom pregledniku. Ako imaš mikrofon na tipkovnici, možeš ga koristiti u tekstu članka.';
    const label = document.createElement('label');
    label.htmlFor = 'journal-dictation-text';
    label.textContent = 'Prijepis';
    const transcript = document.createElement('textarea');
    transcript.id = label.htmlFor;
    transcript.lang = 'hr';
    transcript.rows = 3;
    const status = document.createElement('p');
    status.className = 'message';
    status.setAttribute('role', 'status');
    const actions = document.createElement('div');
    actions.className = 'actions';

    const trigger = makeButton('🎙 Diktiraj', '', () => {
      if (!panel.hidden) {
        reset();
        return;
      }
      insertText = prepareInsertion();
      panel.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      (Recognition ? start : cancel).focus();
    });
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', panel.id);
    trigger.addEventListener('pointerdown', saveSelection);

    const start = makeButton('Pokreni mikrofon', 'btn secondary small-btn', startRecording);
    const stop = makeButton('Zaustavi', 'btn secondary small-btn', () => {
      if (!recognition) return;
      stop.disabled = true;
      status.textContent = 'Dovršavam prijepis…';
      try {
        recognition.stop();
      } catch (_) {
        // A pause can end recognition just before the stop button is pressed.
      }
    });
    const insert = makeButton('Umetni tekst', 'btn green small-btn', () => {
      const text = transcript.value.trim();
      if (recognition || !text || !insertText) return;
      try {
        insertText(text);
        reset();
      } catch (error) {
        console.warn('Journal dictation:', error);
        status.textContent = 'Umetanje nije uspjelo. Prijepis možeš kopirati iz ovog polja.';
      }
    });
    const cancel = makeButton('Zatvori', 'btn secondary small-btn', () => {
      reset();
      trigger.focus();
    });
    transcript.addEventListener('input', updateControls);
    actions.append(start, stop, insert, cancel);
    panel.append(note, label, transcript, status, actions);
    toolbar.append(trigger);
    paper.before(panel);
    label.hidden = transcript.hidden = start.hidden = stop.hidden = insert.hidden = !Recognition;
    updateControls();
    window.addEventListener('pagehide', reset);

    function updateControls() {
      start.disabled = !!recognition;
      stop.disabled = !recognition;
      transcript.readOnly = !!recognition;
      insert.disabled = !!recognition || !transcript.value.trim();
    }

    function reset() {
      const active = recognition;
      recognition = null;
      if (active) active.abort();
      insertText = null;
      panel.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      transcript.value = '';
      status.textContent = '';
      updateControls();
    }

    function startRecording() {
      if (!Recognition || recognition) return;
      const existing = transcript.value.trimEnd();
      let spoken = '';
      let session;
      const finish = message => {
        if (recognition !== session) return;
        recognition = null;
        transcript.value = [existing, spoken].filter(Boolean).join(' ');
        status.textContent = message || (spoken
          ? 'Prijepis je spreman za uređivanje.'
          : messages['no-speech']);
        updateControls();
      };

      try {
        session = new Recognition();
        recognition = session;
        session.lang = 'hr-HR';
        session.continuous = false;
        session.addEventListener('start', () => {
          if (recognition === session) status.textContent = 'Slušam…';
        });
        session.addEventListener('result', event => {
          if (recognition !== session) return;
          spoken = Array.from(event.results)
            .filter(result => result.isFinal)
            .map(result => result[0].transcript.trim())
            .filter(Boolean)
            .join(' ');
          transcript.value = [existing, spoken].filter(Boolean).join(' ');
        });
        session.addEventListener('error', event => {
          finish(messages[event.error] || 'Diktiranje nije uspjelo. Pokušaj ponovno.');
        });
        session.addEventListener('end', () => finish());
        status.textContent = 'Pokrećem mikrofon…';
        updateControls();
        session.start();
      } catch (_) {
        recognition = null;
        status.textContent = 'Mikrofon se nije pokrenuo. Provjeri dozvolu i pokušaj ponovno.';
        updateControls();
      }
    }

    return { reset };
  }

  window.MoveTryJournalDictation = { attach };
})();
