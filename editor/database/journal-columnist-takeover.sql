-- MOVE&TRY | columnist can take over drafts created by an administrator
-- Staged only. Requires journal columns / article column_id.
-- Public authorship does not change and original author_id stays immutable.
begin;

drop policy if exists journal_columnist_read_assigned_articles
  on public.journal_articles;
create policy journal_columnist_read_assigned_articles
  on public.journal_articles for select to authenticated
  using (
    column_id is not null
    and exists (
      select 1 from public.journal_columns c
      join public.journal_author_permissions ap on ap.user_id=(select auth.uid())
      join public.journal_profiles p on p.id=(select auth.uid())
      where c.id=journal_articles.column_id
        and c.columnist_id=(select auth.uid())
        and c.is_active=true
        and ap.can_write_column=true
        and p.is_active=true
    )
  );

create or replace function public.journal_save_assigned_column_draft_checked(
  p_article_id uuid,
  p_expected_revision bigint,
  p_title text,
  p_excerpt text,
  p_content text,
  p_category text,
  p_cover_image text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or p_expected_revision is null then
    raise exception 'Nedostaje prijava ili revizija';
  end if;
  if p_category is distinct from 'personal' then
    raise exception 'Osobna kolumna ne moze promijeniti kategoriju';
  end if;
  if not exists (
    select 1 from public.journal_profiles p
    join public.journal_author_permissions ap on ap.user_id=p.id
    where p.id=auth.uid() and p.is_active=true and p.role='editor'
      and ap.can_write_column=true
  ) then
    raise exception 'Nemas aktivan pristup kolumni';
  end if;

  update public.journal_articles a
  set title=coalesce(p_title,''),excerpt=p_excerpt,content=coalesce(p_content,''),
      category='personal',cover_image=p_cover_image
  where a.id=p_article_id
    and a.status in ('draft','revision')
    and a.revision_number=p_expected_revision
    and exists (
      select 1 from public.journal_columns c
      where c.id=a.column_id and c.columnist_id=auth.uid()
        and c.is_active=true
    )
  returning a.id into v_id;

  if v_id is null then
    raise exception 'Skica je izmijenjena ili nemaš pristup ovoj kolumni';
  end if;
  return v_id;
end;
$$;

revoke all on function public.journal_save_assigned_column_draft_checked(
  uuid,bigint,text,text,text,text,text
) from public,anon;
grant execute on function public.journal_save_assigned_column_draft_checked(
  uuid,bigint,text,text,text,text,text
) to authenticated;

create or replace function public.journal_submit_assigned_column(
  p_article_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not exists (
    select 1 from public.journal_profiles p
    join public.journal_author_permissions ap on ap.user_id=p.id
    where p.id=auth.uid() and p.role='editor' and p.is_active=true
      and ap.can_write_column=true
  ) then
    raise exception 'Nemas aktivan pristup kolumni';
  end if;

  update public.journal_articles a
  set status='submitted'
  where a.id=p_article_id
    and a.status in ('draft','revision')
    and length(btrim(coalesce(a.title,'')))>0
    and length(btrim(coalesce(a.excerpt,'')))>0
    and length(btrim(coalesce(a.content,'')))>0
    and exists (
      select 1 from public.journal_columns c
      where c.id=a.column_id and c.columnist_id=auth.uid()
        and c.is_active=true
    )
  returning a.id into v_id;

  if v_id is null then
    raise exception 'Clanak nije potpun, vise nije skica ili nemas pristup';
  end if;
end;
$$;

revoke all on function public.journal_submit_assigned_column(uuid)
  from public,anon;
grant execute on function public.journal_submit_assigned_column(uuid)
  to authenticated;

commit;
