-- MOVE&TRY The Journal | Administrator prepares own/offline-column drafts
-- STAGED ONLY. This does NOT publish a public HTML page.
-- Existing version/history/status triggers remain active.
begin;

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

commit;
