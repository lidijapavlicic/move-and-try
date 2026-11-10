-- MOVE&TRY The Journal | Author roles and columns (PREPARED MIGRATION)
-- Review and test BEFORE running in Supabase SQL Editor.
-- Non-breaking: does not modify journal_profiles.role, journal_articles,
-- existing RPC signatures, invitations or publication.
-- Column membership and article creation will be enforced in the existing
-- save RPC during the next integration step.

begin;

create table if not exists public.journal_author_permissions (
  user_id uuid primary key references public.journal_profiles(id) on delete cascade,
  can_write_column boolean not null default false,
  can_contribute boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id) on delete set null
);

create table if not exists public.journal_columns (
  id uuid primary key default gen_random_uuid(),
  columnist_id uuid not null references public.journal_profiles(id) on delete restrict,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (length(btrim(title)) between 1 and 160),
  public_byline text not null check (length(btrim(public_byline)) between 1 and 160),
  description text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists journal_columns_columnist_unique_idx
  on public.journal_columns(columnist_id);

alter table public.journal_author_permissions enable row level security;
alter table public.journal_columns enable row level security;

-- Authenticated users can view their own author privileges and assigned columns.
-- An active administrator can view all. No browser direct INSERT/UPDATE/DELETE.
drop policy if exists journal_author_permissions_read on public.journal_author_permissions;
create policy journal_author_permissions_read
  on public.journal_author_permissions for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.journal_profiles admin
      where admin.id = (select auth.uid())
        and admin.role = 'admin'
        and admin.is_active = true
    )
  );

drop policy if exists journal_columns_read on public.journal_columns;
create policy journal_columns_read
  on public.journal_columns for select to authenticated
  using (
    columnist_id = (select auth.uid())
    or exists (
      select 1 from public.journal_profiles admin
      where admin.id = (select auth.uid())
        and admin.role = 'admin'
        and admin.is_active = true
    )
  );

revoke all on public.journal_author_permissions from anon, authenticated;
revoke all on public.journal_columns from anon, authenticated;
grant select on public.journal_author_permissions to authenticated;
grant select on public.journal_columns to authenticated;

-- This function cannot grant or revoke the admin security role.
-- It only manages two independent author capabilities on existing editor users.
create or replace function public.journal_admin_set_author_permissions(
  p_user_id uuid,
  p_columnist boolean,
  p_contributor boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.journal_profiles p
    where p.id = auth.uid() and p.role = 'admin' and p.is_active = true
  ) then
    raise exception 'Administrator permission required';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'Administrator account permissions are managed separately';
  end if;

  if not exists (
    select 1 from public.journal_profiles p
    where p.id = p_user_id and p.role = 'editor'
  ) then
    raise exception 'Target user must be an existing editor account';
  end if;

  insert into public.journal_author_permissions
    (user_id,can_write_column,can_contribute,updated_at,updated_by)
  values
    (p_user_id,coalesce(p_columnist,false),
     coalesce(p_contributor,false),now(),auth.uid())
  on conflict (user_id) do update
    set can_write_column = excluded.can_write_column,
        can_contribute = excluded.can_contribute,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;
end;
$$;

revoke all on function public.journal_admin_set_author_permissions(
  uuid,boolean,boolean
) from public, anon;
grant execute on function public.journal_admin_set_author_permissions(
  uuid,boolean,boolean
) to authenticated;

-- Columns are created by the administrator and assigned to a real columnist.
-- The columnist cannot choose someone else's column.
create or replace function public.journal_admin_create_column(
  p_columnist_id uuid,
  p_title text,
  p_slug text,
  p_public_byline text,
  p_description text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  if not exists (
    select 1 from public.journal_profiles p
    where p.id = auth.uid() and p.role = 'admin' and p.is_active = true
  ) then
    raise exception 'Administrator permission required';
  end if;

  if not exists (
    select 1 from public.journal_profiles p
    where p.id = p_columnist_id and p.is_active = true
      and (
        p.role = 'admin'
        or (p.role = 'editor' and exists (
          select 1 from public.journal_author_permissions ar
          where ar.user_id = p.id and ar.can_write_column = true
        ))
      )
  ) then
    raise exception 'The selected account is not an active columnist';
  end if;

  insert into public.journal_columns
    (columnist_id,title,slug,public_byline,description)
  values
    (p_columnist_id,btrim(p_title),btrim(p_slug),btrim(p_public_byline),coalesce(p_description,''))
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.journal_admin_create_column(
  uuid,text,text,text,text
) from public, anon;
grant execute on function public.journal_admin_create_column(
  uuid,text,text,text,text
) to authenticated;


-- Update title, slug, public signature or disable an assigned column.
-- Existing articles are kept (including their column_id and history).
create or replace function public.journal_admin_update_column(
  p_column_id uuid,
  p_title text,
  p_slug text,
  p_public_byline text,
  p_description text,
  p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_id uuid;
begin
  if not exists (
    select 1 from public.journal_profiles p
    where p.id = auth.uid() and p.role = 'admin' and p.is_active = true
  ) then
    raise exception 'Administrator permission required';
  end if;

  select c.columnist_id into target_id
  from public.journal_columns c where c.id = p_column_id for update;
  if target_id is null then
    raise exception 'Column does not exist';
  end if;

  if p_is_active and not exists (
    select 1 from public.journal_profiles p
    where p.id = target_id and p.is_active = true
      and (
        p.role = 'admin'
        or (p.role = 'editor' and exists (
          select 1 from public.journal_author_permissions ap
          where ap.user_id = p.id and ap.can_write_column = true
        ))
      )
  ) then
    raise exception 'Cannot activate a column without an active columnist';
  end if;

  update public.journal_columns
  set title=btrim(p_title),
      slug=btrim(p_slug),
      public_byline=btrim(p_public_byline),
      description=coalesce(p_description,''),
      is_active=coalesce(p_is_active,false),
      updated_at=now()
  where id=p_column_id;
end;
$$;

revoke all on function public.journal_admin_update_column(
  uuid,text,text,text,text,boolean
) from public, anon;
grant execute on function public.journal_admin_update_column(
  uuid,text,text,text,text,boolean
) to authenticated;

commit;
