# QA v36/v37: account deletion cleanup (2026-11-19, Europe/Amsterdam)

Live project `joontqbhfqjqkyhlifle`. No app code change and no redeploy for v37.
Repo after this work: migration `supabase/migrations/20261119140000_v37_erase_no_storage_delete.sql` plus the local erase-cleanup harness updates.

## What went live

**v36** (`20261119120000_v36_auth_delete_cleanup.sql`, applied as version `20261119121632`, name `v36_auth_delete_cleanup`) at 13:16 CET.
Deletes the profile when an auth user is removed (admin RPC or dashboard/API `deleteUser`). Keeps orders, earnings, payouts and customer credit with amounts and payment ids unchanged; anonymises in-window personal fields; closes and scrubs the privacy ticket. Commission is skipped only with a transaction-local `fp.erasure=on` flag (the `orders_zz_commission` trigger stays enabled). Admins and the owners of orders 1043/1046 are refused.

Live gh-pages deploy of the v36 UI copy (“Delete login & profile”) was already done earlier today: build id `20261119121757`, gh-pages commit `6d89325106`. That deploy is unchanged.

**v36 live erase failed.** `fp_erase_account` raised `Direct deletion from storage tables is not allowed. Use the Storage API instead.` because cleanup issued `DELETE FROM storage.objects`. That hits Supabase’s statement-level `protect_objects_delete` trigger even when zero rows match. The transaction rolled back. The leftover throwaway `cdtecniek.bouw+fpv36-1795090777870@gmail.com` (id `77a9afee-e62b-4888-b649-08d4ecd1f711`, privacy ticket 566) was left intact and used as the v37 retest subject. Until v37, any auth-user delete would fail the same way.

**v37** (`20261119140000_v37_erase_no_storage_delete.sql`, applied as version `20261119130956`, name `v37_erase_no_storage_delete`) at 14:09 CET.
Redefines only `fp_cleanup_deleted_user`. It never issues a direct delete against `storage.objects` and does not set `storage.allow_delete_query`. Expired delivery-proof paths are still cleared on the order. Storage objects have their `owner` / `owner_id` / `user_metadata` detached via `UPDATE` (live check: the only UPDATE trigger is `update_objects_updated_at`; RLS is on but `FORCE ROW LEVEL SECURITY` is off). Support tickets already past the 2-year window are anonymised and left in place so `fp_expired_support_photos` can still see `photo_path`. Everything else from v36 is unchanged.

## How expired files are actually purged

The existing nightly job is healthy and was not changed. Cron `fp-purge-proofs` at 03:25 calls the `purge-retention` edge function (`supabase/functions/purge-retention/index.ts`), which deletes files through the Storage API (`storage.from("delivery-proof").remove(...)` and `support-photos`) and then RPCs `fp_expired_proofs`, `fp_expired_support_photos`, and `fp_purge_support_chat`. That is not a direct SQL delete, so `protect_objects_delete` does not fire.

- Delivery proofs: `fp_expired_proofs` left-joins `storage.objects` to orders on `delivery_photo_path` and falls back to `storage.objects.created_at` when the path was already nulled during erase.
- Support photos: `fp_expired_support_photos` needs `support_messages.photo_path` and the ticket still present (resolved, `resolved_at` older than 2 years). That is why v37 no longer deletes those expired tickets during erase.

Files already expired at erase time therefore remain in Storage until the next successful nightly purge (normally shortly after 03:25 Europe/Amsterdam).

## Local tests (Postgres 17 throwaway, then cluster stopped)

- `scripts/e2e/erase-cleanup.sh` (fixture now stubs `protect_objects_delete` so a direct `DELETE` raises unless `storage.allow_delete_query='true'`; v36 then v37 applied; all assertions passed, including “direct delete blocked even with zero rows”).
- `node --experimental-strip-types scripts/e2e/auth-rules.test.mjs`: 30/30 passed (pre-existing typeless-package warning only).
- Full migration chain: 82 SQL files on a stubbed local platform, then a re-apply of v37. `fp_cleanup_deleted_user` stayed `SECURITY DEFINER`, had the owner `UPDATE`, and had no `DELETE FROM storage.objects`.
- Local cluster stopped afterwards (14:08 CET).

## Pre-apply safety

