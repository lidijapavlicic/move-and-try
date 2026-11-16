-- MOVE&TRY | Allow one Editor account to write several Journal columns.
-- Apply before releasing the editor's column selector. Existing clients
-- can keep saving to a single assigned column, and existing rows keep their IDs.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_trigger t
    where t.tgrelid = 'public.journal_articles'::regclass
      and t.tgname = 'journal_enforce_author_capabilities_trigger'
      and t.tgfoid = to_regprocedure('public.journal_enforce_author_capabilities()')
      and t.tgenabled in ('O', 'A')
      and not t.tgisinternal
  ) then
    raise exception 'Najprije instaliraj aktivni Journal trigger za autorske ovlasti';
  end if;
end;
$$;

-- Keep lookups indexed after allowing the same account on multiple rows.
create index if not exists journal_columns_columnist_idx
  on public.journal_columns(columnist_id);
drop index if exists public.journal_columns_columnist_unique_idx;

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
  assigned_columns uuid[];
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

  if actor_role <> 'editor' then
    raise exception 'Nemate autorsku ovlast za ovaj clanak';
  end if;

  -- A linked columnist can continue the pre-existing drafts of this column,
  -- even when the administrator originally created them. The stored author_id
  -- (original creator) is not overwritten; edit logs use the current JWT.
  if new.author_id is distinct from actor_id and not (
    TG_OP = 'UPDATE'
    and new.category='personal'
    and old.column_id is not null
    and exists (
      select 1 from public.journal_columns c
      join public.journal_author_permissions perms
        on perms.user_id=actor_id
      where c.id=old.column_id
        and c.columnist_id=actor_id
        and c.is_active=true
        and perms.can_write_column=true
    )
  ) then
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
    if TG_OP = 'UPDATE' and old.column_id is not null then
      if new.column_id is not null and new.column_id is distinct from old.column_id then
        raise exception 'Kolumnu nije moguce promijeniti';
      end if;
      new.column_id := old.column_id;
    end if;

    -- Old clients omit the column on INSERT. One active assignment remains
    -- an unambiguous default. With several, the new client must supply one.
    if new.column_id is null then
      select array_agg(c.id) into assigned_columns
      from public.journal_columns c
      where c.columnist_id = actor_id and c.is_active = true;
      if assigned_columns is null then
        raise exception 'Kolumna vam jos nije dodijeljena';
      end if;
      if cardinality(assigned_columns) > 1 then
        raise exception 'Odaberi kolumnu prije spremanja';
      end if;
      new.column_id := assigned_columns[1];
    end if;

    perform 1 from public.journal_columns c
    where c.id = new.column_id
      and c.columnist_id = actor_id and c.is_active = true
    for share;
    if not found then
      raise exception 'Odabrana kolumna nije dostupna';
    end if;
  else
    if writer_contributor is distinct from true then
      raise exception 'Nemate ovlast suradnika';
    end if;
    new.column_id := null;
  end if;

  return new;
end;
$$;

revoke all on function public.journal_enforce_author_capabilities()
  from public, anon, authenticated;

-- The Editor calls this only on first save of an author's new column draft.
-- Later saves keep calling the existing revision-checked RPCs.
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
  if actor_id is null or not exists (
    select 1 from public.journal_profiles p
    where p.id = actor_id and p.role = 'editor' and p.is_active = true
  ) then
    raise exception 'Nemas aktivan urednicki pristup';
  end if;
  if p_column_id is null then
    raise exception 'Odaberi kolumnu prije spremanja';
  end if;

  -- The existing insert trigger validates the columnist capability and
  -- locks and checks the selected active assignment before inserting.
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

notify pgrst, 'reload schema';
commit;
