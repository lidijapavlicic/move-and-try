-- MOVE&TRY | inherited column draft autosave authorization
-- Existing autosave schema remains intact; preserve local and server recovery.
begin;

drop policy if exists journal_autosave_insert_own
  on public.journal_draft_autosaves;
create policy journal_autosave_insert_own
  on public.journal_draft_autosaves for insert to authenticated
  with check (
    owner_id=(select auth.uid())
    and exists (
      select 1 from public.journal_profiles p
      where p.id=(select auth.uid()) and p.is_active=true
    )
    and (
      article_id is null or exists (
        select 1 from public.journal_articles a
        where a.id=article_id and (
          (a.author_id=(select auth.uid()) and a.status in ('draft','revision'))
          or exists (
            select 1 from public.journal_profiles p
            where p.id=(select auth.uid())
              and p.role='admin' and p.is_active=true
          )
          or (
            a.status in ('draft','revision')
            and exists (
              select 1 from public.journal_columns c
              join public.journal_author_permissions ap
                on ap.user_id=(select auth.uid())
              where c.id=a.column_id and c.columnist_id=(select auth.uid())
                and c.is_active=true and ap.can_write_column=true
            )
          )
        )
      )
    )
  );

drop policy if exists journal_autosave_update_own
  on public.journal_draft_autosaves;
create policy journal_autosave_update_own
  on public.journal_draft_autosaves for update to authenticated
  using (owner_id=(select auth.uid()))
  with check (
    owner_id=(select auth.uid())
    and exists (
      select 1 from public.journal_profiles p
      where p.id=(select auth.uid()) and p.is_active=true
    )
    and (
      article_id is null or exists (
        select 1 from public.journal_articles a
        where a.id=article_id and (
          (a.author_id=(select auth.uid()) and a.status in ('draft','revision'))
          or exists (
            select 1 from public.journal_profiles p
            where p.id=(select auth.uid())
              and p.role='admin' and p.is_active=true
          )
          or (
            a.status in ('draft','revision')
            and exists (
              select 1 from public.journal_columns c
              join public.journal_author_permissions ap
                on ap.user_id=(select auth.uid())
              where c.id=a.column_id and c.columnist_id=(select auth.uid())
                and c.is_active=true and ap.can_write_column=true
            )
          )
        )
      )
    )
  );

commit;
