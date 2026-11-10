-- MOVE&TRY | THE JOURNAL — COLUMNISTS AND CONTRIBUTOR ROLES
-- SINGLE TRANSACTION: either everything applies or nothing changes.
-- Prepared for staging; do not run until specifically instructed.
-- No existing article rows, account roles, or history are deleted.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '90s';

-- ========== SECTION 1 — editor/database/journal-author-roles-and-columns.sql ==========
-- MOVE&TRY The Journal | Author roles and columns (PREPARED MIGRATION)
-- Review and test BEFORE running in Supabase SQL Editor.
-- Non-breaking: does not modify journal_profiles.role, journal_articles,
-- existing RPC signatures, invitations or publication.
-- Column membership and article creation will be enforced in the existing
-- save RPC during the next integration step.


create table if not exists public.journal_author_permissions (
  user_id uuid primary key references public.journal_profiles(id) on delete cascade,
  can_write_column boolean not null default false,
  can_contribute boolean not null default false,
  contributor_byline text null check (contributor_byline is null or length(btrim(contributor_byline)) between 1 and 160),
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id) on delete set null
);

create table if not exists public.journal_columns (
  id uuid primary key default gen_random_uuid(),
  columnist_id uuid null references public.journal_profiles(id) on delete restrict,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (length(btrim(title)) between 1 and 160),
  public_byline text not null check (length(btrim(public_byline)) between 1 and 160),
  description text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Preserve the general author access existing editors already had.
insert into public.journal_author_permissions
  (user_id,can_write_column,can_contribute,contributor_byline)
select p.id,
  exists (
    select 1 from public.journal_articles a
    where a.author_id=p.id and a.category='personal'
  ),
  true,
  coalesce(nullif(btrim(p.display_name),''),'MOVE&TRY Contributor')
from public.journal_profiles p
where p.role='editor'
on conflict (user_id) do nothing;

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
  p_contributor boolean,
  p_public_byline text
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

  if p_public_byline is null or
     length(btrim(p_public_byline)) not between 1 and 160 then
    raise exception 'Public signature must contain 1-160 characters';
  end if;

  insert into public.journal_author_permissions
    (user_id,can_write_column,can_contribute,contributor_byline,updated_at,updated_by)
  values
    (p_user_id,coalesce(p_columnist,false),
     coalesce(p_contributor,false),btrim(p_public_byline),now(),auth.uid())
  on conflict (user_id) do update
    set can_write_column = excluded.can_write_column,
        can_contribute = excluded.can_contribute,
        contributor_byline = excluded.contributor_byline,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;
end;
$$;

revoke all on function public.journal_admin_set_author_permissions(
  uuid,boolean,boolean,text
) from public, anon;
grant execute on function public.journal_admin_set_author_permissions(
  uuid,boolean,boolean,text
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

  if p_columnist_id is not null and not exists (
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

  select c.id into target_id
  from public.journal_columns c where c.id = p_column_id for update;
  if target_id is null then
    raise exception 'Column does not exist';
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


-- Administrator links an optional editor account later. Null unlinks it.
-- Previously created articles, bylines and activity history are unchanged.
create or replace function public.journal_admin_link_column_account(
  p_column_id uuid,
  p_user_id uuid
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
  ) then raise exception 'Administrator permission required'; end if;

  if not exists (
    select 1 from public.journal_columns c where c.id = p_column_id
  ) then raise exception 'Column does not exist'; end if;

  if p_user_id is not null and not exists (
    select 1 from public.journal_profiles p
    where p.id=p_user_id and p.is_active=true and (
      p.role='admin' or
      (p.role='editor' and exists (
        select 1 from public.journal_author_permissions perms
        where perms.user_id=p.id and perms.can_write_column=true
      ))
    )
  ) then raise exception 'Account lacks columnist permission'; end if;

  update public.journal_columns
  set columnist_id=p_user_id, updated_at=now()
  where id=p_column_id;
end;
$$;
revoke all on function public.journal_admin_link_column_account(uuid,uuid)
  from public, anon;
grant execute on function public.journal_admin_link_column_account(uuid,uuid)
  to authenticated;

-- ========== SECTION 2 — editor/database/journal-column-ownership-guard.sql ==========
-- MOVE&TRY | Journal column ownership enforcement (stage 2)
-- PREPARED ONLY: run AFTER journal-author-roles-and-columns.sql, and
-- only after the editor's column-mode UI and author flows are ready.
-- Existing article rows and the existing save RPC signature are preserved.

-- One assigned column per columnist account. Dual columnist+contributor is
-- represented by journal_author_permissions, NOT two Auth user accounts.
alter table public.journal_articles
  add column if not exists column_id uuid null
  references public.journal_columns(id) on delete restrict;

create index if not exists journal_articles_column_id_idx
  on public.journal_articles(column_id);

-- Explicitly snapshot only drafts that existed BEFORE this guard was installed.
-- Without a snapshot, any future article with a null column_id would bypass
-- permission revocation via the old "legacy draft" condition.
create table if not exists public.journal_legacy_draft_snapshot (
  article_id uuid primary key references public.journal_articles(id) on delete cascade,
  author_id uuid not null,
  category text not null,
  captured_at timestamptz not null default now()
);
revoke all on public.journal_legacy_draft_snapshot from anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_trigger
    where tgname = 'journal_enforce_author_capabilities_trigger'
      and tgrelid = 'public.journal_articles'::regclass
  ) then
    insert into public.journal_legacy_draft_snapshot (article_id, author_id, category)
      select id, author_id, category
      from public.journal_articles
      where status in ('draft', 'revision')
    on conflict (article_id) do nothing;
  end if;
end
$$;

create or replace function public.journal_enforce_author_capabilities()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text;
  actor_active boolean;
  writer_column boolean;
  writer_contributor boolean;
  assigned_column uuid;
begin
  -- Internal maintenance/service operations with no end-user JWT are
  -- governed by existing database privileges and RLS.
  if actor_id is null then
    return new;
  end if;

  select p.role, p.is_active
    into actor_role, actor_active
  from public.journal_profiles p where p.id = actor_id;

  if actor_role is null or actor_active is distinct from true then
    raise exception 'Nemate aktivan urednicki pristup';
  end if;

  -- Never create an article under somebody else's identity.
  if TG_OP = 'INSERT' and new.author_id is distinct from actor_id then
    raise exception 'Ne mozete pisati u ime drugog autora';
  end if;

  if TG_OP = 'UPDATE' and new.author_id is distinct from old.author_id then
    raise exception 'Promjena autora clanka nije dopustena';
  end if;

  -- The column / standalone-publication identity is fixed after creation.
  -- Ordinary contributor category changes remain possible.
  if TG_OP = 'UPDATE'
     and ((old.category = 'personal' and new.category <> 'personal')
          or (old.category <> 'personal' and new.category = 'personal')) then
    raise exception 'Nije moguce promijeniti vrstu clanka nakon stvaranja';
  end if;

  if actor_role = 'admin' then
    -- Column = actual public columnist identity; author_id = editor who
    -- created the record. Never pretend Nina used the editor.
    if new.category = 'personal' then
      if TG_OP = 'INSERT' then
        -- Preserve backwards compatibility for existing production editors
        -- creating a personal (non-column-linked) draft. The new Journal UI
        -- always supplies column_id for externally attributed content.
        if new.column_id is not null and not exists (
          select 1 from public.journal_columns c
          where c.id=new.column_id and c.is_active=true
        ) then
          raise exception 'Odabrana kolumna nije aktivna';
        end if;
      elsif old.category = 'personal' then
        if new.column_id is distinct from old.column_id then
          raise exception 'Nije moguce promijeniti kolumnu postojeceg clanka';
        end if;
      else
        raise exception 'Ne mozes pretvoriti postojeci clanak u kolumnu';
      end if;
    else
      new.column_id := null;
    end if;
    return new;
  end if;

  if actor_role <> 'editor' or new.author_id is distinct from actor_id then
    raise exception 'Nemate autorsku ovlast za ovaj clanak';
  end if;

  select p.can_write_column, p.can_contribute
    into writer_column, writer_contributor
  from public.journal_author_permissions p
  where p.user_id = actor_id;

  -- Only pre-migration drafts are grandfathered, and only while the author
  -- STILL holds the appropriate capability. Revoked writers cannot use this.
  if TG_OP = 'UPDATE' and old.column_id is null
     and old.category = new.category
     and exists (
       select 1 from public.journal_legacy_draft_snapshot legacy
       where legacy.article_id = old.id
         and legacy.author_id = actor_id
         and legacy.category = old.category
     )
     and ((old.category = 'personal' and writer_column is true)
          or (old.category <> 'personal' and writer_contributor is true)) then
    new.column_id := null;
    return new;
  end if;

  if new.category = 'personal' then
    if writer_column is distinct from true then
      raise exception 'Nemate ovlast kolumnista';
    end if;
    select c.id into assigned_column
    from public.journal_columns c
    where c.columnist_id = actor_id and c.is_active = true;
    if assigned_column is null then
      raise exception 'Kolumna vam jos nije dodijeljena';
    end if;
    if TG_OP = 'UPDATE' and old.column_id is not null
       and old.column_id is distinct from assigned_column then
      raise exception 'Kolumnu nije moguce promijeniti';
    end if;
    new.column_id := assigned_column;
  else
    if writer_contributor is distinct from true then
      raise exception 'Nemate ovlast suradnika';
    end if;
    new.column_id := null;
  end if;

  return new;
end;
$$;

drop trigger if exists journal_enforce_author_capabilities_trigger
  on public.journal_articles;

create trigger journal_enforce_author_capabilities_trigger
before insert or update of title, excerpt, content, category, cover_image, column_id
on public.journal_articles
for each row
execute function public.journal_enforce_author_capabilities();

revoke all on function public.journal_enforce_author_capabilities()
  from public, anon, authenticated;

-- ========== SECTION 3 — editor/database/journal-offline-column-drafts.sql ==========
-- MOVE&TRY The Journal — write editorial drafts for PUBLIC columnists
-- who do not need their own account. STAGED ONLY.
-- Prerequisite: journal-author-roles-and-columns.sql and
-- journal-column-ownership-guard.sql, in that order.
-- author_id tracks the real logged-in creator, while column_id tracks
-- the public columnist. Original version/audit triggers remain active.

create or replace function public.journal_admin_create_column_draft(
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
  v_id uuid;
begin
  if auth.uid() is null or not exists (
    select 1 from public.journal_profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.is_active = true
  ) then
    raise exception 'Samo aktivni administrator moze pisati za vanjske autore';
  end if;

  if not exists (
    select 1 from public.journal_columns c
    where c.id = p_column_id and c.is_active = true
  ) then
    raise exception 'Odabrana kolumna nije dostupna';
  end if;

  insert into public.journal_articles (
    author_id, column_id, title, excerpt, content,
    category, cover_image, status
  )
  values (
    auth.uid(), p_column_id, coalesce(p_title, ''),
    p_excerpt, coalesce(p_content, ''),
    'personal', p_cover_image, 'draft'
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.journal_admin_create_column_draft(
  uuid,text,text,text,text
) from public,anon;
grant execute on function public.journal_admin_create_column_draft(
  uuid,text,text,text,text
) to authenticated;

-- ========== SECTION 4 — editor/database/journal-admin-ready-for-publication.sql ==========
-- MOVE&TRY The Journal | Administrator prepares own/offline-column drafts
-- STAGED ONLY. This does NOT publish a public HTML page.
-- Existing version/history/status triggers remain active.

create or replace function public.journal_admin_mark_ready(
  p_article_id uuid,
  p_expected_revision bigint
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
    where p.id = auth.uid() and p.role='admin' and p.is_active=true
  ) then
    raise exception 'Nemas administratorsku ovlast';
  end if;

  if p_expected_revision is null then
    raise exception 'Nedostaje broj revizije';
  end if;

  -- Can only approve drafts the administrator personally created.
  -- Never bypass the approval workflow for an external contributor.
  update public.journal_articles
  set status='approved'
  where id=p_article_id
    and author_id=auth.uid()
    and status in ('draft','revision')
    and revision_number=p_expected_revision
  returning id into v_id;

  if v_id is null then
    raise exception 'Skica nije dostupna ili je revizija promijenjena';
  end if;
end;
$$;

revoke all on function public.journal_admin_mark_ready(uuid,bigint)
  from public,anon;
grant execute on function public.journal_admin_mark_ready(uuid,bigint)
  to authenticated;

-- Guard checks run inside the transaction and abort everything on failure.
do $checks$
declare
  v_col_nullable boolean;
  v_guard_exists boolean;
  v_publish_rpc boolean;
begin
  select (c.is_nullable = 'YES') into v_col_nullable
  from information_schema.columns c
  where c.table_schema='public'
    and c.table_name='journal_columns'
    and c.column_name='columnist_id';
  if v_col_nullable is distinct from true then
    raise exception 'Public columnists must NOT require editor accounts';
  end if;

  select exists (
    select 1 from pg_catalog.pg_trigger t
    where t.tgrelid='public.journal_articles'::regclass
      and t.tgname='journal_enforce_author_capabilities_trigger'
      and not t.tgisinternal
  ) into v_guard_exists;
  if not v_guard_exists then
    raise exception 'Journal author role enforcement trigger missing';
  end if;

  select to_regprocedure('public.journal_admin_create_column_draft(uuid,text,text,text,text)')
    is not null into v_publish_rpc;
  if not v_publish_rpc then
    raise exception 'Offline columnist draft function is missing';
  end if;
end;
$checks$;

commit;
