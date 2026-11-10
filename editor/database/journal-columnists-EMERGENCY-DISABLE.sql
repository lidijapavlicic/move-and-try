-- MOVE&TRY — emergency disable of new Journal columnist rules.
-- Run ONLY if the new columnist migration disrupts existing editing.
-- Does not delete any article, column, account, autosave or uploaded photo.
begin;

drop trigger if exists journal_enforce_author_capabilities_trigger
  on public.journal_articles;

-- Keep existing seven article audit/version triggers untouched.
-- Read-only extra columnist access can be disabled separately, if needed:
drop policy if exists journal_columnist_read_assigned_articles
  on public.journal_articles;

commit;
