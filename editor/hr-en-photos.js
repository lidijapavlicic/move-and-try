/*
 * MOVE&TRY · The Journal — HR -> EN photo layout transfer
 * The photo identifier points to one existing Supabase object.
 * Only copies photo Markdown references, position, size, and HR caption text
 * as an editable placeholder. No new files are uploaded.
 * Never overwrites existing EN prose. A second import is idempotent.
 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const REF = /^!\[([^\]\r\n]*)\]\((mtmedia:[0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:jpg|png|webp))\)(?:\{size=(small|medium|large)\})?$/i;
  const IMAGE = /^!\[([^\]\r\n]*)\]\(([^)\r\n]+)\)(?:\{size=(small|medium|large)\})?$/i;
  function segments(text) {
    return String(text || '').replace(/\r\n?/g, '\n').trim()
      .split(/\n\s*\n/).map(x => x.trim()).filter(Boolean);
  }
  function imageOf(block) {
    const match = IMAGE.exec(block);
    return match ? {ref:match[2],size:match[3] || 'medium',block} : null;
  }
  function validRef(img) {
    return !!img && (REF.test(img.block) || /^https:\/\//i.test(img.ref));
  }
  function copyLayout(hr,en) {
    const source = segments(hr);
    const target = segments(en);
    const sourceImages=source.map((block,index)=>({img:imageOf(block),index}))
      .filter(x=>validRef(x.img));
    if(!sourceImages.length) return {changed:false,text:en,inserted:0,reason:'missing'};
    // If EN is blank, HR provides the exact layout as a translation template.
    if(!target.length) return {changed:true,text:source.join('\n\n'),inserted:sourceImages.length,template:true};
    // Do not duplicate photos already placed in English; preserve EN captions and sizes.
    const seen=new Set(target.map(imageOf).filter(validRef).map(img=>img.ref));
    const hrProseCount=source.filter(block=>!validRef(imageOf(block))).length;
    const enProse=target.filter(block=>!validRef(imageOf(block)));
    const additions=new Map();
    let passed=0;
    let inserted=0;
    for(const item of source.map(block=>({block,img:imageOf(block)}))) {
      if(!validRef(item.img)) {passed++;continue;}
      if(seen.has(item.img.ref))continue;
      seen.add(item.img.ref);
      // The image follows the same relative prose position when translated
      // paragraphs do not correspond one-to-one to Croatian paragraphs.
      const slot=hrProseCount
        ? Math.min(enProse.length,Math.round(passed/hrProseCount*enProse.length))
        : enProse.length;
      if(!additions.has(slot))additions.set(slot,[]);
      additions.get(slot).push(item.block);
      inserted++;
    }
    if(!inserted) return {changed:false,text:en,inserted:0,reason:'already'};
    // Retain every existing EN block in order and insert new images immediately
    // after the calculated EN prose block, not at an arbitrary document end.
    let enPassed=0;
    const output=[];
    if(additions.has(0))output.push(...additions.get(0));
    for(const block of target){
      output.push(block);
      if(!validRef(imageOf(block))){
        enPassed++;
        if(additions.has(enPassed))output.push(...additions.get(enPassed));
      }
    }
    return {changed:true,text:output.join('\n\n'),inserted,template:false};
  }
  function initialize() {
    const btn=$('copy-hr-photos-to-en');
    const message=$('copy-hr-photos-message');
    if(!btn || !message)return;
    btn.addEventListener('click',()=>{
      const rich=window.MoveTryJournalRichEditor;
      rich?.syncAll?.();
      const hr=$('article-content');
      const en=$('article-content-en');
      if(!hr || !en)return;
      const result=copyLayout(hr.value,en.value);
      if(!result.changed){
        message.textContent=result.reason==='missing'
          ? 'HR verzija nema fotografija za preuzimanje.'
          : 'Sve fotografije iz HR verzije već postoje u EN verziji.';
        return;
      }
      const question=result.template
        ? 'EN tekst je prazan. Prenijeti cijeli hrvatski raspored kao predložak za prijevod, zajedno s fotografijama?'
        : 'Dodati '+result.inserted+' fotografija iz HR teksta na odgovarajuća mjesta u EN tekstu? Postojeći engleski tekst neće se mijenjati.';
      if(!confirm(question))return;
      en.value=result.text;
      en.dispatchEvent(new Event('input',{bubbles:true}));
      rich?.reloadField?.('article-content-en');
      message.textContent=result.template
        ? 'HR raspored je prenesen. Prevedi tekst i opise fotografija na engleski te spremi izmjene.'
        : 'Fotografije, redoslijed, veličine i pozicije preneseni su u EN tekst. Provjeri mjesta i prevedi opise.';
    });
  }
  window.MoveTryJournalPhotoTransfer={copyLayout};
  document.addEventListener('DOMContentLoaded',initialize,{once:true});
})();
