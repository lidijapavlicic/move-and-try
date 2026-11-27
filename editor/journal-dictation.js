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
    let keepListening = false;
    let restartTimer = null;
    let accumulatedText = '';
    let silentRestarts = 0;

    function joinText(...parts) {
      return parts.map(part => String(part || '').trim()).filter(Boolean).join(' ');
    }

    const panel = document.createElement('section');
    panel.id = 'journal-hr-dictation';
    panel.className = 'mt-dictation';
    panel.hidden = true;
    panel.setAttribute('aria-label', 'Diktiranje na hrvatskom');
    const note = document.createElement('p');
    note.className = 'muted small';
    note.textContent = Recognition
      ? 'Govori svojim tempom i napravi pauzu kad želiš. Diktiranje završava tek kad pritisneš Zaustavi. Preglednik može poslati zvuk svojem servisu za prepoznavanje govora.'
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
    const stop = makeButton('Zaustavi', 'btn secondary small-btn', stopRecording);
    const insert = makeButton('Umetni tekst', 'btn green small-btn', () => {
      const text = transcript.value.trim();
      if (keepListening || recognition || restartTimer || !text || !insertText) return;
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
    // Browsers may stop the microphone in the background. Do not retry secretly.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && keepListening) stopRecording();
    });

    function updateControls() {
      const busy = keepListening || !!recognition || !!restartTimer;
      start.disabled = busy;
      stop.disabled = !keepListening;
      transcript.readOnly = busy;
      insert.disabled = busy || !transcript.value.trim();
    }

    function clearRestart() {
      if (restartTimer !== null) {
        clearTimeout(restartTimer);
        restartTimer = null;
      }
    }

    function reset() {
      keepListening = false;
      clearRestart();
      const active = recognition;
      recognition = null;
      if (active) {
        try { active.abort(); } catch (_) { /* Already ended. */ }
      }
      insertText = null;
      panel.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      transcript.value = '';
      accumulatedText = '';
      status.textContent = '';
      updateControls();
    }

    function stopRecording() {
      if (!keepListening) return;
      keepListening = false;
      clearRestart();
      status.textContent = 'Dovršavam prijepis…';
      const active = recognition;
      if (active) {
        try {
          active.stop(); // Allows the browser to deliver the final words.
        } catch (_) {
          // A silence may have ended this segment just before the click.
          try { active.abort(); } catch (_) { /* Already ended. */ }
          recognition = null;
          status.textContent = 'Prijepis je spreman za uređivanje.';
        }
      } else {
        status.textContent = 'Prijepis je spreman za uređivanje.';
      }
      updateControls();
    }

    function startRecording() {
      if (!Recognition || keepListening || recognition) return;
      accumulatedText = transcript.value.trim();
      silentRestarts = 0;
      keepListening = true;
      beginSegment();
    }

    function beginSegment() {
      if (!keepListening) return;
      let session;
      let finalText = '';
      let interimText = '';
      let errorMessage = '';
      try {
        session = new Recognition();
        recognition = session;
        session.lang = 'hr-HR';
        session.continuous = true;
        session.interimResults = true;
        session.addEventListener('start', () => {
          if (recognition === session) {
            status.textContent = 'Slušam… Možeš napraviti pauzu.';
          }
        });
        session.addEventListener('result', event => {
          if (recognition !== session) return;
          const results = Array.from(event.results);
          finalText = results
            .filter(result => result.isFinal)
            .map(result => result[0].transcript.trim())
            .filter(Boolean)
            .join(' ');
          interimText = results
            .filter(result => !result.isFinal)
            .map(result => result[0].transcript.trim())
            .filter(Boolean)
            .join(' ');
          transcript.value = joinText(accumulatedText, finalText, interimText);
        });
        session.addEventListener('error', event => {
          if (recognition !== session) return;
          // Android Chrome may report no-speech during a thinking pause.
          if (event.error === 'no-speech' && keepListening) return;
          errorMessage = messages[event.error] || 'Diktiranje nije uspjelo. Pokušaj ponovno.';
          keepListening = false; // Never auto-restart after permissions or network errors.
          clearRestart();
          status.textContent = errorMessage;
          updateControls();
        });
        session.addEventListener('end', () => {
          if (recognition !== session) return;
          recognition = null;
          // Keep the last interim words too; the user can edit them.
          const segmentText = joinText(finalText, interimText);
          accumulatedText = joinText(accumulatedText, segmentText);
          transcript.value = accumulatedText;
          if (keepListening) {
            silentRestarts = segmentText ? 0 : Math.min(silentRestarts + 1, 8);
            status.textContent = 'Pauza… nastavljam slušati.';
            // Some browsers ignore continuous=true: resume after an automatic end.
            restartTimer = setTimeout(() => {
              restartTimer = null;
              if (keepListening) beginSegment();
            }, 250 + silentRestarts * 200);
          } else {
            status.textContent = errorMessage || 'Prijepis je spreman za uređivanje.';
          }
          updateControls();
        });
        status.textContent = 'Pokrećem mikrofon…';
        updateControls();
        session.start();
      } catch (_) {
        if (recognition === session) recognition = null;
        keepListening = false;
        clearRestart();
        status.textContent = 'Mikrofon se nije pokrenuo. Provjeri dozvolu i pokušaj ponovno.';
        updateControls();
      }
    }

    return { reset };
  }

  window.MoveTryJournalDictation = { attach };
})();
