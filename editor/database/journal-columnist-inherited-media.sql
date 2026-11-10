-- MOVE&TRY | private media for inherited columnist articles
-- A linked columnist may read ONLY private images referenced by their column.
-- The bucket remains private; upload stays in the uploader's own folder.
begin;

drop policy if exists journal_draft_images_read on storage.objects;
create policy journal_draft_images_read
  on storage.objects for select to authenticated
  using (
    bucket_id='journal-draft-images'
    and exists (
      select 1 from public.journal_profiles actor
      where actor.id=(select auth.uid()) and actor.is_active=true
    )
    and (
      split_part(name,'/',1)=(select auth.uid())::text
      or exists (
        select 1 from public.journal_profiles admin
        where admin.id=(select auth.uid())
          and admin.role='admin' and admin.is_active=true
      )
      or exists (
        select 1
        from public.journal_articles article
        join public.journal_columns c on c.id=article.column_id
        join public.journal_author_permissions ap on ap.user_id=(select auth.uid())
        where c.columnist_id=(select auth.uid()) and c.is_active=true
          and ap.can_write_column=true
          and (
            article.cover_image=('mtmedia:'||name)
            or position(('mtmedia:'||name) in coalesce(article.content,''))>0
            or position(('mtmedia:'||name) in coalesce(article.content_en,''))>0
          )
      )
    )
  );

commit;
