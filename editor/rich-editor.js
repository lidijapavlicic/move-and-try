
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

    function updateToolbarState() {
      const selection = window.getSelection();
      const node = selection?.anchorNode;
      const inCanvas = !!(node && canvas.contains(node) &&
        selection.focusNode && canvas.contains(selection.focusNode));
      const element = inCanvas
        ? (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement)
        : null;

      const ancestor = selector => !!element?.closest(selector) &&
        canvas.contains(element.closest(selector));
      const state = commandName => {
        try {
          return inCanvas && !!document.queryCommandState(commandName);
        } catch (_) {
          return false;
        }
      };
      const active = {
        bold: state('bold') || ancestor('b,strong'),
        italic: state('italic') || ancestor('i,em'),
        h2: ancestor('h2'),
        h3: ancestor('h3'),
        quote: ancestor('blockquote'),
        bullets: ancestor('ul'),
        numbers: ancestor('ol'),
        link: ancestor('a[href]')
      };

      for (const [action, control] of styleButtons) {
        control.setAttribute('aria-pressed', String(!!active[action]));
      }
    }

    function saveSelection() {
      const s = window.getSelection();
      if (s && s.rangeCount && canvas.contains(s.anchorNode) && canvas.contains(s.focusNode)) {
        instance.selection = s.getRangeAt(0).cloneRange();
      }
    }
    function restoreSelection() {
      canvas.focus();
      if (!instance.selection) return;
      try {
        if (!canvas.contains(instance.selection.commonAncestorContainer)) return;
        const s = window.getSelection();
        s.removeAllRanges();
        s.addRange(instance.selection);
      } catch (_) {}
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

    function command(action) {
      restoreSelection();
      if (action === 'link') {
        const s = window.getSelection();
        if (!s || s.isCollapsed || !s.toString().trim()) {
          alert('Najprije označi tekst koji želiš pretvoriti u poveznicu.');
          return;
        }
        const raw = prompt('Poveznica (https://...)');
        if (raw === null) return;
        const url = validUrl(raw,false);
        if (!url) { alert('Unesi valjanu HTTPS poveznicu.'); return; }
        restoreSelection();
        document.execCommand('createLink', false, url);
      } else {
        const commands = {
          bold:['bold',null], italic:['italic',null],
          h2:['formatBlock','h2'],h3:['formatBlock','h3'],
          quote:['formatBlock','blockquote'],
          bullets:['insertUnorderedList',null],
          numbers:['insertOrderedList',null]
        };
        const info = commands[action];
        if (info) document.execCommand(info[0], false, info[1]);
      }
      sync();
      canvas.focus();
      updateToolbarState();
    }

    const items = [
      ['bold','B','Podebljaj'],
      ['italic','I','Kurziv'],
      ['h2','H2','Podnaslov'],
      ['h3','H3','Manji podnaslov'],
      ['quote','❝','Citat'],
      ['bullets','•','Popis'],
      ['numbers','1.','Numerirani popis'],
      ['link','🔗','Poveznica']
    ];
    for (const item of items) {
      const b = button(item[1],item[2],() => command(item[0]));
      b.setAttribute('aria-pressed', 'false');
      styleButtons.set(item[0], b);
      b.addEventListener('mousedown',event => event.preventDefault());
      bar.append(b);
    }
    bar.append(button('PREGLEDAJ ČLANAK','Završni pregled preko cijelog ekrana',openPreview,'mt-rich-preview-button'));

    instance.load = function () {
      render(canvas,field.value);
      updateHead(instance);
      instance.selection = null;
      instance.loaded = field.value;
      field.hidden = true;
      updateToolbarState();
    };

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
