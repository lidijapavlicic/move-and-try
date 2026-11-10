/*
 * MOVE&TRY · The Journal — publication asset preparation.
 *
 * Authenticated active administrator only; database and Storage RLS enforce
 * permissions. Private draft images are copied to permanent public media
 * BEFORE publication. On failed preparation, the draft remains approved and
 * does not appear in the public feed. No service-role key in browser.
 */
(() => {
  'use strict';
  const draftBucket='journal-draft-images';
  const publishedBucket='journal-published';
  const image=/!\[([^\]\r\n]*)\]\((mtmedia:([0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)))\)(\{size=(small|medium|large)\})?/gi;
  const ref=/^mtmedia:([0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp))$/i;
  const publicPrefix='/storage/v1/object/public/journal-published/';
  const knownProject='pdyngeaykfpybeafjtpw.supabase.co';

  function publicImageAllowed(url,db){
    if(!url)return true;
    try{
      const u=new URL(url,location.origin);
      if(u.protocol!=='https:')return false;
      if(u.hostname===knownProject &&
         u.pathname.startsWith(publicPrefix) &&
         /^[0-9a-f-]+\/[0-9a-f-]+\/[0-9a-f-]+\.(jpg|png|webp)$/i.test(u.pathname.slice(publicPrefix.length))
      )return true;
      if(u.hostname==='moveandtry.com' && /^\/images\/[a-z0-9/_\-.]+$/i.test(u.pathname))return true;
    }catch(_){}
    return false;
  }

  async function prepare(db,article,columns,onProgress){
    if(!article?.id || !/^[0-9a-f-]{36}$/i.test(article.id))
      throw Error('Neispravan članak za objavu.');
    if(article.status!=='approved')
      throw Error('Samo odobren članak može se pripremiti za objavu.');
    if(!Number.isInteger(article.revision_number))
      throw Error('Nedostaje revizija članka.');
    const a=article;
    const column=a.category==='personal'
      ? columns.find(c=>c.id===a.column_id) : null;
    if(a.category==='personal' && (!column || !column.is_active))
      throw Error('Odabrana kolumna mora biti aktivna.');
    // Ask explicitly before making a previously internal column public.
    let listColumn=false;
    if(column && column.public_listing_enabled!==true){
      if(!confirm('Kolumna '+column.title+' još nije javno vidljiva. Objavom članka uključiti i njezin javni prikaz?'))
        throw Error('Objava je otkazana. Kolumna nije uključena u javni popis.');
      listColumn=true;
    }

    const mediaByRef=new Map();
    async function publishMedia(mediaRef){
      if(!mediaRef)return null;
      const value=String(mediaRef).trim();
      if(publicImageAllowed(value,db))return value;
      const match=ref.exec(value);
      if(!match)throw Error('Fotografija nije iz naše privatne ili javne pohrane: '+value.slice(0,70));
      if(mediaByRef.has(value))return mediaByRef.get(value);
      if(onProgress)onProgress('Prijenos fotografija na javnu stranicu...');
      const {data:blob,error:downloadError}=await db.storage.from(draftBucket).download(match[1]);
      if(downloadError || !blob)throw downloadError || Error('Privatna fotografija nije dostupna.');
      const ext=match[2].toLowerCase();
      const mime=ext==='jpg'?'image/jpeg':ext==='png'?'image/png':'image/webp';
      const unique=crypto.randomUUID();
      const path=a.id+'/'+crypto.randomUUID()+'/'+unique+'.'+ext;
      const {error:uploadError}=await db.storage.from(publishedBucket).upload(path,blob,{
        contentType:mime,cacheControl:'31536000',upsert:false
      });
      if(uploadError)throw uploadError;
      const {data:publicData}=db.storage.from(publishedBucket).getPublicUrl(path);
      if(!publicData?.publicUrl)throw Error('Nije moguće izraditi javnu adresu fotografije.');
      mediaByRef.set(value,publicData.publicUrl);
      return publicData.publicUrl;
    }

    async function convertBody(body){
      const original=String(body||'');
      const refs=[...original.matchAll(image)];
      for(const match of refs){
        await publishMedia(match[2]);
      }
      // Each original mtmedia reference keeps the exact original
      // caption, position and {size}, both languages share same URL.
      const output=original.replace(image,(all,caption,fullRef,unused,extension,settings)=>{
        const url=mediaByRef.get(fullRef);
        return url ? '!['+caption+']('+url+')'+(settings||'') : all;
      });
      if(/mtmedia:/i.test(output))
        throw Error('Jedna od privatnih fotografija nije prenesena.');
      return output;
    }
    const contentHr=await convertBody(a.content);
    const contentEn=await convertBody(a.content_en);
    const cover=await publishMedia(a.cover_image);
    if(onProgress)onProgress('Provjera javnih podataka...');
    const {error}=await db.rpc('journal_admin_prepare_publication',{
      p_article_id:a.id,
      p_expected_revision:a.revision_number,
      p_content_hr:contentHr,
      p_content_en:contentEn,
      p_cover_public_url:cover,
      p_list_column:listColumn
    });
    if(error)throw error;
    return {cover,photos:mediaByRef.size,columnListed:!!column};
  }

  window.MoveTryJournalPublishing={prepare};
})();
