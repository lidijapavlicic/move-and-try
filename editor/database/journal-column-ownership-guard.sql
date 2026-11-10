-- MOVE&TRY | Journal column ownership enforcement (stage 2)
-- PREPARED ONLY: run AFTER journal-author-roles-and-columns.sql, and
-- only after the editor's column-mode UI and author flows are ready.
-- Existing article rows and the existing save RPC signature are preserved.
begin;

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
        if new.column_id is null or not exists (
          select 1 from public.journal_columns c
          where c.id=new.column_id and c.is_active=true
        ) then
          raise exception 'Odaberi aktivnu kolumnu prije spremanja';
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

commit;
