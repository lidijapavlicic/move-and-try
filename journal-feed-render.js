/*
 * MOVE&TRY · The Journal — public-only feed.
 * Supabase RPC returns published/scheduled-elapsed articles WITH safe public
 * media snapshots. Existing manually authored cards remain untouched.
 */
(() => {
  'use strict';
  const API='https://pdyngeaykfpybeafjtpw.supabase.co/rest/v1/rpc/journal_public_articles_feed';
  const KEY='sb_publishable_liv_WfA9YbjizQvpOrB68w_mkVgR_WK';
  const root=document.getElementById('journal-posts');
  const nav=document.querySelector('#journal-column-wrap .journal-columns');
  if(!root)return;
  const lang=document.documentElement.lang==='hr'?'hr':'en';
  const categories={
    hr:{editorial:'UREDNIČKI TEKSTOVI',personal:'KOLUMNE',guest:'GOSTUJUĆE PRIČE',news:'NOVOSTI',inspiration:'INSPIRACIJA'},
    en:{editorial:'EDITORIAL',personal:'COLUMNS',guest:'GUEST STORIES',news:'NEWS',inspiration:'INSPIRATION'}
  };
  const added={names:{},profiles:{}};
  function el(tag,cls,txt){
    const node=document.createElement(tag);
    if(cls)node.className=cls;
    if(txt!==undefined)node.textContent=String(txt||'');
    return node;
  }
  function internalUrl(u){
    return typeof u==='string' && /^\/(?:hr\/)?journal\/article\.html\?id=[0-9a-f-]{36}$/i.test(u) ? u : null;
  }
  function publicImage(u){
    try{
      const x=new URL(String(u||''),location.origin);
      if(x.protocol!=='https:')return null;
      if(x.hostname==='pdyngeaykfpybeafjtpw.supabase.co' &&
         /^\/storage\/v1\/object\/public\/journal-published\/[a-z0-9/_\-.]+$/i.test(x.pathname))
        return x.href;
      // Original public images from the main MOVE&TRY site.
      if(x.origin===location.origin && x.pathname.startsWith('/images/'))return x.href;
      return null;
    }catch(_){return null;}
  }
  function card(a){
    if(!a || !categories[lang][a.category])return null;
    const href=internalUrl(lang==='hr'?a.hrUrl:a.enUrl);
    const title=lang==='hr'?a.titleHr:a.titleEn;
    const summary=lang==='hr'?a.excerptHr:a.excerptEn;
    if(!href||!title||!summary)return null;
    const node=el('a','journal-post');
    node.href=href;
    node.dataset.category=a.category;
    node.dataset.journalGenerated='true';
    node.hidden=true;
    if(a.columnSlug && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(a.columnSlug))
      node.dataset.column=a.columnSlug;
    if(a.publishedAt && !Number.isNaN(Date.parse(a.publishedAt)))
      node.dataset.publishAt=a.publishedAt;
    const cover=publicImage(a.cover);
    if(cover){
      const photo=el('img','journal-post-image');
      photo.src=cover;photo.alt=String(title);photo.loading='lazy';
      node.append(photo);
    }
    const copy=el('div','journal-post-copy');
    const dt=a.publishedAt ? new Date(a.publishedAt).toLocaleDateString(lang==='hr'?'hr-HR':'en-GB') : '';
    copy.append(el('span','journal-post-category',categories[lang][a.category]+' · '+dt));
    copy.append(el('h3','journal-post-title',title));
    copy.append(el('p','journal-post-description',summary));
    copy.append(el('span','journal-post-author',a.byline||'MOVE&TRY Editorial'));
    node.append(copy);
    return node;
  }
  async function load(){
    try{
      const res=await fetch(API,{
        method:'POST',
        headers:{'Content-Type':'application/json','apikey':KEY},
        body:'{}',
        cache:'no-store'
      });
      if(!res.ok)throw new Error('Feed '+res.status);
      const payload=await res.json();
      const items=Array.isArray(payload?.items)?payload.items:[];
      const columns=Array.isArray(payload?.columns)?payload.columns:[];
      const known=new Set([...root.querySelectorAll('.journal-post:not([data-journal-generated])')]
        .map(x=>x.getAttribute('href')));
      root.querySelectorAll('[data-journal-generated]').forEach(x=>x.remove());
      const fragment=document.createDocumentFragment();
      for(const a of items){
        const node=card(a);
        if(node&&!known.has(node.getAttribute('href')))fragment.append(node);
      }
      root.prepend(fragment);
      if(nav){
        nav.querySelectorAll('[data-journal-generated]').forEach(x=>x.remove());
        const existing=new Map([...nav.querySelectorAll('[data-column]')]
          .map(button=>[button.dataset.column,button]));
        for(const col of columns){
          if(col?.listed!==true||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(col.slug||''))continue;
          const existingButton=existing.get(col.slug);
          const localized=lang==='en' && Object.hasOwn(col,'titleEn');
          const title=localized ? col.titleEn?.trim() : col.title;
          const description=localized ? col.descriptionEn : col.description;
          if(existingButton){
            if(!localized)continue;
            if(title){
              existingButton.textContent=title;
              added.names[col.slug]=title;
            }
            if(title||description){
              added.profiles[col.slug]={
                ...(title ? {title} : {}),
                ...(description ? {paragraphs:[description]} : {})
              };
            }
            continue;
          }
          if(localized&&!title)continue;
          const name=title||col.byline||col.slug;
          added.names[col.slug]=name;
          added.profiles[col.slug]={title:name,paragraphs:description?[description]:[]};
          const button=el('button','journal-column',name);
          button.type='button';button.dataset.column=col.slug;
          button.dataset.journalGenerated='true';
          button.setAttribute('aria-pressed','false');
          nav.append(button);
        }
      }
      window.MoveTryJournalAddedColumnNames=added.names;
      window.MoveTryJournalAddedColumnProfiles=added.profiles;
      window.dispatchEvent(new Event('move-try-journal-feed-ready'));
    }catch(error){
      // Existing manually published articles stay fully accessible if the
      // public feed is offline or migrations have not yet been applied.
      console.warn('The Journal: dynamic feed unavailable; keeping static posts',error);
    }
  }
  void load();
})();
