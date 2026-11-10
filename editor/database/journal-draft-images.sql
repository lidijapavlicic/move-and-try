-- MOVE&TRY | Journal draft images (PRIVATE bucket).
-- Apply only in the project's Supabase SQL Editor. Does not touch
-- journal_articles, journal_profiles, existing buckets or public web content.
begin;

insert into storage.buckets
  (id, name, public, file_size_limit, allowed_mime_types)
values
  ('journal-draft-images', 'journal-draft-images', false, 10485760,
   array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

do $$
begin
  if exists (
    select 1 from storage.buckets
    where id = 'journal-draft-images' and public
  ) then
    raise exception 'Journal draft images bucket must remain private';
  end if;
end $$;

-- Read / signed download: own images or active administrators.
drop policy if exists journal_draft_images_read on storage.objects;
create policy journal_draft_images_read
  on storage.objects for select to authenticated
  using (
    bucket_id = 'journal-draft-images'
    and (
      split_part(name, '/', 1) = (select auth.uid())::text
      or exists (
        select 1 from public.journal_profiles p
        where p.id = (select auth.uid())
          and p.role = 'admin'
          and p.is_active = true
      )
    )
    and exists (
      select 1 from public.journal_profiles actor
      where actor.id = (select auth.uid())
        and actor.is_active = true
    )
  );

-- Upload: own folder only. No public or anonymous uploads.
drop policy if exists journal_draft_images_insert on storage.objects;
create policy journal_draft_images_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'journal-draft-images'
    and split_part(name, '/', 1) = (select auth.uid())::text
    and array_length(string_to_array(name, '/'), 1) = 2
    and exists (
      select 1 from public.journal_profiles p
      where p.id = (select auth.uid())
        and p.is_active = true
    )
  );

-- Intentionally NO update/delete permissions: removing an image from the
-- text doesn't destroy source files or the revision history. Garbage
-- collection can be implemented as a separate admin-only audited operation.

commit;
