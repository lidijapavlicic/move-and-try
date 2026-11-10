-- MOVE&TRY The Journal — write editorial drafts for PUBLIC columnists
-- who do not need their own account. STAGED ONLY.
-- Prerequisite: journal-author-roles-and-columns.sql and
-- journal-column-ownership-guard.sql, in that order.
-- author_id tracks the real logged-in creator, while column_id tracks
-- the public columnist. Original version/audit triggers remain active.
begin;

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

commit;
