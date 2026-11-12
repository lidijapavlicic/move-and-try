/* MOVE&TRY The Journal — optional end blocks, schema-free v1.
 * These controls serialize to a clearly delimited suffix in the existing
 * article body. No schema or article permissions are changed.
 * Only the generated public article and preview render these suffixes.
 */
(function(){
  'use strict';
  if(window.MoveTryJournalEndBlocks)return;
  const marker=/\n*<!--MOVE_TRY_JOURNAL_END_V1:([^<>]*)-->\s*$/;
  const blank=()=>({cta:false,links:[],sources:[]});
  const $=id=>document.getElementById(id);
  let data=blank(),admin=false,root=null;

  function clean(input){
    const x=input&&typeof input==='object'?input:{};
    return {
      cta:x.cta===true,
      links:(Array.isArray(x.links)?x.links:[]).slice(0,8)
        .map(i=>({label:String(i?.label||'').slice(0,140).trim(),url:String(i?.url||'').slice(0,1500).trim()}))
        .filter(i=>i.label&&safeUrl(i.url)),
      sources:(Array.isArray(x.sources)?x.sources:[]).slice(0,30)
        .map(i=>({citation:String(i?.citation||'').slice(0,1000).trim(),url:String(i?.url||'').slice(0,1500).trim()}))
        .filter(i=>i.citation&&(!i.url||safeUrl(i.url)))
    };
  }
  function safeUrl(raw){
    try {
      const u=new URL(String(raw||''),location.origin);
      if(u.protocol==='https:' || (u.protocol==='http:'&&u.origin===location.origin))
        return u.href;
    }catch(_){}
    return null;
  }
  function split(value){
    const source=String(value||'');
    const m=marker.exec(source);
    if(!m)return {body:source,data:blank()};
    try{
      const payload=JSON.parse(decodeURIComponent(m[1]));
      if(!payload||payload.version!==1)throw Error('Version');
      return {body:source.slice(0,m.index).trimEnd(),data:clean(payload)};
    }catch(_){
      // Corrupt metadata must not be silently lost or rewritten.
      return {body:source,data:blank(),invalid:true};
    }
  }
  function append(body){
    const parsed=split(body);
    if(parsed.invalid)return String(body||'');
    const d=read();
    if(!d.cta&&!d.links.length&&!d.sources.length)return parsed.body;
    return parsed.body.trimEnd()+'\n\n<!--MOVE_TRY_JOURNAL_END_V1:'+
      encodeURIComponent(JSON.stringify({version:1,...d}))+'-->';
  }
  function elt(tag,cls,txt){
    const e=document.createElement(tag);
    if(cls)e.className=cls;
    if(txt!=null)e.textContent=txt;
    return e;
  }
  function button(txt,click){
    const b=elt('button','btn secondary small-btn',txt);
    b.type='button';b.addEventListener('click',click);return b;
  }
  function field(placeholder,value){
    const i=document.createElement('input');
    i.type='text';i.placeholder=placeholder;i.value=value||'';
    i.maxLength=1500;return i;
  }
  function rows(kind,values){
    const host=$(kind==='links'?'mt-end-links':'mt-end-sources');
    if(!host)return;
    host.replaceChildren();
    values.forEach(x=>addRow(kind,x));
  }
  function addRow(kind,initial={}){
    const host=$(kind==='links'?'mt-end-links':'mt-end-sources');
    if(!host||host.children.length>=(kind==='links'?8:30))return;
    const row=elt('div','mt-end-input-row');
    const title=field(kind==='links'?'Tekst gumba':'Bibliografski navod / izvor',
      kind==='links'?initial.label:initial.citation);
    title.dataset.entry='title';
    const url=field('https://... (za izvore neobavezno)',initial.url);
    url.dataset.entry='url';
    const remove=button('UKLONI',()=>row.remove());
    remove.setAttribute('aria-label','Ukloni redak');
    row.append(title,url,remove);host.append(row);
  }
  function read(){
    if(!root)return clean(data);
    function collect(kind){
      return [...$(kind==='links'?'mt-end-links':'mt-end-sources').children].map(row=>{
        const title=row.querySelector('[data-entry="title"]')?.value||'';
        const url=row.querySelector('[data-entry="url"]')?.value||'';
        return kind==='links'?{label:title,url}:{citation:title,url};
      });
    }
    return clean({cta:admin?$('mt-end-cta').checked:data.cta,
      links:admin?collect('links'):data.links,sources:collect('sources')});
  }
  function validate() {
    if(!root)return '';
    const checks=[
      ['mt-end-links',true,'povezanog sadržaja'],
      ['mt-end-sources',false,'izvora']
    ];
    for(const [id,requiresUrl,label] of checks){
      for(const row of $(id).children){
        const title=row.querySelector('[data-entry="title"]')?.value.trim() || '';
        const url=row.querySelector('[data-entry="url"]')?.value.trim() || '';
        if(!title&&!url)continue;
        if(!title)return 'Dopuni naziv '+label+'.';
        if(requiresUrl&&!url)return 'Dopuni poveznicu '+label+'.';
        if(url&&!safeUrl(url))return 'Provjeri HTTPS poveznicu '+label+'.';
      }
    }
    return '';
  }
  function load(value,isAdmin){
    const parsed=split(value);
    data=parsed.data;
    admin=!!isAdmin;
    if(root){
      $('mt-end-cta').checked=data.cta;
      $('mt-end-editor-controls').hidden=!admin;
      rows('links',data.links);rows('sources',data.sources);
      $('mt-end-warning').hidden=!parsed.invalid;
    }
    const body=$('article-content');
    if(body)body.value=parsed.body;
  }
  function init(){
    const form=$('article-form');
    const cover=$('article-cover');
    if(!form||!cover||root)return;
    root=elt('section','mt-end-controls');
    root.id='mt-end-blocks';
    root.append(elt('p','eyebrow','ZAVRŠNI BLOKOVI ČLANKA'));
    root.append(elt('p','muted small','Neobavezno. Koristimo postojeće blokove i izgled The Journala.'));
    const warning=elt('p','message','Postojeći završni podaci nisu čitljivi. Nisu automatski promijenjeni.');
    warning.id='mt-end-warning';warning.hidden=true;root.append(warning);
    const controls=elt('div','mt-end-editor-controls');controls.id='mt-end-editor-controls';
    const ctaLabel=elt('label','mt-end-cta-label');
    const cta=document.createElement('input');
    cta.type='checkbox';cta.id='mt-end-cta';
    ctaLabel.append(cta,document.createTextNode(' Prikaži postojeći poziv „PIŠI ZA THE JOURNAL”'));
    controls.append(ctaLabel,elt('h3','','Povezani sadržaji'));
    const linkRows=elt('div','mt-end-rows');linkRows.id='mt-end-links';
    controls.append(linkRows,button('+ DODAJ POVEZNICU',()=>addRow('links')));
    root.append(controls);
    root.append(elt('h3','','Izvori i dodatno čitanje'));
    const sourceRows=elt('div','mt-end-rows');sourceRows.id='mt-end-sources';
    root.append(sourceRows,button('+ DODAJ IZVOR',()=>addRow('sources')));
    cover.closest('.field').before(root);
    load($('article-content').value,false);
  }
  function renderBody(host,raw,lang='hr'){
    if(!host||lang!=='hr')return;
    const d=clean(raw);
    if(d.links.length){
      const links=elt('div','journal-article-links');
      for(const item of d.links){
        const link=elt('a','journal-article-link');
        link.href=safeUrl(item.url);
        link.target='_blank';link.rel='noopener noreferrer';
        link.append(elt('span','',item.label),elt('span','','→'));
        links.append(link);
      }
      host.append(links);
    }
    if(d.sources.length){
      const sources=elt('section','article-sources');
      sources.append(elt('p','article-sources-label','ISTRAŽIVANJA · DODATNO ČITANJE'));
      sources.append(elt('h2','','Izvori i dodatno čitanje'));
      const list=document.createElement('ol');
      for(const item of d.sources){
        const li=document.createElement('li');
        li.append(document.createTextNode(item.citation));
        if(item.url){
          const a=elt('a','',' Poveznica');
          a.href=safeUrl(item.url);a.target='_blank';a.rel='noopener noreferrer';
          li.append(a);
        }
        list.append(li);
      }
      sources.append(list);host.append(sources);
    }
  }
  function renderCTA(host,raw,lang='hr'){
    host.querySelectorAll(':scope > .mt-end-optional-cta').forEach(n=>n.remove());
    if(lang!=='hr'||!clean(raw).cta)return;
    const section=elt('section','article-end mt-end-optional-cta');
    const inner=elt('div','article-end-inner');
    inner.append(elt('p','article-end-label','BUDI DIO THE JOURNALA'));
    inner.append(elt('h2','article-end-title','Imaš i ti priču koju vrijedi podijeliti?'));
    inner.append(elt('p','article-end-text','Iskustvo, ideju ili drukčiju perspektivu? Pročitaj naše smjernice i javi nam se.'));
    const a=elt('a','article-end-link','PIŠI ZA THE JOURNAL →');
    a.href='/hr/write-for-the-journal.html';inner.append(a);
    section.append(inner);host.append(section);
  }
  window.MoveTryJournalEndBlocks={split,append,read,load,validate,renderBody,renderCTA,init};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();