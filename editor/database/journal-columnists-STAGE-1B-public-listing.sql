-- MOVE&TRY The Journal | STAGE 1B — controlled public-column readiness
-- Run only after journal-columnists-STAGE-1.sql.
-- Safe: no article deletions, publication, role changes or changes to
-- existing seven article triggers. Public website sync is NOT yet enabled.
begin;
set local lock_timeout='5s';

alter table public.journal_columns
  add column if not exists public_listing_enabled boolean not null default false;

-- Editors cannot switch public visibility themselves. Administrator chooses
-- once; future public publisher shall include only columns with this flag AND
-- at least one successfully published article in journal_articles.
create or replace function public.journal_admin_set_column_public_listing(
  p_column_id uuid,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.journal_profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.is_active = true
  ) then
    raise exception 'Nemas administratorski pristup';
  end if;

  update public.journal_columns c
  set public_listing_enabled = coalesce(p_enabled,false),
      updated_at = now()
  where c.id = p_column_id;

  if not found then
    raise exception 'Kolumna nije pronadena';
  end if;
end;
$$;

revoke all on function public.journal_admin_set_column_public_listing(uuid,boolean)
  from public,anon;
grant execute on function public.journal_admin_set_column_public_listing(uuid,boolean)
  to authenticated;

commit;
