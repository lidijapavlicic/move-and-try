
/*
 * MOVE&TRY — The Journal Editor
 * Formatting & Preview Module
 *
 * Existing textareas and Supabase saving remain unchanged.
 * Article text is rendered safely without executing HTML.
 */

(() => {
  'use strict';

  if (window.MoveTryJournalFormatting) return;

  const $ = id => document.getElementById(id);

  const fields = [
    {
      id: 'article-content',
      title: 'article-title',
      excerpt: 'article-excerpt',
      locale: 'hr'
    },
    {
      id: 'article-content-en',
      title: 'article-title-en',
      excerpt: 'article-excerpt-en',
      locale: 'en'
    }
  ];

  const instances = [];

  function safeUrl(value, image = false) {
    const raw = String(value || '').trim();

    if (!raw || /[\u0000-\u001f]/.test(raw)) {
      return null;
    }

    try {
      const parsed = new URL(raw, location.origin);

      if (
        parsed.protocol === 'https:' ||
        (
          parsed.origin === location.origin &&
          parsed.protocol === 'http:'
        ) ||
        (
          !image &&
          parsed.protocol === 'mailto:'
        )
      ) {
        return parsed.href;
      }
    } catch (_) {
      // Invalid URL.
    }

    return null;
  }

  function renderInline(target, text) {
    const source = String(text ?? '');

    const tokens =
      /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|\[[^\]\n]+\]\([^\)\n]+\))/g;

    let from = 0;

    for (const match of source.matchAll(tokens)) {
      const index = match.index;

      if (index > from) {
        target.append(
          document.createTextNode(
            source.slice(from, index)
          )
        );
      }

      const token = match[0];

      if (token.startsWith('**')) {
        const strong = document.createElement('strong');
        strong.textContent = token.slice(2, -2);
        target.append(strong);

      } else if (token.startsWith('*')) {
        const italic = document.createElement('em');
        italic.textContent = token.slice(1, -1);
        target.append(italic);

      } else {
        const parts =
          /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);

        const url = safeUrl(parts?.[2]);

        if (!url) {
          target.append(
            document.createTextNode(token)
          );
        } else {
          const link = document.createElement('a');

          link.textContent = parts[1];
          link.href = url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';

          target.append(link);
        }
      }

      from = index + token.length;
    }

    if (from < source.length) {
      target.append(
        document.createTextNode(source.slice(from))
      );
    }
  }

  function renderText(container, value) {
    container.replaceChildren();

    const lines = String(value || '')
      .replace(/\r\n?/g, '\n')
      .split('\n');

    let list = null;
    let paragraph = null;

    for (const line of lines) {
      const clean = line.trim();

      if (!clean) {
        list = null;
        paragraph = null;
        continue;
      }

      const image =
        /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(clean);

      if (image) {
        list = null;
        paragraph = null;

        const url = safeUrl(image[2], true);

        if (!url) {
          const note = document.createElement('p');

          note.textContent =
            'Fotografija: neispravna ili nesigurna poveznica.';

          container.append(note);
          continue;
        }

        const figure = document.createElement('figure');
        const img = document.createElement('img');

        img.src = url;
        img.alt = image[1];
        img.loading = 'lazy';

        figure.append(img);

        if (image[1]) {
          const caption =
            document.createElement('figcaption');

          caption.textContent = image[1];
          figure.append(caption);
        }

        container.append(figure);
        continue;
      }

      const heading =
        /^(#{2,3})\s+(.+)$/.exec(clean);

      const quote =
        /^>\s?(.+)$/.exec(clean);

      const bullet =
        /^([-*]|\d+\.)\s+(.+)$/.exec(clean);

      if (heading || quote) {
        list = null;
        paragraph = null;

        const tag = heading
          ? heading[1].length === 2
            ? 'h2'
            : 'h3'
          : 'blockquote';

        const element = document.createElement(tag);

        renderInline(
          element,
          heading ? heading[2] : quote[1]
        );

        container.append(element);
        continue;
      }

      if (bullet) {
        paragraph = null;

        const tag =
          /^\d/.test(bullet[1]) ? 'ol' : 'ul';

        if (
          !list ||
          list.tagName.toLowerCase() !== tag
        ) {
          list = document.createElement(tag);
          container.append(list);
        }

        const item = document.createElement('li');

        renderInline(item, bullet[2]);
        list.append(item);

        continue;
      }

      list = null;

      if (!paragraph) {
        paragraph = document.createElement('p');
        container.append(paragraph);
      } else {
        paragraph.append(
          document.createElement('br')
        );
      }

      renderInline(paragraph, line);
    }

    if (!container.childNodes.length) {
      const empty = document.createElement('p');

      empty.className = 'mt-preview-empty';
      empty.textContent =
        'Ovdje će se prikazati pregled članka.';

      container.append(empty);
    }
  }

  function replaceSelection(
    field,
    replacement,
    selectStart,
    selectEnd
  ) {
    const from = field.selectionStart;

    field.setRangeText(
      replacement,
      from,
      field.selectionEnd,
      'end'
    );

    field.focus();

    if (typeof selectStart === 'number') {
      field.setSelectionRange(
        from + selectStart,
        from + (selectEnd ?? selectStart)
      );
    }

    field.dispatchEvent(
      new Event('input', { bubbles: true })
    );
  }

  function wrap(
    field,
    left,
    right,
    placeholder
  ) {
    const selected =
      field.value.slice(
        field.selectionStart,
        field.selectionEnd
      ) || placeholder;

    replaceSelection(
      field,
      left + selected + right,
      left.length,
      left.length + selected.length
    );
  }

  function prefixLines(field, prefix) {
    const start =
      field.value.lastIndexOf(
        '\n',
        field.selectionStart - 1
      ) + 1;

    const end = field.value.indexOf(
      '\n',
      field.selectionEnd
    );

    const finish =
      end === -1 ? field.value.length : end;

    const selected =
      field.value.slice(start, finish);

    const replacement = selected
      .split('\n')
      .map(line => prefix + line)
      .join('\n');

    field.setRangeText(
      replacement,
      start,
      finish,
      'end'
    );

    field.focus();

    field.dispatchEvent(
      new Event('input', { bubbles: true })
    );
  }

  function applyAction(field, action) {
    if (action === 'bold') {
      return wrap(
        field, '**', '**', 'istaknuti tekst'
      );
    }

    if (action === 'italic') {
      return wrap(
        field, '*', '*', 'tekst'
      );
    }

    if (action === 'h2') {
      return prefixLines(field, '## ');
    }

    if (action === 'h3') {
      return prefixLines(field, '### ');
    }

    if (action === 'quote') {
      return prefixLines(field, '> ');
    }

    if (action === 'bullet') {
      return prefixLines(field, '- ');
    }

    if (action === 'number') {
      return prefixLines(field, '1. ');
    }

    if (action === 'link') {
      const url = prompt(
        'Poveznica (https://...)'
      );

      if (url === null) return;

      if (!safeUrl(url)) {
        alert('Unesi valjanu HTTPS poveznicu.');
        return;
      }

      const selected =
        field.value.slice(
          field.selectionStart,
          field.selectionEnd
        ) || 'tekst poveznice';

      return replaceSelection(
        field,
        `[${selected}](${url.trim()})`
      );
    }

    if (action === 'image') {
      const url = prompt(
        'URL fotografije (https://...)'
      );

      if (url === null) return;

      if (!safeUrl(url, true)) {
        alert(
          'Unesi valjanu HTTPS poveznicu na fotografiju.'
        );
        return;
      }

      const alt = (
        prompt(
          'Opis fotografije (alternativni tekst / natpis):'
        ) || ''
      )
        .replace(/[\]\r\n]/g, ' ')
        .trim();

      return replaceSelection(
        field,
        `\n\n![${alt}](${url.trim()})\n\n`
      );
    }
  }

  function installStyles() {
    const style = document.createElement('style');

    style.id = 'mt-journal-formatting-css';

    style.textContent = `
      .mt-format-bar {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        padding: 10px 0;
        margin: 0 0 9px;
        border-top: 1px solid var(--line, #dcded6);
      }

      .mt-format-bar button {
        width: auto;
        min-height: 35px;
        padding: 7px 10px;
        border: 1px solid var(--line, #dcded6);
        background: var(--white, #fff);
        color: var(--ink, #171916);
        font: 700 11px Manrope, Arial, sans-serif;
        letter-spacing: 0;
      }

      .mt-format-bar button:hover,
      .mt-format-bar button:focus-visible {
        border-color: var(--green, #687b61);
        background: var(--soft, #eeefe9);
      }

      .mt-format-bar button[aria-pressed="true"] {
        color: #fff;
        background: var(--green, #687b61);
        border-color: var(--green, #687b61);
      }

      .mt-format-hint {
        font-size: 11px;
        color: var(--muted, #6d716a);
        line-height: 1.65;
        margin: 2px 0 12px;
      }

      .mt-format-preview {
        padding: 26px clamp(16px, 4vw, 40px);
        border: 1px solid var(--line, #dcded6);
        background: var(--white, #fff);
        min-height: 260px;
        overflow-wrap: anywhere;
        color: var(--ink, #171916);
      }

      .mt-format-preview h1,
      .mt-format-preview h2,
      .mt-format-preview h3 {
        font-family: 'DM Serif Display', Georgia, serif;
        font-weight: 400;
        line-height: 1.22;
      }

      .mt-format-preview h1 {
        font-size: clamp(29px, 5vw, 44px);
        margin: 0 0 12px;
      }

      .mt-format-preview h2 {
        font-size: clamp(24px, 4vw, 32px);
        margin: 28px 0 12px;
      }

      .mt-format-preview h3 {
        font-size: clamp(21px, 3vw, 26px);
        margin: 24px 0 10px;
      }

      .mt-format-preview p,
      .mt-format-preview li,
      .mt-format-preview blockquote {
        font-size: 14px;
        line-height: 1.9;
      }

      .mt-format-preview p {
        margin: 0 0 16px;
      }

      .mt-format-preview .mt-preview-excerpt {
        font-size: 13px;
        color: var(--muted, #6d716a);
        margin: 0 0 24px;
      }

      .mt-format-preview blockquote {
        margin: 22px 0;
        border-left: 3px solid var(--green, #687b61);
        padding: 5px 18px;
        color: var(--muted, #6d716a);
      }

      .mt-format-preview ul,
      .mt-format-preview ol {
        margin: 12px 0 20px;
        padding-left: 24px;
      }

      .mt-format-preview li {
        padding: 2px 0;
      }

      .mt-format-preview a {
        color: inherit;
        text-decoration: underline;
        text-underline-offset: 3px;
      }

      .mt-format-preview figure {
        margin: 22px 0 26px;
      }

      .mt-format-preview img {
        display: block;
        max-width: 100%;
        height: auto;
        max-height: 540px;
        object-fit: contain;
        margin: 0 auto;
      }

      .mt-format-preview figcaption {
        font: 500 11px/1.7 Manrope, Arial, sans-serif;
        text-align: center;
        color: var(--muted, #6d716a);
        padding-top: 9px;
      }

      .mt-format-preview .mt-preview-cover {
        width: 100%;
        max-height: 430px;
        object-fit: cover;
        margin: 0 0 23px;
      }

      .mt-format-preview .mt-preview-empty {
        color: var(--muted, #6d716a);
      }

      .mt-format-preview [hidden] {
        display: none !important;
      }
    `;

    document.head.append(style);
  }

  function setup(spec) {
    const field = $(spec.id);

    if (!field || !field.parentElement) return;

    const bar = document.createElement('div');

    bar.className = 'mt-format-bar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute(
      'aria-label',
      spec.locale === 'hr'
        ? 'Oblikovanje članka'
        : 'Article formatting'
    );

    const buttons = [
      ['bold', 'B', 'Podebljaj'],
      ['italic', 'I', 'Kurziv'],
      ['h2', 'H2', 'Podnaslov'],
      ['h3', 'H3', 'Manji podnaslov'],
      ['quote', '❝', 'Citat'],
      ['bullet', '•', 'Popis'],
      ['number', '1.', 'Numerirani popis'],
      ['link', '🔗', 'Poveznica'],
      ['image', 'FOTO URL', 'Fotografija preko URL-a']
    ];

    for (const [action, caption, title] of buttons) {
      const button = document.createElement('button');

      button.type = 'button';
      button.textContent = caption;
      button.title = title;
      button.setAttribute('aria-label', title);

      button.addEventListener(
        'click',
        () => applyAction(field, action)
      );

      bar.append(button);
    }

    const toggle = document.createElement('button');

    toggle.type = 'button';
    toggle.textContent = 'PREGLED';
    toggle.title = 'Pregled oblikovanog članka';
    toggle.setAttribute('aria-pressed', 'false');

    bar.append(toggle);

    field.parentElement.insertBefore(bar, field);

    const note = document.createElement('p');

    note.className = 'mt-format-hint';
    note.textContent =
      'Tekst i oznake spremaju se u postojeću skicu. ' +
      'Pregled je samo u Editoru; ' +
      'javni Journal povezujemo zasebno.';

    const preview = document.createElement('div');

    preview.className = 'mt-format-preview';
    preview.hidden = true;
    preview.setAttribute(
      'aria-label',
      'Pregled članka'
    );

    field.insertAdjacentElement(
      'afterend',
      preview
    );

    preview.insertAdjacentElement(
      'afterend',
      note
    );

    function refresh() {
      if (preview.hidden) return;

      preview.replaceChildren();

      const title =
        $(spec.title)?.value.trim();

      if (title) {
        const heading = document.createElement('h1');
        heading.textContent = title;
        preview.append(heading);
      }

      const excerpt =
        $(spec.excerpt)?.value.trim();

      if (excerpt) {
        const paragraph = document.createElement('p');

        paragraph.className = 'mt-preview-excerpt';
        paragraph.textContent = excerpt;

        preview.append(paragraph);
      }

      if (spec.locale === 'hr') {
        const cover = safeUrl(
          $('article-cover')?.value,
          true
        );

        if (cover) {
          const img = document.createElement('img');

          img.className = 'mt-preview-cover';
          img.src = cover;
          img.alt = 'Naslovna fotografija';

          preview.append(img);
        }
      }

      const body = document.createElement('div');

      renderText(body, field.value);

      preview.append(body);
    }

    function setPreview(visible) {
      field.hidden = !!visible;
      preview.hidden = !visible;

      toggle.textContent =
        visible ? 'UREĐIVANJE' : 'PREGLED';

      toggle.setAttribute(
        'aria-pressed',
        String(!!visible)
      );

      if (visible) {
        refresh();
      } else {
        field.focus();
      }
    }

    toggle.addEventListener(
      'click',
      () => setPreview(preview.hidden)
    );

    field.addEventListener('input', refresh);

    field.addEventListener('keydown', event => {
      if (
        !(event.ctrlKey || event.metaKey) ||
        event.altKey
      ) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === 'b' || key === 'i') {
        event.preventDefault();

        applyAction(
          field,
          key === 'b' ? 'bold' : 'italic'
        );
      }
    });

    const relatedFields = [
      spec.title,
      spec.excerpt,
      ...(
        spec.locale === 'hr'
          ? ['article-cover']
          : []
      )
    ];

    for (const id of relatedFields) {
      $(id)?.addEventListener('input', refresh);
    }

    instances.push({
      refresh,
      setPreview
    });
  }

  function initialize() {
    if (!$('article-form')) return;

    installStyles();

    fields.forEach(setup);

    const editorPanel = $('editor-panel');

    if (editorPanel) {
      const observer = new MutationObserver(() => {
        if (!editorPanel.hidden) {
          instances.forEach(
            instance => instance.setPreview(false)
          );
        }
      });

      observer.observe(editorPanel, {
        attributes: true,
        attributeFilter: ['hidden']
      });
    }
  }

  window.MoveTryJournalFormatting = {
    renderText,
    initialize
  };

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      initialize,
      { once: true }
    );
  } else {
    initialize();
  }
})();
