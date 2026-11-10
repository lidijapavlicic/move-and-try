# MOVE&TRY — Journal columnists, collaborators, and public bylines

**Status:** STAGED ON PR #3; not deployed, not merged, not live-tested.

## What is implemented

- A public columnist such as **Nina** may have a column with **no Supabase Auth account**.
- The column has public title, slug and byline; `columnist_id` is optional and is an **Editor access link**, not proof of original public authorship.
- The administrator may create private drafts in Nina's column. `journal_articles.author_id` records the administrator who entered the draft; `column_id` records Nina's public column.
- Existing revision/version and activity triggers remain intact.
- A future Nina Editor account may be linked to her existing column without changing her byline, admin-created article authorship, or passwords. While assigned and active, Nina may read, edit and submit draft/revision articles of that column, including admin-created ones.
- Server autosave and Storage image policies are scoped to her assigned column; unassigned users cannot read other authors' private images.
- Admin may mark only own draft/revision articles ready for publication without sending them to themselves for approval. This changes database status, **not the public website**.
- Separate `can_write_column` and `can_contribute` capabilities. Existing editor profiles are backfilled without changing their security role or activation status.
- New invitation API is a separately versioned Edge Function and has **not** been deployed.

## Rollout — only once ready to test

1. Confirm Supabase database backup or restore plan. Make sure no real contributors are editing during migration.
2. In Supabase SQL Editor, run the **entire** `journal-columnists-ONE-TRANSACTION.sql` from this folder, in a single query. It creates all new tables/RPCs/policies/trigger atomically or rolls back on failure.
3. Verify the SQL succeeded and that the original seven article triggers plus the new role trigger are present. Confirm existing draft and version counts.
4. Open the latest Cloudflare Pages PR #3 **Preview**, log in as admin, go to **SURADNICI**.
5. Create a test column `NINA`, choose **Bez korisničkog računa**, specify slug `nina` and byline `Nina | MOVE&TRY`.
6. Use **NOVI ČLANAK** → choose Nina's column → enter sample article, photos, save, close, reopen. Verify the public byline and editor activity are separate; test autosave after closing.
7. Use administrator edit to complete HR and EN and **SPREMNO ZA OBJAVU**; do not click the database publication buttons unless intentionally testing a fictitious sample. Public HTML publishing is still a separate later task.
8. For delegated access test, activate a disposable existing test author, assign columnist capability, link that account to NINA, log in as test author and verify it can read/edit/submit Nina's earlier draft. Then unlink; verify access is revoked. Never use a real Nina's email for testing.
9. Negative tests: anonymous or ordinary contributor cannot modify permissions, columns, assigned articles or other users' images. Check all existing revision and activity triggers continue to work.
10. Only after those tests: deploy the separate Edge Function `journal-invite-collaborator-v2` and test an invitation to a disposable address. Never overwrite existing production invitation handler before a verified rollout.
11. Leave PR #3 open until editorial publication, references/acknowledgments, public website export, PDF and notification work are tested.

## Important limitations

- Static checks of code, files and SQL block counts have been completed. Supabase SQL and Cloudflare Preview functional tests **have not** run.
- `journal_publish_or_schedule` changes database status. It **does not publish a public website article**. A secure server-side publishing pipeline still needs implementation.
- Changing a column's byline changes its current display, not a historical snapshot per publication. Publication-time byline snapshots remain to be designed.
- Pre-existing production Editor code was preserved; the migration allows legacy administrator personal drafts. New author role enforcement may affect other editors, so use the existing test account and verify before real invitations.

**Production remains untouched until the user's explicit SQL/Edge/merge steps.**
