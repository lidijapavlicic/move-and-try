# MOVE&TRY | The Journal: controlled author-role rollout

**Status: STAGED, NOT DEPLOYED. No merge to main before tests.**

## Order (do not skip)
1. Back up table structure and verify existing articles, users, and seven pre-existing article triggers.
2. Apply `journal-author-roles-and-columns.sql`. This prepares permissions/columns, seeds existing editors, creates *admin-only* RPCs. Does not touch existing save RPCs.
3. Verify count/roles and signatures in `journal_author_permissions`. Existing authors remain active as before. Admin account is unchanged.
4. Apply `journal-column-ownership-guard.sql` only in a controlled window. It snapshots pre-existing drafts and adds a `column_id` and a writing-permission trigger. Check new trigger does not conflict with revision/version/audit triggers.
5. Deploy **new** Supabase Edge Function `journal-invite-collaborator-v2` from the staged source. Do not overwrite live `journal-invite-collaborator`.
6. Deploy Cloudflare Pages **Preview** from PR #3, never main. Log in as admin and inactive/active test authors. Use test articles and no real invitations.
7. Check dashboard/admin, add column, assign permissions and public byline. Create/save/reopen personal and contributor test articles; test dual-role writer switching.
8. Test unauthorized RPC: ordinary author cannot assign privileges, create a column or change somebody else's column or article.
9. Test revocation after save, account deactivation, existing legacy draft edit, revision conflicts, autosave recovery, cover and inline photos, and article approval/status changes.
10. Only when all scenarios pass: deploy production Edge Function v2, choose rollout/merge steps, and monitor. Do not merge directly from an untested Preview.

## Known implementation boundary
- User-provided `journal_save_draft_bilingual_checked` body and SECURITY DEFINER result uuid were reviewed. Existing RPC signature is not replaced.
- Editor SQL guards use `auth.uid()` and active `journal_profiles` roles. Browser UI is not a security boundary.
- Existing test accounts are expected to be used before real collaborators. An inactive test account requires explicit admin reactivation for auth tests.
- Public article export, automatic publishing, media conversion, and final public byline snapshots are separate future integration work.
- **Manual verification is required**: no connected live Supabase/Cloudflare test executor is available to validate these deployments here.
