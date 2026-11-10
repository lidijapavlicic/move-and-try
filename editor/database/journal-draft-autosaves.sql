-- MOVE&TRY The Journal: non-versioned working-copy autosave
-- Apply manually in Supabase SQL Editor after reviewing against production schema.
-- This does not alter journal_articles or article_versions.
begin;

create table if not exists public.journal_draft_autosaves (
  owner_id uuid not null references auth.users(id) on delete cascade,
  draft_key text not null check (char_length(draft_key) between 1 and 100),
  article_id uuid null references public.journal_articles(id) on delete cascade,
  base_revision bigint null,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  saved_at timestamptz not null default now(),
  primary key (owner_id, draft_key)
);

create index if not exists journal_draft_autosaves_article_id_idx
  on public.journal_draft_autosaves(article_id);

alter table public.journal_draft_autosaves enable row level security;

-- Only the authenticated owner of the working copy can see or change it.
-- The canonical article is still governed by its existing author/admin policies.
drop policy if exists journal_autosave_select_own on public.journal_draft_autosaves;
create policy journal_autosave_select_own
  on public.journal_draft_autosaves for select to authenticated
  using (
    owner_id = (select auth.uid()) and exists (
      select 1 from public.journal_profiles p
      where p.id = (select auth.uid()) and p.is_active = true
    )
  );

drop policy if exists journal_autosave_insert_own on public.journal_draft_autosaves;
create policy journal_autosave_insert_own
  on public.journal_draft_autosaves for insert to authenticated
  with check (
    owner_id = (select auth.uid()) and exists (
      select 1 from public.journal_profiles p
      where p.id = (select auth.uid()) and p.is_active = true
    ) and (
      article_id is null or exists (
        select 1 from public.journal_articles a
        where a.id = article_id
          and (
            (a.author_id = (select auth.uid()) and a.status in ('draft', 'revision'))
            or exists (
              select 1 from public.journal_profiles admin
              where admin.id = (select auth.uid())
                and admin.role = 'admin'
                and admin.is_active = true
            )
          )
      )
    )
  );

drop policy if exists journal_autosave_update_own on public.journal_draft_autosaves;
create policy journal_autosave_update_own
  on public.journal_draft_autosaves for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid()) and exists (
      select 1 from public.journal_profiles p
      where p.id = (select auth.uid()) and p.is_active = true
    ) and (
      article_id is null or exists (
        select 1 from public.journal_articles a
        where a.id = article_id
          and (
            (a.author_id = (select auth.uid()) and a.status in ('draft', 'revision'))
            or exists (
              select 1 from public.journal_profiles admin
              where admin.id = (select auth.uid())
                and admin.role = 'admin'
                and admin.is_active = true
            )
          )
      )
    )
  );

drop policy if exists journal_autosave_delete_own on public.journal_draft_autosaves;
create policy journal_autosave_delete_own
  on public.journal_draft_autosaves for delete to authenticated
  using (owner_id = (select auth.uid()));

revoke all on table public.journal_draft_autosaves from anon;
grant select,insert,update,delete on table public.journal_draft_autosaves to authenticated;

commit;
