-- MOVE&TRY · THE JOURNAL | Public publishing bridge
-- Prerequisite: journal-columnists-STAGE-1.sql already applied.
-- One transaction. Does NOT delete articles, users, triggers or draft images.
-- Deploy corresponding public JS/HTML code BEFORE testing publication.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

ALTER TABLE public.journal_columns
  ADD COLUMN IF NOT EXISTS public_listing_enabled boolean NOT NULL DEFAULT false;

-- Private draft images are never directly exposed. The admin copies referenced
-- images to this public bucket BEFORE publishing. Public URLs are permanent.
INSERT INTO storage.buckets
  (id,name,public,file_size_limit,allowed_mime_types)
VALUES (
  'journal-published','journal-published',true,10485760,
  ARRAY['image/jpeg','image/png','image/webp']
)
ON CONFLICT(id) DO NOTHING;

DO $check_public_bucket$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets b
    WHERE b.id='journal-published'
      AND b.public=true
      AND b.file_size_limit=10485760
  ) THEN
    RAISE EXCEPTION 'journal-published: expected public 10 MB bucket';
  END IF;
END;
$check_public_bucket$;

DROP POLICY IF EXISTS journal_published_admin_upload ON storage.objects;
CREATE POLICY journal_published_admin_upload
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id='journal-published'
    AND name ~* '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
    AND EXISTS (
      SELECT 1 FROM public.journal_profiles p
      WHERE p.id=(SELECT auth.uid()) AND p.role='admin' AND p.is_active=true
    )
    AND EXISTS (
      SELECT 1 FROM public.journal_articles a
      WHERE a.id::text=split_part(name,'/',1) AND a.status='approved'
    )
  );

-- A snapshot contains only already prepared public image URLs. It remains
-- private until the article's existing publication status allows viewing.
CREATE TABLE IF NOT EXISTS public.journal_publication_snapshots (
  article_id uuid PRIMARY KEY REFERENCES public.journal_articles(id)
    ON DELETE CASCADE,
  source_revision bigint NOT NULL,
  content_hr text NOT NULL,
  content_en text NOT NULL,
  cover_public_url text NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  prepared_by uuid NOT NULL REFERENCES auth.users(id)
);
ALTER TABLE public.journal_publication_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.journal_publication_snapshots FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.journal_admin_prepare_publication(
  p_article_id uuid,
  p_expected_revision bigint,
  p_content_hr text,
  p_content_en text,
  p_cover_public_url text,
  p_list_column boolean DEFAULT false
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  a record;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.journal_profiles p
    WHERE p.id=auth.uid() AND p.role='admin' AND p.is_active=true
  ) THEN RAISE EXCEPTION 'Administratorski pristup je obavezan'; END IF;

  SELECT id,revision_number,status,category,column_id
    INTO a FROM public.journal_articles WHERE id=p_article_id FOR UPDATE;
  IF NOT FOUND OR a.status<>'approved' OR
    a.revision_number IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'Clanak nije odobren ili se revizija promijenila';
  END IF;

  IF btrim(COALESCE(p_content_hr,''))='' OR
     btrim(COALESCE(p_content_en,''))='' THEN
    RAISE EXCEPTION 'HR i EN tekst moraju biti ispunjeni';
  END IF;
  IF position('mtmedia:' IN p_content_hr)>0 OR
     position('mtmedia:' IN p_content_en)>0 OR
     position('mtmedia:' IN COALESCE(p_cover_public_url,''))>0 THEN
    RAISE EXCEPTION 'Privatne fotografije nisu prenesene u javnu pohranu';
  END IF;
  -- A browser may only supply public media URLs on our known Supabase project,
  -- or existing HTTPS image URLs already used in the editorial content.
  IF p_cover_public_url IS NOT NULL AND
    p_cover_public_url !~ '^https://[^[:space:]]+$' THEN
    RAISE EXCEPTION 'Neispravna naslovna fotografija';
  END IF;

  IF a.category='personal' THEN
    IF a.column_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.journal_columns c
      WHERE c.id=a.column_id AND c.is_active=true
    ) THEN
      RAISE EXCEPTION 'Kolumna nije aktivna';
    END IF;
    IF coalesce(p_list_column,false) THEN
      UPDATE public.journal_columns
        SET public_listing_enabled=true,updated_at=now()
        WHERE id=a.column_id;
    ELSIF NOT EXISTS (
      SELECT 1 FROM public.journal_columns c
      WHERE c.id=a.column_id AND c.public_listing_enabled=true
    ) THEN
      RAISE EXCEPTION 'Prije objave ukljuci javni prikaz kolumne';
    END IF;
  END IF;

  INSERT INTO public.journal_publication_snapshots
    (article_id,source_revision,content_hr,content_en,cover_public_url,
     updated_at,prepared_by)
  VALUES
    (a.id,a.revision_number,p_content_hr,p_content_en,p_cover_public_url,
     now(),auth.uid())
  ON CONFLICT(article_id) DO UPDATE SET
    source_revision=excluded.source_revision,
    content_hr=excluded.content_hr,
    content_en=excluded.content_en,
    cover_public_url=excluded.cover_public_url,
    updated_at=now(),
    prepared_by=excluded.prepared_by;
END;
$$;

REVOKE ALL ON FUNCTION public.journal_admin_prepare_publication(
  uuid,bigint,text,text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.journal_admin_prepare_publication(
  uuid,bigint,text,text,text,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.journal_admin_set_column_public_listing(
  p_column_id uuid,p_enabled boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.journal_profiles p
    WHERE p.id=auth.uid() AND p.role='admin' AND p.is_active=true
  ) THEN RAISE EXCEPTION 'Administratorski pristup je obavezan'; END IF;

  UPDATE public.journal_columns
  SET public_listing_enabled=coalesce(p_enabled,false),updated_at=now()
  WHERE id=p_column_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kolumna ne postoji'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.journal_admin_set_column_public_listing(
  uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.journal_admin_set_column_public_listing(
  uuid,boolean) TO authenticated;

-- Both public endpoints return ONLY published/elapsed scheduled articles
-- WITH completed snapshots. They never read draft content or expose
-- private mtmedia paths. The read-only publishable key suffices.
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
     'description',c.description,'listed',true
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
 'columnSlug',c.slug,
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

REVOKE ALL ON FUNCTION public.journal_public_articles_feed()
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.journal_public_article(uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.journal_public_articles_feed()
  TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.journal_public_article(uuid)
  TO anon,authenticated;

DO $verify$
BEGIN
  IF to_regprocedure('public.journal_admin_prepare_publication(uuid,bigint,text,text,text,boolean)') IS NULL
    OR to_regprocedure('public.journal_public_articles_feed()') IS NULL
    OR to_regprocedure('public.journal_public_article(uuid)') IS NULL
  THEN RAISE EXCEPTION 'Required publication functions were not created'; END IF;
END;
$verify$;
COMMIT;
