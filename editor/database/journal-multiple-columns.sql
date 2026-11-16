-- MOVE&TRY | Multiple Journal columns per Editor account.
-- Apply this before deploying the Editor column selector. Existing rows,
-- article triggers and table policies are preserved.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Allow the same account on multiple column rows, keeping lookups indexed.
create index if not exists journal_columns_columnist_idx
  on public.journal_columns(columnist_id);
drop index if exists public.journal_columns_columnist_unique_idx;

-- First save of an author's column draft. Ownership is checked here even
-- where no general article trigger is installed.
create or replace function public.journal_create_column_draft(
  p_column_id uuid,
  p_title text,
  p_excerpt text,
  p_content text,
  p_cover_image text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  draft_id uuid;
begin
  perform 1
  from public.journal_profiles p
  join public.journal_author_permissions ap on ap.user_id = p.id
  where p.id = actor_id and p.role = 'editor' and p.is_active = true
    and ap.can_write_column = true
  for share of p, ap;
  if not found then
    raise exception 'Nemaš aktivan pristup kolumnama.';
  end if;
  if p_column_id is null then
    raise exception 'Odaberi kolumnu prije spremanja.';
  end if;

  perform 1 from public.journal_columns c
  where c.id = p_column_id and c.columnist_id = actor_id and c.is_active = true
  for share;
  if not found then
    raise exception 'Odabrana kolumna nije dostupna.';
  end if;

  insert into public.journal_articles
    (author_id, column_id, title, excerpt, content, category, cover_image, status)
  values
    (actor_id, p_column_id, coalesce(p_title, ''), p_excerpt,
     coalesce(p_content, ''), 'personal', p_cover_image, 'draft')
  returning id into draft_id;

  return draft_id;
end;
$$;

revoke all on function public.journal_create_column_draft(uuid,text,text,text,text)
  from public, anon;
grant execute on function public.journal_create_column_draft(uuid,text,text,text,text)
  to authenticated;

-- Reuse the existing column-scoped editing and submission functions where
-- installed. Add the reviewed definitions when a deployment lacks them.
do $migration$
begin
  if to_regprocedure('public.journal_save_assigned_column_draft_checked(uuid,bigint,text,text,text,text,text)') is null then
    execute $ddl$
create function public.journal_save_assigned_column_draft_checked(
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
    and a.category='personal'
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
$ddl$;
  end if;

  if to_regprocedure('public.journal_submit_assigned_column(uuid)') is null then
    execute $ddl$
create function public.journal_submit_assigned_column(
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
    and a.category='personal'
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
$ddl$;
  end if;
end;
$migration$;

revoke all on function public.journal_save_assigned_column_draft_checked(
  uuid,bigint,text,text,text,text,text
) from public,anon;
grant execute on function public.journal_save_assigned_column_draft_checked(
  uuid,bigint,text,text,text,text,text
) to authenticated;

revoke all on function public.journal_submit_assigned_column(uuid)
  from public,anon;
grant execute on function public.journal_submit_assigned_column(uuid)
  to authenticated;

notify pgrst, 'reload schema';
commit;
