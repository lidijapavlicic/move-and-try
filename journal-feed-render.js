/*
 * MOVE&TRY The Journal — published article card renderer.
 * The build-generated manifest contains public editorial metadata only.
 * This never uses any Supabase secret or renders unpublished database data.
 * Load AFTER journal-feed.js and BEFORE the existing Journal filter script.
 */
(() => {
  'use strict';
  const feed = window.MoveTryJournalFeed;
  const root = document.getElementById('journal-posts');
  const nav = document.querySelector('#journal-column-wrap .journal-columns');
  if (!feed || !Array.isArray(feed.items) || !root) return;
  const locale = document.documentElement.lang === 'hr' ? 'hr' : 'en';
  const categories = {
    hr: { editorial:'UREDNIČKI TEKSTOVI', personal:'KOLUMNE',
      guest:'GOSTUJUĆE PRIČE', news:'NOVOSTI', inspiration:'INSPIRACIJA' },
    en: { editorial:'EDITORIAL', personal:'COLUMNS',
      guest:'GUEST STORIES', news:'NEWS', inspiration:'INSPIRATION' }
  };
  const seen = new Set([...root.querySelectorAll('.journal-post')].map(node => node.getAttribute('href')));
  const columnNames = {};
  const columnProfiles = {};

  function textEl(tag, cls, value) {
    const el=document.createElement(tag);
    if(cls)el.className=cls;
    el.textContent=String(value||'');
    return el;
  }
  function safeImage(value) {
    if (typeof value!=='string' || !/^\/images\/journal-published\/[a-z0-9/_\-.]+$/i.test(value)) return null;
    return value;
  }
  function readUrl(value) {
    if (typeof value!=='string' || !/^\/(?:hr\/)?journal\/[a-z0-9-]+\.html$/.test(value)) return null;
    return value;
  }
  function postCard(entry) {
    const href=readUrl(locale==='hr' ? entry.hrUrl : entry.enUrl);
    if(!href || seen.has(href))return;
    const category=String(entry.category||'');
    if(!categories[locale][category])return;
    const title=locale==='hr' ? entry.titleHr : entry.titleEn;
    const excerpt=locale==='hr' ? entry.excerptHr : entry.excerptEn;
    if(!title || !excerpt)return;
    seen.add(href);
    const node=document.createElement('a');
    node.className='journal-post';
    node.href=href;
    node.hidden=true;
    node.dataset.category=category;
    if(category==='personal' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.columnSlug||'')) {
      node.dataset.column=entry.columnSlug;
    }
    if(entry.publishedAt && !Number.isNaN(Date.parse(entry.publishedAt)))node.dataset.publishAt=entry.publishedAt;
    const photo=safeImage(entry.cover);
    if(photo){
      const img=document.createElement('img');
      img.className='journal-post-image';
      img.src=photo;img.alt=String(title);img.loading='lazy';
      node.append(img);
    } else {
      node.append(textEl('div','journal-post-image journal-post-placeholder','THE JOURNAL'));
    }
    const copy=textEl('div','journal-post-copy','');
    const displayDate=entry.publishedAt
      ? new Date(entry.publishedAt).toLocaleDateString(locale==='hr'?'hr-HR':'en-GB')
      : '';
    copy.append(textEl('span','journal-post-category',
      categories[locale][category]+' · '+displayDate));
    copy.append(textEl('h3','journal-post-title',title));
    copy.append(textEl('p','journal-post-description',excerpt));
    copy.append(textEl('span','journal-post-author',entry.byline||'MOVE&TRY Editorial'));
    node.append(copy);
    root.prepend(node);
  }
  for(const entry of feed.items) {
    if(entry && typeof entry==='object')postCard(entry);
  }
  if(nav && Array.isArray(feed.columns)){
    const known=new Set([...nav.querySelectorAll('[data-column]')].map(el=>el.dataset.column));
    for(const c of feed.columns){
      if(!c || c.listed!==true)continue;
      if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(c.slug||''))continue;
      const visible=feed.items.some(i=>i.category==='personal' &&
        i.columnSlug===c.slug && !!readUrl(locale==='hr'?i.hrUrl:i.enUrl));
      if(!visible)continue;
      columnNames[c.slug]=c.title||c.byline||c.slug;
      columnProfiles[c.slug]={
        title:c.title||c.byline||c.slug,
        paragraphs:c.description ? [c.description] : []
      };
      if(known.has(c.slug))continue;
      known.add(c.slug);
      const button=document.createElement('button');
      button.type='button';
      button.className='journal-column';
      button.dataset.column=c.slug;
      button.setAttribute('aria-pressed','false');
      button.textContent=c.title||c.byline||c.slug;
      nav.append(button);
    }
  }
  window.MoveTryJournalAddedColumnNames=columnNames;
  window.MoveTryJournalAddedColumnProfiles=columnProfiles;
})();
