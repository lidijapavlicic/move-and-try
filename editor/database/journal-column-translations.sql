-- Apply after journal-production-publication.sql.
begin;
set local lock_timeout = '5s';

alter table public.journal_columns
  add column if not exists title_en varchar(160),
  add column if not exists description_en varchar(500);

create or replace function public.journal_admin_create_column_bilingual(
  p_columnist_id uuid, p_title text, p_slug text, p_public_byline text,
  p_description text, p_title_en text, p_description_en text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  v_id := public.journal_admin_create_column(
    p_columnist_id, p_title, p_slug, p_public_byline, p_description
  );
  perform public.journal_admin_save_column_translation(v_id, p_title_en, p_description_en);
  return v_id;
end;
$$;

create or replace function public.journal_admin_update_column_bilingual(
  p_column_id uuid, p_title text, p_slug text, p_public_byline text,
  p_description text, p_is_active boolean, p_title_en text, p_description_en text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform public.journal_admin_update_column(
    p_column_id, p_title, p_slug, p_public_byline, p_description, p_is_active
  );
  perform public.journal_admin_save_column_translation(p_column_id, p_title_en, p_description_en);
end;
$$;

create or replace function public.journal_admin_save_column_translation(
  p_column_id uuid, p_title_en text, p_description_en text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.journal_profiles
    where id = auth.uid() and role = 'admin' and is_active
  ) then
    raise exception 'Samo urednica može uređivati prijevod kolumne.';
  end if;

  update public.journal_columns
  set title_en = nullif(btrim(p_title_en), ''),
      description_en = nullif(btrim(p_description_en), ''),
      updated_at = now()
  where id = p_column_id;

  if not found then
    raise exception 'Kolumna ne postoji.';
  end if;
end;
$$;

revoke all on function public.journal_admin_save_column_translation(uuid,text,text)
  from public, anon;
revoke all on function public.journal_admin_create_column_bilingual(uuid,text,text,text,text,text,text)
  from public, anon;
revoke all on function public.journal_admin_update_column_bilingual(uuid,text,text,text,text,boolean,text,text)
  from public, anon;
grant execute on function public.journal_admin_save_column_translation(uuid,text,text),
  public.journal_admin_create_column_bilingual(uuid,text,text,text,text,text,text),
  public.journal_admin_update_column_bilingual(uuid,text,text,text,text,boolean,text,text)
  to authenticated;

CREATE OR REPLACE FUNCTION public.journal_public_articles_feed()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
WITH visible AS (
 SELECT a.id,a.category,a.title,a.title_en,a.excerpt,a.excerpt_en,
        s.cover_public_url,
        COALESCE(a.published_at,a.scheduled_at,a.updated_at) AS display_at,
        c.slug AS column_slug,c.title AS column_title,
        c.public_byline,c.description AS column_description,
        CASE WHEN a.category='personal' THEN c.public_byline
         WHEN a.category IN ('editorial','news') THEN 'MOVE&TRY Editorial'
         ELSE COALESCE(NULLIF(BTRIM(p.display_name),''),'MOVE&TRY Contributor')
        END AS byline
 FROM public.journal_articles a
 JOIN public.journal_publication_snapshots s ON s.article_id=a.id
 LEFT JOIN public.journal_columns c ON c.id=a.column_id
 LEFT JOIN public.journal_profiles p ON p.id=a.author_id
 WHERE (
   (a.status='published' AND COALESCE(a.published_at,a.updated_at)<=now())
   OR (a.status='scheduled' AND a.scheduled_at IS NOT NULL AND a.scheduled_at<=now())
 )
 AND (a.category<>'personal' OR
   (c.id IS NOT NULL AND c.is_active=true AND c.public_listing_enabled=true))
), latest AS (
 SELECT * FROM visible ORDER BY display_at DESC LIMIT 200
)
SELECT jsonb_build_object(
 'version',1,
 'items',COALESCE((
   SELECT jsonb_agg(jsonb_build_object(
     'id',v.id,'category',v.category,
     'titleHr',v.title,'titleEn',v.title_en,
     'excerptHr',v.excerpt,'excerptEn',v.excerpt_en,
     'byline',v.byline,'cover',v.cover_public_url,
     'publishedAt',v.display_at,'columnSlug',v.column_slug,
     'hrUrl','/hr/journal/article.html?id='||v.id::text,
     'enUrl','/journal/article.html?id='||v.id::text
   ) ORDER BY v.display_at DESC) FROM latest v
 ),'[]'::jsonb),
 'columns',COALESCE((
   SELECT jsonb_agg(jsonb_build_object(
     'slug',c.slug,'title',c.title,'byline',c.public_byline,
     'description',c.description,'titleEn',c.title_en,
     'descriptionEn',c.description_en,'listed',true
   ) ORDER BY c.title)
   FROM public.journal_columns c
   WHERE c.is_active=true AND c.public_listing_enabled=true
   AND EXISTS(SELECT 1 FROM visible v
     WHERE v.column_slug=c.slug AND v.category='personal')
 ),'[]'::jsonb)
);
$$;

CREATE OR REPLACE FUNCTION public.journal_public_article(p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
SELECT jsonb_build_object(
 'id',a.id,'category',a.category,
 'titleHr',a.title,'titleEn',a.title_en,
 'excerptHr',a.excerpt,'excerptEn',a.excerpt_en,
 'contentHr',s.content_hr,'contentEn',s.content_en,
 'cover',s.cover_public_url,
 'publishedAt',COALESCE(a.published_at,a.scheduled_at,a.updated_at),
 'columnSlug',c.slug,'columnTitle',c.title,'columnTitleEn',c.title_en,
 'byline',CASE WHEN a.category='personal' THEN c.public_byline
   WHEN a.category IN ('editorial','news') THEN 'MOVE&TRY Editorial'
   ELSE COALESCE(NULLIF(BTRIM(p.display_name),''),'MOVE&TRY Contributor') END
)
FROM public.journal_articles a
JOIN public.journal_publication_snapshots s ON s.article_id=a.id
LEFT JOIN public.journal_columns c ON c.id=a.column_id
LEFT JOIN public.journal_profiles p ON p.id=a.author_id
WHERE a.id=p_id
 AND (
   (a.status='published' AND COALESCE(a.published_at,a.updated_at)<=now())
   OR (a.status='scheduled' AND a.scheduled_at IS NOT NULL AND a.scheduled_at<=now())
 )
 AND (a.category<>'personal' OR
   (c.id IS NOT NULL AND c.is_active=true AND c.public_listing_enabled=true))
LIMIT 1;
$$;

commit;
