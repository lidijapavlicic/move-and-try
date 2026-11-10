-- MOVE&TRY The Journal | PRODUCTION PUBLICATION BRIDGE
-- Apply after journal-columnists-STAGE-1.sql.
-- No deletions, no changes to existing article triggers, no service keys.
-- This controls public publication from the existing journal_publish_or_schedule RPC.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

ALTER TABLE public.journal_columns
  ADD COLUMN IF NOT EXISTS public_listing_enabled boolean NOT NULL DEFAULT false;

-- A private draft image remains private; only an administrator may copy a
-- publication's media via Storage API into the new public asset bucket.
INSERT INTO storage.buckets
  (id,name,public,file_size_limit,allowed_mime_types)
VALUES ('journal-published','journal-published',true,10485760,
        array['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets
    WHERE id='journal-published' AND public=true) THEN
    RAISE EXCEPTION 'The publication bucket must be public';
  END IF;
END $$;

DROP POLICY IF EXISTS journal_published_admin_upload ON storage.objects;
CREATE POLICY journal_published_admin_upload
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id='journal-published'
    AND name ~* '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
    AND EXISTS (
      SELECT 1 FROM public.journal_profiles p
      WHERE p.id=(SELECT auth.uid())
        AND p.role='admin'
        AND p.is_active=true
    )
    AND EXISTS (
      SELECT 1 FROM public.journal_articles a
      WHERE a.id::text=split_part(name,'/',1)
        AND a.status IN ('approved','scheduled','published')
    )
  );
-- Public objects are readable with public URLs; no SELECT/LIST, UPDATE,
-- DELETE policy is granted to browsers. No file can be removed by editors.

CREATE OR REPLACE FUNCTION public.journal_admin_set_column_public_listing(
  p_column_id uuid, p_enabled boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.journal_profiles p
    WHERE p.id=auth.uid() AND p.role='admin' AND p.is_active=true
  ) THEN
    RAISE EXCEPTION 'Administratorski pristup je obavezan';
  END IF;
  UPDATE public.journal_columns
    SET public_listing_enabled=coalesce(p_enabled,false),updated_at=now()
    WHERE id=p_column_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kolumna ne postoji'; END IF;
END $$;

REVOKE ALL ON FUNCTION public.journal_admin_set_column_public_listing(uuid,boolean)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.journal_admin_set_column_public_listing(uuid,boolean)
  TO authenticated;

-- Public API only returns published articles or scheduled articles whose
-- exact scheduled time has passed. Unpublished drafts, revisions, pending,
-- approved, future schedule, inactive/unlisted personal columns stay PRIVATE.
CREATE OR REPLACE FUNCTION public.journal_public_articles_feed()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
WITH visible AS (
 SELECT a.id,a.category,a.title,a.title_en,a.excerpt,a.excerpt_en,
   a.cover_image,
   COALESCE(a.published_at,a.scheduled_at,a.updated_at) AS display_at,
   c.slug AS column_slug,c.title AS column_title,c.public_byline,
   c.description AS column_description,
   CASE WHEN a.category='personal'
     THEN c.public_byline
     WHEN a.category='editorial' OR a.category='news'
     THEN 'MOVE&TRY Editorial'
     ELSE COALESCE(NULLIF(BTRIM(p.display_name),''),'MOVE&TRY Contributor')
   END AS byline
 FROM public.journal_articles a
 LEFT JOIN public.journal_columns c ON c.id=a.column_id
 LEFT JOIN public.journal_profiles p ON p.id=a.author_id
 WHERE (
    (a.status='published' AND COALESCE(a.published_at,a.updated_at)<=now())
     OR (a.status='scheduled' AND a.scheduled_at IS NOT NULL AND a.scheduled_at<=now())
   )
   AND (a.category<>'personal'
    OR (c.id IS NOT NULL AND c.is_active=true
      AND c.public_listing_enabled=true))
), latest AS (
 SELECT * FROM visible ORDER BY display_at DESC LIMIT 200
)
SELECT jsonb_build_object(
 'version', 1,
 'items', COALESCE((SELECT jsonb_agg(jsonb_build_object(
   'id',x.id,'category',x.category,'titleHr',x.title,
   'titleEn',x.title_en,'excerptHr',x.excerpt,'excerptEn',x.excerpt_en,
   'byline',x.byline,'cover',x.cover_image,
   'publishedAt',x.display_at,
   'columnSlug',x.column_slug,
   'hrUrl','/hr/journal/article.html?id='||x.id::text,
   'enUrl','/journal/article.html?id='||x.id::text
 ) ORDER BY x.display_at DESC) FROM latest x), '[]'::jsonb),
 'columns', COALESCE((SELECT jsonb_agg(
    jsonb_build_object(
      'slug',c.slug,'title',c.title,'byline',c.public_byline,
      'description',c.description,'listed',true)
    ORDER BY c.title
   ) FROM public.journal_columns c
   WHERE c.is_active=true AND c.public_listing_enabled=true
    AND EXISTS(SELECT 1 FROM visible v WHERE v.column_slug=c.slug
      AND v.category='personal')
 ),'[]'::jsonb)
);
$$;

CREATE OR REPLACE FUNCTION public.journal_public_article(p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
SELECT jsonb_build_object(
 'id',a.id,'category',a.category,
 'titleHr',a.title,'titleEn',a.title_en,
 'excerptHr',a.excerpt,'excerptEn',a.excerpt_en,
 'contentHr',a.content,'contentEn',a.content_en,
 'cover',a.cover_image,
 'publishedAt',COALESCE(a.published_at,a.scheduled_at,a.updated_at),
 'columnSlug',c.slug,
 'byline',CASE WHEN a.category='personal' THEN c.public_byline
   WHEN a.category='editorial' OR a.category='news' THEN 'MOVE&TRY Editorial'
   ELSE COALESCE(NULLIF(BTRIM(p.display_name),''),'MOVE&TRY Contributor') END
)
FROM public.journal_articles a
LEFT JOIN public.journal_columns c ON c.id=a.column_id
LEFT JOIN public.journal_profiles p ON p.id=a.author_id
WHERE a.id=p_id AND (
   (a.status='published' AND COALESCE(a.published_at,a.updated_at)<=now())
   OR (a.status='scheduled' AND a.scheduled_at IS NOT NULL AND a.scheduled_at<=now())
 )
 AND (a.category<>'personal' OR
   (c.id IS NOT NULL AND c.is_active=true AND c.public_listing_enabled=true))
LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.journal_public_articles_feed() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.journal_public_article(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.journal_public_articles_feed() TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.journal_public_article(uuid) TO anon,authenticated;

-- Check functions are visible, and avoid accidental publication of drafts.
DO $$
BEGIN
  IF to_regprocedure('public.journal_public_articles_feed()') IS NULL
  OR to_regprocedure('public.journal_public_article(uuid)') IS NULL
  THEN RAISE EXCEPTION 'Public publication endpoints are missing'; END IF;
END $$;

COMMIT;
