-- MOVE&TRY The Journal · FAZA 1: sigurna priprema kolumni i autora
-- Bez brisanja članaka, profila i postojećih okidača.
-- Privremeno samo testni rad; stroža autorska zaštita dolazi u fazi 2.
begin;
set local lock_timeout = '5s';

create table if not exists public.journal_author_permissions (
  user_id uuid primary key references public.journal_profiles(id) on delete cascade,
  can_write_column boolean not null default false,
  can_contribute boolean not null default false,
  contributor_byline text check (
    contributor_byline is null or length(btrim(contributor_byline)) between 1 and 160
  ),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.journal_columns (
  id uuid primary key default gen_random_uuid(),
  columnist_id uuid references public.journal_profiles(id) on delete restrict,
  title text not null check (length(btrim(title)) between 1 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  public_byline text not null check (length(btrim(public_byline)) between 1 and 160),
  description text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists journal_columns_columnist_unique_idx
  on public.journal_columns(columnist_id);

alter table public.journal_articles
  add column if not exists column_id uuid
  references public.journal_columns(id) on delete restrict;

create index if not exists journal_articles_column_id_idx
  on public.journal_articles(column_id);

insert into public.journal_author_permissions
  (user_id,can_write_column,can_contribute,contributor_byline)
select p.id,
       exists (select 1 from public.journal_articles a
               where a.author_id=p.id and a.category='personal'),
       true,
       coalesce(nullif(btrim(p.display_name),''),'MOVE&TRY Contributor')
from public.journal_profiles p
where p.role='editor'
on conflict (user_id) do nothing;

alter table public.journal_author_permissions enable row level security;
alter table public.journal_columns enable row level security;

drop policy if exists journal_author_permissions_read
  on public.journal_author_permissions;
create policy journal_author_permissions_read
  on public.journal_author_permissions for select to authenticated
  using (
    user_id=(select auth.uid()) or exists (
      select 1 from public.journal_profiles p
      where p.id=(select auth.uid()) and p.role='admin' and p.is_active=true
    )
  );

drop policy if exists journal_columns_read on public.journal_columns;
create policy journal_columns_read
  on public.journal_columns for select to authenticated
  using (
    columnist_id=(select auth.uid()) or exists (
      select 1 from public.journal_profiles p
      where p.id=(select auth.uid()) and p.role='admin' and p.is_active=true
    )
  );

revoke all on public.journal_author_permissions from anon,authenticated;
revoke all on public.journal_columns from anon,authenticated;
grant select on public.journal_author_permissions to authenticated;
grant select on public.journal_columns to authenticated;

create or replace function public.journal_admin_set_author_permissions(
  p_user_id uuid,p_columnist boolean,p_contributor boolean,p_public_byline text
) returns void language plpgsql security definer set search_path='' as $$
begin
  if not exists (
    select 1 from public.journal_profiles p
    where p.id=auth.uid() and p.role='admin' and p.is_active=true
  ) then raise exception 'Administratorski pristup je obavezan'; end if;
  if p_user_id=auth.uid() or not exists (
    select 1 from public.journal_profiles p
    where p.id=p_user_id and p.role='editor'
  ) then raise exception 'Korisnik mora biti postojeci autor'; end if;
  if p_public_byline is null or length(btrim(p_public_byline)) not between 1 and 160
  then raise exception 'Neispravan javni potpis'; end if;
  insert into public.journal_author_permissions
    (user_id,can_write_column,can_contribute,contributor_byline,updated_at,updated_by)
  values
    (p_user_id,coalesce(p_columnist,false),coalesce(p_contributor,false),
     btrim(p_public_byline),now(),auth.uid())
  on conflict (user_id) do update set
    can_write_column=excluded.can_write_column,
    can_contribute=excluded.can_contribute,
    contributor_byline=excluded.contributor_byline,
    updated_at=excluded.updated_at,updated_by=excluded.updated_by;
end; $$;

create or replace function public.journal_admin_create_column(
  p_columnist_id uuid,p_title text,p_slug text,p_public_byline text,
  p_description text default ''
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  if not exists (
    select 1 from public.journal_profiles p
    where p.id=auth.uid() and p.role='admin' and p.is_active=true
  ) then raise exception 'Administratorski pristup je obavezan'; end if;
  if p_columnist_id is not null and not exists (
    select 1 from public.journal_profiles p
    where p.id=p_columnist_id and p.is_active=true and (
      p.role='admin' or (p.role='editor' and exists (
        select 1 from public.journal_author_permissions ap
        where ap.user_id=p.id and ap.can_write_column=true
      ))
    )
  ) then raise exception 'Korisnik nema ovlast kolumnista'; end if;
  insert into public.journal_columns
    (columnist_id,title,slug,public_byline,description)
  values
    (p_columnist_id,btrim(p_title),btrim(p_slug),btrim(p_public_byline),
     coalesce(p_description,''))
  returning id into v_id;
  return v_id;
end; $$;

create or replace function public.journal_admin_update_column(
  p_column_id uuid,p_title text,p_slug text,p_public_byline text,
  p_description text,p_is_active boolean
) returns void language plpgsql security definer set search_path='' as $$
begin
  if not exists (
    select 1 from public.journal_profiles p
    where p.id=auth.uid() and p.role='admin' and p.is_active=true
  ) then raise exception 'Administratorski pristup je obavezan'; end if;
  update public.journal_columns set
    title=btrim(p_title),slug=btrim(p_slug),
    public_byline=btrim(p_public_byline),description=coalesce(p_description,''),
    is_active=coalesce(p_is_active,false),updated_at=now()
  where id=p_column_id;
  if not found then raise exception 'Kolumna ne postoji'; end if;
end; $$;

create or replace function public.journal_admin_link_column_account(
  p_column_id uuid,p_user_id uuid
) returns void language plpgsql security definer set search_path='' as $$
begin
  if not exists (
    select 1 from public.journal_profiles p
    where p.id=auth.uid() and p.role='admin' and p.is_active=true
  ) then raise exception 'Administratorski pristup je obavezan'; end if;
  if p_user_id is not null and not exists (
    select 1 from public.journal_profiles p
    where p.id=p_user_id and p.is_active=true and (
      p.role='admin' or (p.role='editor' and exists (
        select 1 from public.journal_author_permissions ap
        where ap.user_id=p.id and ap.can_write_column=true
      ))
    )
  ) then raise exception 'Korisnik nema ovlast kolumnista'; end if;
  update public.journal_columns set columnist_id=p_user_id,updated_at=now()
  where id=p_column_id;
  if not found then raise exception 'Kolumna ne postoji'; end if;
end; $$;

create or replace function public.journal_admin_create_column_draft(
  p_column_id uuid,p_title text,p_excerpt text,p_content text,p_cover_image text
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  if not exists (
    select 1 from public.journal_profiles p
    where p.id=auth.uid() and p.role='admin' and p.is_active=true
  ) then raise exception 'Administratorski pristup je obavezan'; end if;
  if not exists (
    select 1 from public.journal_columns c
    where c.id=p_column_id and c.is_active=true
  ) then raise exception 'Odabrana kolumna nije aktivna'; end if;
  insert into public.journal_articles
    (author_id,column_id,title,excerpt,content,category,cover_image,status)
  values
    (auth.uid(),p_column_id,coalesce(p_title,''),p_excerpt,
     coalesce(p_content,''),'personal',p_cover_image,'draft')
  returning id into v_id;
  return v_id;
end; $$;

create or replace function public.journal_admin_mark_ready(
  p_article_id uuid,p_expected_revision bigint
) returns void language plpgsql security definer set search_path='' as $$
begin
  if not exists (
    select 1 from public.journal_profiles p
    where p.id=auth.uid() and p.role='admin' and p.is_active=true
  ) then raise exception 'Administratorski pristup je obavezan'; end if;
  if p_expected_revision is null then
    raise exception 'Nedostaje revizija'; end if;
  update public.journal_articles set status='approved'
  where id=p_article_id and author_id=auth.uid()
    and status in ('draft','revision')
    and revision_number=p_expected_revision;
  if not found then raise exception 'Skica nije dostupna ili je revizija promijenjena';
  end if;
end; $$;

revoke all on function public.journal_admin_set_author_permissions(uuid,boolean,boolean,text)
  from public,anon;
revoke all on function public.journal_admin_create_column(uuid,text,text,text,text)
  from public,anon;
revoke all on function public.journal_admin_update_column(uuid,text,text,text,text,boolean)
  from public,anon;
revoke all on function public.journal_admin_link_column_account(uuid,uuid)
  from public,anon;
revoke all on function public.journal_admin_create_column_draft(uuid,text,text,text,text)
  from public,anon;
revoke all on function public.journal_admin_mark_ready(uuid,bigint)
  from public,anon;

grant execute on function public.journal_admin_set_author_permissions(uuid,boolean,boolean,text)
  to authenticated;
grant execute on function public.journal_admin_create_column(uuid,text,text,text,text)
  to authenticated;
grant execute on function public.journal_admin_update_column(uuid,text,text,text,text,boolean)
  to authenticated;
grant execute on function public.journal_admin_link_column_account(uuid,uuid)
  to authenticated;
grant execute on function public.journal_admin_create_column_draft(uuid,text,text,text,text)
  to authenticated;
grant execute on function public.journal_admin_mark_ready(uuid,bigint)
  to authenticated;

commit;
