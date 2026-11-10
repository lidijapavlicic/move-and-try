/*
 * MOVE&TRY The Journal — draft image handling.
 * Files stay in private Supabase Storage. Article text stores durable storage
 * identifiers, NEVER expiring signed download URLs.
 * Publication must later create its separate public image assets.
 */
(() => {
  'use strict';
  if (window.MoveTryJournalMedia) return;
  const bridge = window.MoveTryJournalDraftBridge;
  if (!bridge?.db) return;

  const BUCKET = 'journal-draft-images';
  const REF_RE = /^mtmedia:([0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:jpg|png|webp))$/i;
  const SIZE = new Set(['small','medium','large']);
  const CACHE_MS = 15 * 60 * 1000;
  const urls = new Map();
  const $ = id => document.getElementById(id);

  function pathOf(ref) {
    const match = REF_RE.exec(String(ref||'').trim());
    return match ? match[1] : null;
  }
  function validHttps(ref) {
    try {
      const url = new URL(ref);
      return url.protocol === 'https:' ? url.href : null;
    } catch (_) { return null; }
  }
  async function signed(ref) {
    const path = pathOf(ref);
    if (!path) return validHttps(ref);
    const cached = urls.get(path);
    if (cached && cached.until > Date.now()) return cached.url;
    const {data,error} = await bridge.db.storage.from(BUCKET)
      .createSignedUrl(path,60*60);
    if (error || !data?.signedUrl) throw error || Error('Fotografija nije dostupna.');
    urls.set(path,{url:data.signedUrl,until:Date.now()+CACHE_MS});
    return data.signedUrl;
  }
  async function setImage(img,ref) {
    if (!img) return;
    img.hidden=true;
    img.removeAttribute('src');
    const requested=String(ref||'');
    if (!requested) return;
    try {
      const url=await signed(requested);
      if (String(img.dataset.mtMediaRequested || '') !== requested) return;
      if (!url) throw Error('Poveznica nije valjana.');
      img.src=url;
      img.hidden=false;
    } catch (_) {
      img.hidden=true;
      img.dispatchEvent(new Event('mt-media-error'));
    }
  }
  async function hydrate(root) {
    if (!root) return;
    const images = root.querySelectorAll('figure[data-mt-media-path] img');
    for(const img of images) {
      const fig=img.closest('figure');
      if (!fig) continue;
      const ref='mtmedia:'+fig.dataset.mtMediaPath;
      img.dataset.mtMediaRequested=ref;
      void setImage(img,ref);
    }
  }

  async function upload(file) {
    const owner=bridge.getContext()?.ownerId;
    if (!owner) throw Error('Prijavi se i otvori članak prije učitavanja fotografije.');
    if (!file || !['image/jpeg','image/png','image/webp'].includes(file.type))
      throw Error('Odaberi JPG, PNG ili WebP fotografiju.');
    if (file.size > 10*1024*1024)
      throw Error('Fotografija je veća od 10 MB.');
    if (file.size === 0) throw Error('Fotografija je prazna.');
    const ext = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : 'webp';
    const path=owner+'/'+crypto.randomUUID()+'.'+ext;
    const {error}=await bridge.db.storage.from(BUCKET).upload(path,file,{
      cacheControl:'3600',contentType:file.type,upsert:false
    });
    if (error) throw error;
    return 'mtmedia:'+path;
  }
  function filePicker() {
    const input=document.createElement('input');
    input.type='file';
    input.accept='image/jpeg,image/png,image/webp';
    input.hidden=true;
    document.body.append(input);
    return new Promise(resolve=>{
      let finished=false;
      const done=file=>{if(finished)return;finished=true;input.remove();resolve(file||null);};
      input.addEventListener('change',()=>done(input.files?.[0]));
      input.addEventListener('cancel',()=>done(null));
      input.click();
      // Some mobile browsers don't emit cancel. The input remains harmless
      // until a selection is made; remove after focus returns without a file.
      window.addEventListener('focus',()=>{
        setTimeout(()=>{if(!input.files?.length)done(null);},1000);
      },{once:true});
    });
  }
  function statusMessage(node,message,error=false) {
    if(!node)return;
    node.textContent=message;
    node.classList.toggle('error',error);
  }

  function buildCoverUi() {
    const field=$('article-cover');
    if(!field) return;
    field.type='text'; // A private mtmedia: reference is not a standard URL.
    field.placeholder='https://... ili učitaj fotografiju';
    const area=document.createElement('div');
    area.className='mt-media-cover-controls';
    const button=document.createElement('button');
    button.type='button';
    button.className='btn secondary';
    button.textContent='UČITAJ NASLOVNU FOTOGRAFIJU';
    const img=document.createElement('img');
    img.className='mt-media-cover-thumb';
    img.alt='Pregled naslovne fotografije';
    img.hidden=true;
    const note=document.createElement('p');
    note.className='mt-media-note';
    note.textContent='JPG, PNG ili WebP, najviše 10 MB. Naslovna fotografija ostaje privatna do objave.';
    area.append(button,img,note);
    field.insertAdjacentElement('afterend',area);

    async function refresh() {
      const ref=field.value.trim();
      img.dataset.mtMediaRequested=ref;
      if(!ref){img.hidden=true;img.removeAttribute('src');return;}
      try {
        await setImage(img,ref);
      } catch (_) {img.hidden=true;}
    }
    button.addEventListener('click',async()=>{
      const file=await filePicker();
      if(!file)return;
      button.disabled=true;
      statusMessage(note,'Učitavanje naslovne fotografije...');
      try {
        const ctx=bridge.getContext();
        const ref=await upload(file);
        if(!ctx || bridge.getContext()?.ownerId!==ctx.ownerId ||
           bridge.getContext()?.articleId!==ctx.articleId) {
          statusMessage(note,'Fotografija je učitana, ali članak se promijenio. Vrati se na članak prije ponovnog pokušaja.',true);
          return;
        }
        field.value=ref;
        field.dispatchEvent(new Event('input',{bubbles:true}));
        await refresh();
        statusMessage(note,'Naslovna fotografija je učitana. Spremi članak kada završiš.');
      }catch(error){statusMessage(note,'Učitavanje nije uspjelo: '+(error.message||error),true);}
      finally{button.disabled=false;}
    });
    field.addEventListener('change',refresh);
    $('editor-panel')?.addEventListener('journal-editor-open',refresh);
    $('editor-panel')?.addEventListener('journal-editor-restore',refresh);
  }

  function buildInlineUi() {
    const surfaces=document.querySelectorAll('.mt-rich-wrapper');
    for(const wrapper of surfaces){
      const bar=wrapper.querySelector('.mt-rich-toolbar');
      const canvas=wrapper.querySelector('.mt-rich-canvas');
      if(!bar||!canvas)continue;
      const button=document.createElement('button');
      button.type='button';
      button.textContent='FOTOGRAFIJA';
      button.className='mt-rich-photo-button';
      button.title='Umetni fotografiju na mjesto kursora';
      const preview=bar.querySelector('.mt-rich-preview-button');
      bar.insertBefore(button,preview);
      const note=document.createElement('p');
      note.className='mt-media-note';
      note.hidden=true;
      bar.insertAdjacentElement('afterend',note);
      let savedRange=null;
      const remember=()=>{
        const sel=window.getSelection();
        if(sel?.rangeCount && canvas.contains(sel.anchorNode)){
          savedRange=sel.getRangeAt(0).cloneRange();
        }
      };
      canvas.addEventListener('keyup',remember);
      canvas.addEventListener('mouseup',remember);
      canvas.addEventListener('touchend',remember,{passive:true});
      button.addEventListener('click',async()=>{
        remember();
        const ctx=bridge.getContext();
        if(!ctx)return;
        const file=await filePicker();
        if(!file)return;
        button.disabled=true;
        note.hidden=false;
        statusMessage(note,'Učitavanje fotografije...');
        try {
          const ref=await upload(file);
          if(bridge.getContext()?.ownerId!==ctx.ownerId ||
             bridge.getContext()?.articleId!==ctx.articleId)
            throw Error('Članak je promijenjen tijekom učitavanja.');
          const caption=prompt('Opis fotografije (nije obavezan):','') ?? '';
          const size=prompt('Veličina: mala / srednja / velika','srednja');
          const sizes={mala:'small',srednja:'medium',velika:'large'};
          const chosen=sizes[String(size||'srednja').trim().toLowerCase()]||'medium';
          const fig=document.createElement('figure');
          fig.dataset.mtMediaPath=pathOf(ref);
          fig.dataset.mtMediaSize=chosen;
          fig.contentEditable='false';
          const img=document.createElement('img');
          img.alt=caption;
          img.loading='lazy';
          fig.append(img);
          if(caption){
            const c=document.createElement('figcaption');
            c.textContent=caption;
            fig.append(c);
          }
          const paragraph=document.createElement('p');
          paragraph.append(document.createElement('br'));
          const rootBlock=savedRange?.startContainer &&
            canvas.contains(savedRange.startContainer)
            ? (savedRange.startContainer.nodeType===Node.ELEMENT_NODE
                ? savedRange.startContainer : savedRange.startContainer.parentElement)
            : null;
          let block=rootBlock;
          while(block?.parentElement && block.parentElement!==canvas)block=block.parentElement;
          if(block?.parentElement===canvas)block.after(fig,paragraph);
          else canvas.append(fig,paragraph);
          img.dataset.mtMediaRequested=ref;
          void setImage(img,ref);
          canvas.dispatchEvent(new Event('input',{bubbles:true}));
          statusMessage(note,'Fotografija je umetnuta. Klikni na nju za promjenu veličine ili uklanjanje.');
        }catch(error){statusMessage(note,'Fotografija nije umetnuta: '+(error.message||error),true);}
        finally{button.disabled=false;}
      });
      canvas.addEventListener('click',event=>{
        const fig=event.target.closest?.('figure[data-mt-media-path]');
        if(!fig||!canvas.contains(fig))return;
        const choice=prompt('Fotografija: mala / srednja / velika / ukloni',fig.dataset.mtMediaSize==='small'?'mala':fig.dataset.mtMediaSize==='large'?'velika':'srednja');
        if(choice===null)return;
        const normalized=choice.trim().toLowerCase();
        if(normalized==='ukloni'){
          if(confirm('Ukloniti fotografiju iz teksta? Izvorna datoteka ostaje sačuvana.'))fig.remove();
        }else{
          const sizes={mala:'small',srednja:'medium',velika:'large'};
          if(!sizes[normalized]){alert('Odaberi: mala, srednja, velika ili ukloni.');return;}
          fig.dataset.mtMediaSize=sizes[normalized];
        }
        canvas.dispatchEvent(new Event('input',{bubbles:true}));
      });
    }
  }
  function initialize() {
    buildCoverUi();
    buildInlineUi();
  }
  document.addEventListener('DOMContentLoaded',initialize,{once:true});
  window.MoveTryJournalMedia={upload,hydrate,setImage,pathOf,isMediaRef:ref=>!!pathOf(ref),signed};
})();