Management API backup list re-checked at 14:08 CET: 8 completed daily physical backups 12–19 Nov 2026, region eu-west-1, WAL-G on, PITR off. Latest still present: id `2313106006` at 2026-11-19 08:21:56 CET. Logical copy of the live v36 `fp_cleanup_deleted_user` body saved under `/workspace/fptest/v37/backup/` (sha256 `40250a3c42e77b7f07888e975b7c3fa0d6963cb6189e5061ec23c5893425857e`), including the two storage `DELETE` statements that v37 removes.

## Post-apply verification (live)

- Triggers enabled (`tgenabled = O`): `on_auth_user_deleted` on `auth.users`, `orders_zz_commission` on `public.orders`. `protect_objects_delete` still enabled on `storage.objects`.
- Function security unchanged: cleanup and `fp_auth_user_deleted` are `SECURITY DEFINER` with `search_path=public, auth`, execute for `postgres` / `service_role` / `supabase_auth_admin` only. `fp_erase_account` / `fp_anonymise_profile` still executable by `authenticated` (they call `assert_admin`). `fp_order_commission` and `fp_legal_immutable` unchanged.
- Orders 1043 / 1046 checksums unchanged after apply, after the leftover-user erase, and after the follow-up live tests:
  - 1043 sha256 `b858c4cd50be6ca0e925e30a56185883a07bd0b93a78bf9bde8cdf5f03a77a06` md5 `3ba1153f9f9284ce28a29d714bddc3b9` (delivered, subtotal 1350, fee 295, commission 162, 12%, Mollie `tr_iqsM5tsorBBg7A6Luh7YJ`)
  - 1046 sha256 `2ffadc6876cd846f720ad15914e6b6fe03190fb936c67a896af31bba64e01693` md5 `160ba44c1ba18c57c2e1604548a9663e` (delivered, subtotal 1150, fee 295, commission 138, 12%, Mollie `tr_X3dZwJPAiQ97RpKZpf7YJ`)
- Security advisors: nothing new. Same 4 INFO `rls_enabled_no_policy` tables (`call_config`, `push_log`, `push_vapid`, `rate_limits`), 1 WARN `fp_restaurant_open` executable by `anon`, 58 WARN authenticated `SECURITY DEFINER` functions. Finding names unchanged versus the post-v36 set.

## Live erase retests (throwaway only, no Mollie, 1043/1046 not touched)

1. Existing v36 leftover `cdtecniek.bouw+fpv36-1795090777870@gmail.com` (id `77a9afee-e62b-4888-b649-08d4ecd1f711`, `is_test=true`, ticket 566). Admin `fp_erase_account` succeeded at 14:11:18 CET. Login gone (`auth.users` row absent), profile gone, ticket 566 closed and detached, subject `Accountverwijdering afgehandeld`, message rewritten to the standard scrubbed text, no email/name leak in the body.
2. `scripts/e2e/erase.e2e.mjs`: 11/11 passed at 14:11:30 CET (throwaway created here, customer/self/admin/protected-owner refusals, admin erase, login and profile gone, no open privacy ticket). Privacy ticket 567 was closed and scrubbed as designed.
3. Plain admin `deleteUser` on a second throwaway `cdtecniek.bouw+fpv37-du-1795093904846@gmail.com` (id `1b6edf37-6052-4c7b-b01d-03a6d3e82987`, `is_test=true`): 6/6 passed at 14:11:44 CET. Login and profile removed.

Cleanup: no leftover auth users or profiles for those test emails/ids. Tickets 566 and 567 remain as resolved, anonymised privacy records under the 2-year retention rule (no personal data in subject/body/created_by). No app redeploy.

## Follow-ups (not done here)

- Ask Zsolt whether to run `next upgrade --agent=security` for Next.js 16.4.3 (today’s first `next build` stopped on `SecurityFatalError`; a retry of the same command then succeeded). Not run unless he agrees, and only in a separate worktree.
- Lawyer question still open: employment / HR rows are deleted during erase.
- Admin Promos page totals undercount after `customer_credit.reason` is set to `'erased'` (checkout sums by `customer_id` are fine).
- Live migration history still has no recorded v34 (`v34_auth_null_tokens`); do not re-apply earlier migrations.
- The four RLS-on-no-policy tables and `fp_restaurant_open` for `anon` remain pre-existing advisor items.
