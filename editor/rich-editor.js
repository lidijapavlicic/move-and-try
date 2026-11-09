
/*
 * MOVE&TRY | The Journal — visual editor (stage 1)
 * The existing textareas remain the sole persistence interface.
 * Only user edits serialize to the existing Markdown-compatible text format.
 * No Supabase schema, status, publishing, authentication or push changes.
 */
(function () {
  'use strict';

  if (window.MoveTryJournalRichEditor) return;

  const $ = id => document.getElementById(id);
  const specs = [
    {field:'article-content',title:'article-title',excerpt:'article-excerpt',lang:'hr'},
    {field:'article-content-en',title:'article-title-en',excerpt:'article-excerpt-en',lang:'en'}
  ];
  const instances = [];
  let preview = null;
  let previewLanguage = 'hr';
  let previewDevice = 'desktop';
  let priorFocus = null;
  let previousOverflow = '';

  function validUrl(value, forImage) {
    try {
      const url = new URL(String(value || '').trim(), location.origin);
      if (url.protocol === 'https:' || (!forImage && url.protocol === 'mailto:')) {
        return url.href;
      }
    } catch (_) {}
    return null;
  }

  function button(label, title, callback, className) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.title = title;
    b.setAttribute('aria-label', title);
    if (className) b.className = className;
    b.addEventListener('click', callback);
    return b;
  }

  function inline(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return (node.nodeValue || '').replace(/\u00a0/g, ' ');
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const tag = node.tagName.toLowerCase();
    if (tag === 'br') return '\n';
    const text = Array.from(node.childNodes).map(inline).join('');
    if (tag === 'b' || tag === 'strong') return text ? '**' + text + '**' : '';
    if (tag === 'i' || tag === 'em') return text ? '*' + text + '*' : '';
    if (tag === 'a') {
      const url = validUrl(node.getAttribute('href'), false);
      return url && text ? '[' + text.replace(/[\[\]]/g, '') + '](' + url + ')' : text;
    }
    return text;
  }

  function serialize(root) {
    const blocks = [];
    for (const node of root.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        const value = inline(node).trim();
        if (value) blocks.push(value);
        continue;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const tag = node.tagName.toLowerCase();
      if (tag === 'hr') {
        blocks.push('---');
        continue;
      }
      if (tag === 'figure') {
        const img = node.querySelector('img');
        const url = img && validUrl(img.getAttribute('src'), true);
        if (url) {
          const alt = (img.getAttribute('alt') || '').replace(/[\]\r\n]/g,'');
          blocks.push('![' + alt + '](' + url + ')');
        }
        continue;
      }
      if (tag === 'ul' || tag === 'ol') {
        let i = 1;
        const rows = [];
        for (const li of Array.from(node.children).filter(el => el.tagName === 'LI')) {
          const line = inline(li).trim();
          if (line) rows.push((tag === 'ol' ? String(i++) + '. ' : '- ') + line);
        }
        if (rows.length) blocks.push(rows.join('\n'));
        continue;
      }
      const value = inline(node).trim();
      if (!value) continue;
      if (tag === 'h2') blocks.push('## ' + value);
      else if (tag === 'h3') blocks.push('### ' + value);
      else if (tag === 'blockquote') {
        blocks.push(value.split('\n').map(line => '> ' + line).join('\n'));
      } else blocks.push(value);
    }
    return blocks.join('\n\n').trim();
  }

  function render(target, value) {
    target.replaceChildren();
    if (!String(value || '').trim()) return;
    const formatter = window.MoveTryJournalFormatting;
    if (formatter && typeof formatter.renderText === 'function') {
      formatter.renderText(target, value);
      target.querySelectorAll('figure').forEach(fig => {
        fig.contentEditable = 'false';
      });
    } else {
      const p = document.createElement('p');
      p.textContent = String(value);
      target.append(p);
    }
  }

  function updateHead(instance) {
    const title = $(instance.spec.title).value.trim();
    const excerpt = $(instance.spec.excerpt).value.trim();
    instance.heading.textContent = title || (instance.spec.lang === 'hr' ? 'Naslov članka' : 'Article title');
    instance.excerpt.textContent = excerpt || (instance.spec.lang === 'hr' ? 'Kratki opis članka' : 'Short description');
  }

  function createInstance(spec) {
    const field = $(spec.field);
    if (!field) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'mt-rich-wrapper';

    const bar = document.createElement('div');
    bar.className = 'mt-rich-toolbar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', spec.lang === 'hr' ? 'Oblikovanje članka' : 'Article formatting');

    const paper = document.createElement('div');
    paper.className = 'mt-rich-paper';
    const heading = document.createElement('div');
    heading.className = 'mt-rich-paper-title';
    const excerpt = document.createElement('div');
    excerpt.className = 'mt-rich-paper-excerpt';
    const canvas = document.createElement('div');
    canvas.className = 'mt-rich-canvas';
    canvas.contentEditable = 'true';
    canvas.spellcheck = true;
    canvas.setAttribute('role','textbox');
    canvas.setAttribute('aria-multiline','true');
    canvas.setAttribute('aria-label', spec.lang === 'hr' ? 'Tekst članka' : 'Article body');
    canvas.dataset.placeholder = spec.lang === 'hr' ? 'Ovdje počinje tvoja priča...' : 'Start writing here...';

    paper.append(heading, excerpt, canvas);
    const help = document.createElement('p');
    help.className = 'mt-rich-help';
    help.textContent = spec.lang === 'hr'
      ? 'Naslov i opis mijenjaš u poljima iznad. Tekst se sprema postojećim gumbom SPREMI IZMJENE.'
      : 'Edit title and description in the fields above. Save using the existing button.';
    wrapper.append(bar, paper, help);
    field.hidden = true;
    field.insertAdjacentElement('afterend', wrapper);

    const instance = {spec,field,bar,paper,heading,excerpt,canvas,selection:null,loaded:null};
    const styleButtons = new Map();

    function topBlock() {
      const selection = window.getSelection();
      let node = selection?.anchorNode;
      if (!node || !canvas.contains(node)) return null;
      if (node.nodeType !== Node.ELEMENT_NODE) node = node.parentElement;
      if (node === canvas) return null;
      while (node?.parentElement && node.parentElement !== canvas) {
        node = node.parentElement;
      }
      return node?.parentElement === canvas ? node : null;
    }

    function blockKind() {
      const block = topBlock();
      if (!block) return 'p';
      const tag = block.tagName.toLowerCase();
      if (tag === 'h2') return 'h2';
      if (tag === 'blockquote') return 'thought';
      if (tag === 'ol') return 'ordered';
      return 'p';
    }

    function saveSelection() {
      const selection = window.getSelection();
      if (selection && selection.rangeCount &&
          canvas.contains(selection.anchorNode) &&
          canvas.contains(selection.focusNode)) {
        instance.selection = selection.getRangeAt(0).cloneRange();
      }
    }

    function restoreSelection() {
      canvas.focus();
      if (!instance.selection) return;
      try {
        if (!canvas.contains(instance.selection.commonAncestorContainer)) return;
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(instance.selection);
      } catch (_) {}
    }

    function placeCaretAtEnd(element) {
      const range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      instance.selection = range.cloneRange();
    }

    function updateToolbarState() {
      const selection = window.getSelection();
      const node = selection?.anchorNode;
      const active = !!(node && canvas.contains(node) &&
        selection.focusNode && canvas.contains(selection.focusNode));
      const element = active
        ? (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement)
        : null;
      const has = selector => {
        const match = element?.closest(selector);
        return !!(match && canvas.contains(match));
      };
      const execState = command => {
        try { return active && !!document.queryCommandState(command); }
        catch (_) { return false; }
      };
      for (const [action, control] of styleButtons) {
        const pressed = action === 'bold'
          ? execState('bold') || has('strong,b')
          : action === 'italic'
            ? execState('italic') || has('em,i')
            : has('a[href]');
        control.setAttribute('aria-pressed', String(pressed));
      }
      if (active) styleSelect.value = blockKind();
    }

    function sync() {
      const value = serialize(canvas);
      if (field.value !== value) {
        field.value = value;
        field.dispatchEvent(new Event('input',{bubbles:true}));
      }
      saveSelection();
      updateToolbarState();
    }

    function setParagraphStyle(style) {
      restoreSelection();
      let block = topBlock();
      if (!block) {
        block = document.createElement('p');
        block.append(document.createElement('br'));
        canvas.append(block);
      }

      if (style === blockKind()) {
        updateToolbarState();
        return;
      }

      // Switching styles replaces a whole block rather than nesting them.
      // This also repairs the nested quote/list structure that the old toolbar allowed.
      const tag = style === 'h2' ? 'h2'
        : style === 'thought' ? 'blockquote'
          : style === 'ordered' ? 'ol' : 'p';
      const replacement = document.createElement(tag);

      if (tag === 'ol') {
        const item = document.createElement('li');
        if (block.tagName === 'OL' || block.tagName === 'UL') {
          for (const li of Array.from(block.querySelectorAll(':scope > li'))) {
            const copy = document.createElement('li');
            while (li.firstChild) copy.append(li.firstChild);
            replacement.append(copy);
          }
        } else {
          while (block.firstChild) item.append(block.firstChild);
          replacement.append(item);
        }
      } else if (block.tagName === 'OL' || block.tagName === 'UL') {
        // Convert an entire list back to normal text to avoid trapped lists.
        const parts = Array.from(block.children)
          .filter(child => child.tagName === 'LI')
          .map(child => child.textContent.trim())
          .filter(Boolean);
        replacement.textContent = parts.join(' ');
      } else if (block.querySelector('blockquote,ul,ol')) {
        // Clean up legacy nested blocks rather than carrying their borders forward.
        replacement.textContent = block.textContent.trim();
      } else {
        while (block.firstChild) replacement.append(block.firstChild);
      }

      block.replaceWith(replacement);
      placeCaretAtEnd(tag === 'ol' ? replacement.lastElementChild : replacement);
      styleSelect.value = style;
      sync();
      canvas.focus();
    }

    function command(action) {
      restoreSelection();
      if (action === 'link') {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || !selection.toString().trim()) {
          alert('Prvo označi tekst koji želiš povezati.');
          return;
        }
        const input = prompt('Poveznica (https://...)');
        if (input === null) return;
        const url = validUrl(input,false);
        if (!url) { alert('Unesi valjanu HTTPS poveznicu.'); return; }
        restoreSelection();
        document.execCommand('createLink', false, url);
      } else if (action === 'bold' || action === 'italic') {
        document.execCommand(action, false, null);
      }
      sync();
      canvas.focus();
      updateToolbarState();
    }

    const styleSelect = document.createElement('select');
    styleSelect.className = 'mt-rich-style-select';
    styleSelect.setAttribute('aria-label','Vrsta odlomka');
    styleSelect.title = 'Vrsta odlomka — odaberi običan tekst za povratak';
    [
      ['p','Običan tekst'],
      ['h2','Podnaslov'],
      ['thought','Istaknuta misao'],
      ['ordered','Numerirani popis']
    ].forEach(([value,label]) => {
      const option = document.createElement('option');
      option.value=value;
      option.textContent=label;
      styleSelect.append(option);
    });
    styleSelect.addEventListener('change', () => setParagraphStyle(styleSelect.value));
    bar.append(styleSelect);

    for (const [action,caption,title] of [
      ['bold','B','Podebljaj'],
      ['italic','I','Kurziv'],
      ['link','🔗','Dodaj poveznicu']
    ]) {
      const control = button(caption,title,() => command(action));
      control.setAttribute('aria-pressed','false');
      control.addEventListener('mousedown',e => e.preventDefault());
      styleButtons.set(action,control);
      bar.append(control);
    }

    bar.append(button('— CRTA', 'Umetni razdjelnu crtu između odlomaka', () => {
      restoreSelection();
      const block = topBlock();
      const hr = document.createElement('hr');
      hr.className = 'mt-article-divider';
      hr.contentEditable = 'false';
      hr.title = 'Klikni za uklanjanje crte';
      const next = document.createElement('p');
      next.append(document.createElement('br'));
      if (block) {
        block.after(hr, next);
      } else {
        canvas.append(hr, next);
      }
      placeCaretAtEnd(next);
      sync();
      canvas.focus();
    }, 'mt-rich-divider-button'));

    bar.append(button('PREGLEDAJ ČLANAK','Završni pregled preko cijelog ekrana',openPreview,'mt-rich-preview-button'));

    instance.load = function () {
      render(canvas,field.value);
      updateHead(instance);
      instance.selection = null;
      instance.loaded = field.value;
      field.hidden = true;
      updateToolbarState();
    };

    canvas.addEventListener('click', event => {
      const rule = event.target;
      if (rule?.tagName !== 'HR' || rule.parentElement !== canvas) return;
      if (!confirm('Ukloniti razdjelnu crtu iz članka?')) return;
      rule.remove();
      sync();
    });
    canvas.addEventListener('input',sync);
    canvas.addEventListener('keyup', () => {saveSelection();updateToolbarState();});
    canvas.addEventListener('mouseup', () => {saveSelection();updateToolbarState();});
    canvas.addEventListener('touchend', () => {
      saveSelection();
      updateToolbarState();
    }, {passive:true});
    canvas.addEventListener('focus',updateToolbarState);
    document.addEventListener('selectionchange',updateToolbarState);
    canvas.addEventListener('paste',function(event){
      const text = event.clipboardData && event.clipboardData.getData('text/plain');
      if (text == null) return;
      event.preventDefault();
      canvas.focus();
      if (!document.execCommand('insertText',false,text)) {
        const sel = window.getSelection();
        if (sel && sel.rangeCount) {
          const range = sel.getRangeAt(0);
          range.deleteContents();
          range.insertNode(document.createTextNode(text));
          range.collapse(false);
          sync();
        }
      }
    });

    $(spec.title).addEventListener('input',() => updateHead(instance));
    $(spec.excerpt).addEventListener('input',() => updateHead(instance));
    instances.push(instance);
  }

  function buildPreview() {
    if (preview) return;
    preview = document.createElement('section');
    preview.className = 'mt-rich-preview';
    preview.hidden = true;
    preview.setAttribute('role','dialog');
    preview.setAttribute('aria-modal','true');
    preview.setAttribute('aria-label','Pregled članka');

    const top = document.createElement('div');
    top.className = 'mt-rich-preview-top';
    const back = button('← NATRAG NA UREĐIVANJE','Zatvori pregled',closePreview);
    const hr = button('HR','Hrvatski prikaz',() => {previewLanguage='hr';paintPreview();});
    const en = button('EN','English preview',() => {previewLanguage='en';paintPreview();});
    const mobile = button('MOBITEL','Prikaz mobitela',() => {previewDevice='mobile';paintPreview();});
    const desktop = button('RAČUNALO','Prikaz računala',() => {previewDevice='desktop';paintPreview();});
    top.append(back,hr,en,mobile,desktop);

    const article = document.createElement('article');
    article.className = 'mt-rich-reader';
    const kicker = document.createElement('div');
    kicker.className = 'mt-rich-reader-kicker';
    kicker.textContent = 'MOVE&TRY · THE JOURNAL';
    const title = document.createElement('h1');
    title.className = 'mt-rich-reader-title';
    const excerpt = document.createElement('p');
    excerpt.className = 'mt-rich-reader-excerpt';
    const cover = document.createElement('img');
    cover.className = 'mt-rich-reader-cover';
    const body = document.createElement('div');
    body.className = 'mt-rich-reader-body';
    article.append(kicker,title,excerpt,cover,body);
    preview.append(top,article);
    document.body.append(preview);
    preview.refs = {back,hr,en,mobile,desktop,title,excerpt,cover,body};
    preview.addEventListener('keydown',e => {if(e.key==='Escape') closePreview();});
  }

  function paintPreview() {
    const r=preview.refs;
    const admin = !$('admin-en-fields').hidden;
    if (!admin) previewLanguage='hr';
    r.en.hidden=!admin;
    r.hr.setAttribute('aria-pressed',String(previewLanguage==='hr'));
    r.en.setAttribute('aria-pressed',String(previewLanguage==='en'));
    r.mobile.setAttribute('aria-pressed',String(previewDevice==='mobile'));
    r.desktop.setAttribute('aria-pressed',String(previewDevice==='desktop'));
    preview.classList.toggle('mobile',previewDevice==='mobile');
    const en = previewLanguage==='en' && admin;
    r.title.textContent = $(en?'article-title-en':'article-title').value || (en?'Article title':'Naslov članka');
    r.excerpt.textContent = $(en?'article-excerpt-en':'article-excerpt').value || '';
    r.cover.hidden = true;
    r.cover.removeAttribute('src');
    const coverUrl=validUrl($('article-cover').value,true);
    if(coverUrl){r.cover.src=coverUrl;r.cover.alt='Naslovna fotografija';r.cover.hidden=false;}
    render(r.body,$(en?'article-content-en':'article-content').value);
  }

  function openPreview(){
    buildPreview();
    for (const instance of instances) {
      if (instance.field.value !== serialize(instance.canvas)) instance.field.value=serialize(instance.canvas);
    }
    priorFocus = document.activeElement;
    previewLanguage='hr';
    previewDevice='desktop';
    paintPreview();
    previousOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    preview.hidden=false;
    preview.scrollTop=0;
    preview.refs.back.focus();
  }

  function closePreview(){
    if(!preview||preview.hidden)return;
    preview.hidden=true;
    document.body.style.overflow=previousOverflow;
    if(priorFocus&&typeof priorFocus.focus==='function')priorFocus.focus();
  }

  function initialize(){
    specs.forEach(createInstance);
    const panel=$('editor-panel');
    if(panel){
      const observer=new MutationObserver(() => {
        if(!panel.hidden){
          instances.forEach(instance => instance.load());
        } else {
          closePreview();
        }
      });
      observer.observe(panel,{attributes:true,attributeFilter:['hidden']});
    }
  }
  window.MoveTryJournalRichEditor={enabled:true,initialize};
  document.addEventListener('DOMContentLoaded',initialize,{once:true});
})();
