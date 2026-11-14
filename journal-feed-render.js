/*
 * MOVE&TRY · The Journal — public-only feed.
 * Supabase RPC returns published/scheduled-elapsed articles WITH safe public
 * media snapshots. Existing manually authored cards remain untouched.
 */
(() => {
  'use strict';
  const API='https://pdyngeaykfpybeafjtpw.supabase.co/rest/v1/rpc/journal_public_articles_feed';
  const KEY='sb_publishable_liv_WfA9YbjizQvpOrB68w_mkVgR_WK';
  const bylines=window.MoveTryJournalByline;
  const categories={
    hr:{editorial:'UREDNIČKI TEKSTOVI',personal:'KOLUMNE',guest:'GOSTUJUĆE PRIČE',news:'NOVOSTI',inspiration:'INSPIRACIJA'},
    en:{editorial:'EDITORIAL',personal:'COLUMNS',guest:'GUEST STORIES',news:'NEWS',inspiration:'INSPIRATION'}
  };
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
  function localizePost(a,lang,column){
    if(!a || !Object.hasOwn(categories[lang],a.category))return null;
    const href=internalUrl(lang==='hr'?a.hrUrl:a.enUrl);
    const title=lang==='hr'?a.titleHr:a.titleEn;
    const description=lang==='hr'?a.excerptHr:a.excerptEn;
    if(!href||!title||!description)return null;
    const publishedAt=Number.isFinite(Date.parse(a.publishedAt))?a.publishedAt:'';
    const isColumn=a.category==='personal';
    const date=isColumn&&bylines
      ? bylines.formatPublicationDate(publishedAt,lang)
      : publishedAt ? new Date(publishedAt).toLocaleDateString(lang==='hr'?'hr-HR':'en-GB') : '';
    const author=isColumn&&bylines
      ? bylines.columnCard(a.byline,lang==='hr'?column?.title:column?.titleEn)
      : a.byline||'MOVE&TRY Editorial';
    return {
      url:href,
      title,
      description,
      image:publicImage(a.cover),
      category:[categories[lang][a.category],date].filter(Boolean).join(' · '),
      type:a.category,
      author,
      column:/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(a.columnSlug||'')?a.columnSlug:'',
      publishedAt
    };
  }
  async function fetchFeed(signal){
    const res=await fetch(API,{
      method:'POST',
      headers:{'Content-Type':'application/json','apikey':KEY},
      body:'{}',
      cache:'no-store',
      signal
    });
    if(!res.ok)throw new Error('Feed '+res.status);
    const payload=await res.json();
    return {
      items:Array.isArray(payload?.items)?payload.items:[],
      columns:Array.isArray(payload?.columns)?payload.columns:[]
    };
  }
  window.MoveTryJournalPublicFeed={fetchFeed,localizePost};

  const root=document.getElementById('journal-posts');
  const nav=document.querySelector('#journal-column-wrap .journal-columns');
  if(!root)return;
  const lang=document.documentElement.lang==='hr'?'hr':'en';
  const added={names:{},profiles:{}};
  function card(post){
    const node=el('a','journal-post');
    node.href=post.url;
    node.dataset.category=post.type;
    node.dataset.journalGenerated='true';
    node.hidden=true;
    if(post.column)node.dataset.column=post.column;
    if(post.publishedAt)node.dataset.publishAt=post.publishedAt;
    if(post.image){
      const photo=el('img','journal-post-image');
      photo.src=post.image;photo.alt=String(post.title);photo.loading='lazy';
      node.append(photo);
    }
    const copy=el('div','journal-post-copy');
    copy.append(el('span','journal-post-category',post.category));
    copy.append(el('h3','journal-post-title',post.title));
    copy.append(el('p','journal-post-description',post.description));
    copy.append(el('span','journal-post-author',post.author));
    node.append(copy);
    return node;
  }
  async function load(){
    try{
      const {items,columns}=await fetchFeed();
      const columnsBySlug=new Map(columns.filter(column=>column?.listed===true)
        .map(column=>[column.slug,column]));
      const known=new Set([...root.querySelectorAll('.journal-post:not([data-journal-generated])')]
        .map(x=>x.getAttribute('href')));
      root.querySelectorAll('[data-journal-generated]').forEach(x=>x.remove());
      const fragment=document.createDocumentFragment();
      for(const a of items){
        const post=localizePost(a,lang,columnsBySlug.get(a?.columnSlug));
        if(post&&!known.has(post.url)){
          known.add(post.url);
          fragment.append(card(post));
        }
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
