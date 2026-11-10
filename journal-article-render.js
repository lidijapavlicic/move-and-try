/*
 * MOVE&TRY · The Journal — public article view (HR / EN).
 * All text is rendered with textContent. Markdown is parsed only into
 * allow-listed DOM nodes; no arbitrary HTML or private draft media.
 */
(() => {
  'use strict';
  const base='https://pdyngeaykfpybeafjtpw.supabase.co';
  const key='sb_publishable_liv_WfA9YbjizQvpOrB68w_mkVgR_WK';
  const lang=document.documentElement.lang==='hr'?'hr':'en';
  const messages=lang==='hr'
    ? {notFound:'Članak nije objavljen ili nije dostupan.',error:'Članak trenutačno nije dostupan.',back:'Povratak na The Journal',category:{editorial:'UREDNIČKI TEKSTOVI',personal:'KOLUMNE',guest:'GOSTUJUĆE PRIČE',news:'NOVOSTI',inspiration:'INSPIRACIJA'}}
    : {notFound:'This article is not published or available.',error:'The article is temporarily unavailable.',back:'Return to The Journal',category:{editorial:'EDITORIAL',personal:'COLUMNS',guest:'GUEST STORIES',news:'NEWS',inspiration:'INSPIRATION'}};
  const $=id=>document.getElementById(id);
  const imgPrefix=base+'/storage/v1/object/public/journal-published/';
  function safeUrl(url,forImage=false){
    if(typeof url!=='string')return null;
    try{
      const parsed=new URL(url,location.origin);
      if(parsed.protocol!=='https:' && parsed.origin!==location.origin)return null;
      if(forImage) {
        if(parsed.href.startsWith(imgPrefix) && /^[a-z0-9/_\-.]+$/i.test(parsed.pathname.slice(imgPrefix.length-base.length)))return parsed.href;
        if(parsed.origin===location.origin && parsed.pathname.startsWith('/images/'))return parsed.href;
        return null;
      }
      if(parsed.protocol==='https:' || parsed.origin===location.origin)return parsed.href;
    }catch(_) {}
    return null;
  }
  function inline(node,str){
    const text=String(str||'');
    const pattern=/(\*\*[^*\n]+\*\*|\*[^*\n]+\*|\[[^\]\n]+\]\([^) \n]+\))/g;
    let from=0;
    for(const hit of text.matchAll(pattern)){
      if(hit.index>from)node.append(document.createTextNode(text.slice(from,hit.index)));
      const token=hit[0];
      if(token.startsWith('**')){const strong=document.createElement('strong');strong.textContent=token.slice(2,-2);node.append(strong);}
      else if(token.startsWith('*')){const em=document.createElement('em');em.textContent=token.slice(1,-1);node.append(em);}
      else{
        const parts=/^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
        const url=safeUrl(parts?.[2]);
        if(url){const a=document.createElement('a');a.href=url;a.textContent=parts[1];a.rel='noopener noreferrer';node.append(a);}
        else node.append(document.createTextNode(token));
      }
      from=hit.index+token.length;
    }
    node.append(document.createTextNode(text.slice(from)));
  }
  function text(tag,value,cls){
    const el=document.createElement(tag);
    if(cls)el.className=cls;
    el.textContent=String(value||'');
    return el;
  }
  function render(container,value){
    const blocks=String(value||'').replace(/\r\n?/g,'\n').split(/\n\s*\n/);
    const image=/^!\[([^\]\r\n]*)\]\(([^)\r\n]+)\)(?:\{size=(small|medium|large)\})?$/i;
    container.replaceChildren();
    for(const raw of blocks){
      const block=raw.trim();
      if(!block)continue;
      const imageMatch=image.exec(block);
      if(imageMatch){
        const url=safeUrl(imageMatch[2],true);
        if(!url)continue;
        const fig=document.createElement('figure');
        const imageNode=document.createElement('img');
        imageNode.src=url;imageNode.alt=imageMatch[1];imageNode.loading='lazy';
        imageNode.style.width=imageMatch[3]==='small'?'42%':imageMatch[3]==='large'?'100%':'72%';
        imageNode.style.maxWidth='100%';
        fig.append(imageNode);
        if(imageMatch[1])fig.append(text('figcaption',imageMatch[1]));
        container.append(fig);
        continue;
      }
      if(block==='---'){container.append(document.createElement('hr'));continue;}
      if(block.startsWith('## ')){const h=document.createElement('h2');inline(h,block.slice(3));container.append(h);continue;}
      if(block.startsWith('### ')){const h=document.createElement('h3');inline(h,block.slice(4));container.append(h);continue;}
      if(block.startsWith('> ')){
        const quote=document.createElement('p');quote.className='journal-article-highlight';
        inline(quote,block.split('\n').map(line=>line.replace(/^>\s?/,'')).join(' '));
        container.append(quote);continue;
      }
      const lines=block.split('\n');
      if(lines.every(x=>/^\s*(?:[-*]|\d+\.)\s+/.test(x))){
        const ordered=/^\s*\d+\./.test(lines[0]);
        const list=document.createElement(ordered?'ol':'ul');
        for(const line of lines){const li=document.createElement('li');inline(li,line.replace(/^\s*(?:[-*]|\d+\.)\s+/,''));list.append(li);}
        container.append(list);continue;
      }
      const p=document.createElement('p');
      lines.forEach((line,i)=>{if(i)p.append(document.createElement('br'));inline(p,line);});
      container.append(p);
    }
  }
  async function init(){
    const id=new URLSearchParams(location.search).get('id');
    if(!id||!/^[0-9a-f-]{36}$/i.test(id)){
      $('journal-public-error').textContent=messages.notFound;
      return;
    }
    try{
      const res=await fetch(base+'/rest/v1/rpc/journal_public_article',{
        method:'POST',headers:{'apikey':key,
          'Content-Type':'application/json'},body:JSON.stringify({p_id:id}),
        cache:'no-store'
      });
      if(!res.ok)throw Error(String(res.status));
      const a=await res.json();
      if(!a){$('journal-public-error').textContent=messages.notFound;return;}
      const title=lang==='hr'?a.titleHr:a.titleEn;
      const excerpt=lang==='hr'?a.excerptHr:a.excerptEn;
      const content=lang==='hr'?a.contentHr:a.contentEn;
      if(!title||!content){$('journal-public-error').textContent=messages.notFound;return;}
      document.title=title+' | The Journal | MOVE&TRY';
      $('journal-public-heading').textContent=title;
      $('journal-public-intro').textContent=excerpt||'';
      const date=a.publishedAt
        ? new Date(a.publishedAt).toLocaleDateString(lang==='hr'?'hr-HR':'en-GB')
        : '';
      $('journal-public-meta').textContent=(messages.category[a.category]||'THE JOURNAL')+' · '+date+' · '+(a.byline||'MOVE&TRY Editorial');
      $('journal-public-author').textContent=a.byline||'MOVE&TRY Editorial';
      render($('journal-public-content'),content);
      const imgUrl=safeUrl(a.cover,true);
      const hero=$('journal-public-cover');
      if(imgUrl){hero.src=imgUrl;hero.alt=title;hero.closest('figure').hidden=false;}
      else hero.closest('figure').hidden=true;
      const translated=lang==='hr'?'/journal/article.html?id='+id:'/hr/journal/article.html?id='+id;
      for(const anchor of document.querySelectorAll('[data-journal-translation]'))anchor.href=translated;
      const meta=document.querySelector('meta[name="description"]');
      if(meta)meta.setAttribute('content',excerpt||title);
      $('journal-public-article').hidden=false;
      $('journal-public-error').hidden=true;
    }catch(e){
      $('journal-public-error').textContent=messages.error;
      console.warn('Public article load failed',e);
    }
  }
  void init();
})();
