/* MOVE&TRY Journal – single simple file import (TXT, MD, audio).
   Files are read in this browser; no file is sent to Supabase or a paid AI API.
   Audio transcription is experimental and needs model download and enough device RAM. */
(() => {
  'use strict';
  if (window.MoveTryJournalFileImport) return;
  const MAX_TEXT_BYTES = 1024 * 1024;
  const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
  const MAX_AUDIO_SECONDS = 600;
  const AUDIO_EXTENSION = /\.(mp3|m4a|mp4|wav|webm|ogg)$/i;
  const TEXT_EXTENSION = /\.(txt|md)$/i;
  const elt = (tag, text, cls) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  };
  function button(label, fn, cls) {
    const b = elt('button', label, cls || 'btn secondary small-btn');
    b.type = 'button';
    b.addEventListener('click', fn);
    return b;
  }
  async function decodeAudio(file, onProgress) {
    const bytes = await file.arrayBuffer();
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context || !window.OfflineAudioContext) throw new Error('Preglednik ne podržava obradu ove snimke.');
    const ctx = new Context();
    try {
      const decoded = await ctx.decodeAudioData(bytes);
      if (decoded.duration > MAX_AUDIO_SECONDS) {
        throw new Error('Za sada su podržane snimke do 10 minuta. Za dulje razgovore trebat će posebna obrada.');
      }
      onProgress('Pripremam zvuk za prepoznavanje govora…');
      const length = Math.ceil(decoded.duration * 16000);
      const offline = new OfflineAudioContext(1, Math.max(1, length), 16000);
      const source = offline.createBufferSource();
      source.buffer = decoded;
      source.connect(offline.destination);
      source.start(0);
      const rendered = await offline.startRendering();
      return Float32Array.from(rendered.getChannelData(0));
    } finally {
      if (ctx.state !== 'closed') await ctx.close().catch(() => {});
    }
  }

  function attach({ toolbar, paper, getArticleText, putArticleText, lang }) {
    const en = lang === 'en';
    const panel = elt('section', undefined, 'mt-file-import');
    panel.id = 'mt-file-import-' + lang;
    panel.hidden = true;
    const trigger = button(en ? '📎 IMPORT FILE' : '📎 UČITAJ DATOTEKU', () => {
      if (panel.hidden) {
        panel.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        file.focus();
      } else {
        close();
      }
    }, 'mt-file-import-trigger');
    trigger.setAttribute('aria-controls', panel.id);
    trigger.setAttribute('aria-expanded', 'false');
    toolbar.append(trigger);
    paper.before(panel);

    const description = elt('p', en
      ? 'Choose a text file or an audio recording. Review the result, then insert it into the article.'
      : 'Odaberi tekstualnu datoteku ili snimljeni razgovor. Pregledaj rezultat i zatim ga umetni u članak.');
    const file = document.createElement('input');
    file.type = 'file';
    file.accept = '.txt,.md,.mp3,.m4a,.mp4,.wav,.webm,.ogg,audio/*';
    file.setAttribute('aria-label', en ? 'Select file' : 'Odaberi datoteku');
    const text = document.createElement('textarea');
    text.rows = 7;
    text.lang = lang;
    text.placeholder = en ? 'The imported text appears here…' : 'Ovdje će se pojaviti učitani tekst…';
    text.setAttribute('aria-label', en ? 'Imported text' : 'Učitani tekst');
    const status = elt('p', '', 'message');
    status.setAttribute('role','status');
    const controls = elt('div', undefined, 'actions');
    const insert = button(en ? 'Add to article' : 'Dodaj u članak', insertText, 'btn green small-btn');
    const cancel = button(en ? 'Close' : 'Zatvori', close);
    controls.append(insert, cancel);
    panel.append(description, file, text, status, controls);

    let activeWorker = null;
    let inProgress = false;
    let sequence = 0;
    function setStatus(s, bad) {
      status.textContent = s;
      status.classList.toggle('error', !!bad);
    }
    function update() {
      insert.disabled = inProgress || !text.value.trim();
      file.disabled = inProgress;
    }
    function stopWorker() {
      if (activeWorker) activeWorker.terminate();
      activeWorker = null;
    }
    function close() {
      sequence++;
      stopWorker();
      inProgress = false;
      panel.hidden = true;
      trigger.setAttribute('aria-expanded','false');
      file.value = '';
      text.value = '';
      setStatus('');
      update();
    }
    function insertText() {
      const candidate = text.value.trim();
      if (!candidate || inProgress) return;
      const previous = getArticleText().trim();
      if (previous && !confirm(en
        ? 'Add imported text to the end of the current article? The existing text will remain.'
        : 'Dodati učitani tekst na kraj članka? Postojeći tekst ostaje sačuvan.')) return;
      try {
        putArticleText(candidate);
        close();
      } catch (_) {
        setStatus(en ? 'Could not insert text. You can still copy it manually.' : 'Tekst nije umetnut. Možeš ga ručno kopirati.', true);
      }
    }
    file.addEventListener('change', async () => {
      const selected = file.files?.[0];
      if (!selected || inProgress) return;
      const mySeq = ++sequence;
      text.value = '';
      update();
      if (TEXT_EXTENSION.test(selected.name)) {
        if (selected.size > MAX_TEXT_BYTES) return setStatus('Datoteka je prevelika (najviše 1 MB).', true);
        try {
          const content = await selected.text();
          if (mySeq !== sequence) return;
          text.value = content;
          setStatus(en ? 'Text ready to insert.' : 'Tekst je spreman za umetanje.');
        } catch (_) {
          if (mySeq === sequence) setStatus('Datoteka se ne može pročitati.', true);
        }
        update();
        return;
      }
      if (!AUDIO_EXTENSION.test(selected.name) || !selected.size || selected.size > MAX_AUDIO_BYTES) {
        return setStatus('Odaberi TXT/MD ili audiozapis do 25 MB.', true);
      }
      inProgress = true;
      update();
      setStatus('Obrađujem snimku lokalno. Ovo može potrajati, osobito na mobitelu.');
      try {
        const audio = await decodeAudio(selected, message => {
          if (mySeq === sequence) setStatus(message);
        });
        if (mySeq !== sequence) return;
        const worker = new Worker('./journal-local-audio-worker.js?v=20261127', { type: 'module' });
        activeWorker = worker;
        worker.onmessage = ({ data }) => {
          if (mySeq !== sequence || activeWorker !== worker) return;
          if (data.type === 'status') setStatus(data.message);
          if (data.type === 'progress') setStatus('Preuzimam model: ' + data.percent + '%');
          if (data.type === 'result' || data.type === 'error') {
            if (data.type === 'result') {
              text.value = String(data.text || '');
              setStatus('Prijepis je spreman. Provjeri ga prije umetanja.');
            } else {
              setStatus(data.message || 'Prepoznavanje govora nije uspjelo.', true);
            }
            stopWorker();
            inProgress = false;
            update();
          }
        };
        worker.onerror = () => {
          if (mySeq !== sequence) return;
          stopWorker();
          inProgress = false;
          setStatus('Besplatna lokalna obrada nije podržana ili model nije dostupan na ovom uređaju.', true);
          update();
        };
        worker.postMessage({ audio, language: lang }, [audio.buffer]);
      } catch (error) {
        if (mySeq !== sequence) return;
        inProgress = false;
        setStatus(error?.message || 'Snimka se ne može obraditi.', true);
        update();
      }
    });
    text.addEventListener('input', update);
    update();
    return { reset: close };
  }
  window.MoveTryJournalFileImport = { attach };
})();