-- MOVE&TRY | Journal column ownership enforcement (stage 2)
-- PREPARED ONLY: run AFTER journal-author-roles-and-columns.sql, and
-- only after the editor's column-mode UI and author flows are ready.
-- Existing article rows and the existing save RPC signature are preserved.
begin;

-- One assigned column per columnist account. Dual columnist+contributor is
-- represented by journal_author_permissions, NOT two Auth user accounts.
create unique index if not exists journal_columns_one_per_writer_idx
  on public.journal_columns(columnist_id);

alter table public.journal_articles
  add column if not exists column_id uuid null
  references public.journal_columns(id) on delete restrict;

create index if not exists journal_articles_column_id_idx
  on public.journal_articles(column_id);

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

  if actor_role = 'admin' then
    -- Administrator may edit manuscripts, but their original author
    -- is immutable. A column article is linked to its REAL columnist.
    if new.category = 'personal' then
      select c.id into assigned_column
      from public.journal_columns c
      where c.columnist_id = new.author_id and c.is_active = true;
      if assigned_column is not null then
        new.column_id := assigned_column;
      elsif TG_OP = 'INSERT' then
        raise exception 'Prije pisanja kolumne dodijelite vlastitu kolumnu';
      elsif old.column_id is not null then
        raise exception 'Kolumna vise nije aktivna';
      end if;
      -- Legacy drafts without a column stay editable until assignment.
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
before insert or update
on public.journal_articles
for each row
execute function public.journal_enforce_author_capabilities();

revoke all on function public.journal_enforce_author_capabilities()
  from public, anon, authenticated;

commit;
