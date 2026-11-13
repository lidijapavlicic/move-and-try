begin;

create or replace function public.journal_delete_unpublished_article_checked(
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
  v_article public.journal_articles%rowtype;
begin
  select p.role::text into v_role
  from public.journal_profiles p
  where p.id = v_actor and p.is_active;

  if v_role is null then
    raise exception 'Nemaš ovlast za brisanje članka.';
  end if;

  select a.* into v_article
  from public.journal_articles a
  where a.id = p_article_id
    and a.revision_number = p_expected_revision
    and (a.author_id = v_actor or v_role = 'admin')
  for update;

  if not found or v_article.published_at is not null or not coalesce(
    (v_article.status in ('draft', 'submitted', 'revision', 'approved')
      and v_article.scheduled_at is null)
    or (v_article.status = 'scheduled'
      and v_article.scheduled_at > pg_catalog.clock_timestamp()),
    false
  ) then
    raise exception 'Članak više nije dostupan za brisanje ili je u međuvremenu izmijenjen.';
  end if;

  delete from public.journal_articles where id = v_article.id;
end;
$$;

revoke all on function public.journal_delete_unpublished_article_checked(uuid, bigint)
  from public, anon;
grant execute on function public.journal_delete_unpublished_article_checked(uuid, bigint)
  to authenticated;

commit;
