begin;

create or replace function public.journal_delete_draft_checked(
  p_article_id uuid,
  p_expected_revision bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_deleted_id uuid;
begin
  select p.role::text into v_role
  from public.journal_profiles p
  where p.id = v_actor and p.is_active;

  if v_role is null then
    raise exception 'Nemaš ovlast za brisanje nacrta.';
  end if;

  delete from public.journal_articles a
  where a.id = p_article_id
    and a.revision_number = p_expected_revision
    and a.status = 'draft'
    and a.published_at is null
    and a.scheduled_at is null
    and (a.author_id = v_actor or v_role = 'admin')
  returning a.id into v_deleted_id;

  if v_deleted_id is null then
    raise exception 'Nacrt više nije dostupan za brisanje ili je u međuvremenu izmijenjen.';
  end if;
end;
$$;

revoke all on function public.journal_delete_draft_checked(uuid, bigint)
  from public, anon;
grant execute on function public.journal_delete_draft_checked(uuid, bigint)
  to authenticated;

commit;
