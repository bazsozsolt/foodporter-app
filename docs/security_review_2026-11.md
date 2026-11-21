# Food Porter security review — 21 November 2026 (CET)

Read-only review of the live Supabase project `joontqbhfqjqkyhlifle`. Fixes are on branch `chore/v40-security-review` as an **unapplied** migration and client/edge-function changes. Nothing in this review was applied live, deployed, or used to change live data.

Review date: 21 Nov 2026. Advisors were run the same morning (CET).

## Method

- Live security and performance advisors (`get_advisors`).
- Live catalogues of tables, grants, RLS policies, `SECURITY DEFINER` functions (bodies, `search_path`, EXECUTE grants, trigger usage), views (`security_invoker`), storage buckets, `pg_cron` jobs, and Auth config (secrets redacted).
- Edge function source in the repo, compared with live `verify_jwt` flags.
- Repo client paths for admin reports.

## Findings by severity

### High — unauthenticated edge functions that use the service role

Several functions are deployed with `verify_jwt: false` (needed so a database trigger or `pg_cron` can call them). They then use `SUPABASE_SERVICE_ROLE_KEY`.

| Function | Live `verify_jwt` | Risk |
| --- | --- | --- |
| `order-refund` | false | The `{ order_id }` path has **no caller check**. Anyone who can POST to the function (anon key is public) can start a Mollie refund for a cancelled, paid order whose `refund_status` is still null. Bounded: it will not refund an active order, and the row is claimed atomically. Still a public refund trigger. The `{ ticket_id }` support path correctly requires an admin JWT. |
| `purge-retention` | false | Daily cron (`25 3 * * *`) posts with only `Content-Type`. The handler has no auth (comment: “needs no caller auth”). It only deletes data already past retention, but it is publicly invokable, uses the service role, and returns counts. |
| `order-push`, `order-sms` | false | Re-read current order state and dedupe (`push_log` / `sms_sent`), so spoofed calls usually do nothing. Residual: a well-timed call could send a legitimate first notification, or add load. |

**Fix on this branch (not deployed):** if the Edge secret `FP_INTERNAL_SECRET` is set, these functions require header `x-fp-internal-secret`. If the secret is unset, behaviour is unchanged, so current cron/triggers keep working. After go-live: set the secret, then update `pg_cron` / `pg_net` headers in the same window (see Decisions).

`mollie-webhook` is also `verify_jwt: false` (correct). It does not trust the body: it re-fetches the payment from Mollie, checks the EUR amount against the order total, and is idempotent. That matches Mollie’s “verify by fetch” model. Left as-is.

`create-payment` has `verify_jwt: true`, checks the user JWT, recomputes the amount server-side, and restricts CORS to the app origins. Fine.

### Medium — finance and operations reports include test orders

`report_key_metric`, `report_groups`, and `report_support` already take `p_include_test` (admin UI: “Real orders only”).

`report_payments`, `report_delivery`, `report_quality`, and `report_safety` did not. The payments/payouts screens and the Delivery/Quality/Safety tabs therefore counted test orders (including 1043/1046 once they were marked `is_test`, and the October test orders) in “real” totals.

**Fix on this branch:** those four functions now take `p_include_test boolean default true` (same default as key metric / groups, so existing 2-argument callers keep today’s behaviour). Filters use `order_facts.is_test` or `not (orders.is_test or address like 'FP TEST%')`, and `incidents.is_test` / profile `is_test` where that is the right grain. The admin UI adds the same “Real orders only” checkbox to Payments, Delivery, Quality, and Safety.

### Low — leftover table grants to `anon`

RLS is on for every `public` table. These tables had **GRANT ALL** (or write + SELECT) to `anon`, but **no anon policies**, so the Data API already returned no rows / permission failures:

- `account_status_log`, `customer_credit`, `promo_codes`, `referral_codes`

The `legal_templates_current` view is `security_invoker=true` (good) but had INSERT/UPDATE/DELETE/TRUNCATE grants to `anon` and `authenticated`. Writes were already blocked by the base table’s RLS.

**Fix on this branch:** revoke those unused `anon`/`public` grants; keep SELECT on `legal_templates_current` for the public legal pages.

### Info — advisor items that are acceptable

- **RLS enabled, no policies** on `call_config`, `push_log`, `push_vapid`, `rate_limits` (4 INFO). Grants are **service_role only**. Anon/authenticated cannot read them. This is the intended pattern for edge/cron internals (`push_vapid` holds the VAPID private key). No extra policies added (a policy is unnecessary when the role has no GRANT and is not table owner).
- **`fp_restaurant_open` executable by `anon`** (1 WARN). SECURITY DEFINER, `search_path=public`. Returns only whether a restaurant is open (hours, pause, legal “ready”). No PII. Required for the public menu before sign-in. **Kept.**
- **59 SECURITY DEFINER functions executable by `authenticated`** (WARN). See classification below. All 107 SECURITY DEFINER functions in `public` have `search_path` set. None were (c) “no check, leaks or writes without authorisation” after review. Trigger-only / internal functions already have EXECUTE revoked from `anon`/`authenticated` (granted to `service_role` only).
- **Views:** `order_facts`, `order_metrics`, `legal_templates_current` all use `security_invoker=true`. `order_facts` / `order_metrics` are SELECT for `authenticated` only (plus service_role).
- **Performance advisor:** unused indexes (incidents, legal_requests, leftover `posts`/`comments`) and “multiple permissive policies”. No index was dropped. Policy merges were left for a later pass (behaviour change risk).

## RLS review (sensitive tables)

Live policies were reviewed for over-broad SELECT/UPDATE. Highlights:

- **profiles:** users can SELECT/UPDATE only their own row (or admin). WITH CHECK pins `role = my_role()` for self-updates. Trigger `guard_profile_update` also blocks non-admins from changing `role`, `status`, `email`, `restaurant_id`, `is_test`, `created_at`. Default role is `customer`. `handle_new_user` copies only name/email from `raw_user_meta_data` — **not** role (user_metadata is not used for authorisation).
- **orders:** visible to customer, assigned rider, the restaurant (excluding `awaiting_payment` / `payment_failed`), admins, and active riders for `accepted` orders (bid window). `phone` is **not** granted for SELECT on `orders`; it is exposed only via `order_phone` to the customer, assigned rider, or admin. Field locks: `guard_order_update`, `pin_order_fields` (pins `is_test`, address, phone, timestamps for non-admins), plus tip / fee / transition / proof guards.
- **earnings / payouts / rider_hr / rider_documents / rider_onboarding / work_sessions:** SELECT own row or admin; writes are admin-only (except a rider’s own availability/shifts, which are separate). Restaurants cannot read other restaurants’ orders or any rider’s HR.
- **support tickets/messages:** owner or admin; internal messages hidden from the ticket owner.
- **settings:** SELECT is open to `anon` and `authenticated` (`USING true`). This includes fees, commission, and labour-rule numbers (no API keys). UPDATE is admin-only. Left as-is (see Decisions).
- **promo_codes:** admin-only policy (quotes go through `fp_quote_discount`, which checks `auth.uid() = p_customer`).
- **customer_credit / referral_codes:** own row or admin.

Known product behaviour, not changed: **every active rider can SELECT accepted orders**, including the delivery address, during the bid window (phone stays hidden). See Decisions.

## Storage

| Bucket | Public | Policies |
| --- | --- | --- |
| `menu-photos` | **public** (intentional; menu imagery) | Authenticated insert/update/delete/select limited to admin or `my_restaurant()` folder |
| `delivery-proof` | private, images only, 8 MiB | Read: `fp_proof_access` (assigned rider, customer, or admin). Write: assigned rider while status is `picked_up` |
| `support-photos` | private, 5 MiB | Upload and read in the caller’s own uid folder; admin may read all |

There is no separate rider-documents bucket; `rider_documents` is metadata only (kind, expiry, verified).

`storage.objects` has DML grants to `anon`, but there is no anon policy, so the API cannot read private objects. Public menu-photo URLs do not use those grants.

## Auth settings (live)

- Leaked-password protection (`password_hibp_enabled`): **on**
- Email confirmation (`mailer_autoconfirm`): **off** — confirmation is required
- Mailer OTP expiry: **900 seconds** (15 minutes; within the usual ≤1 hour guidance)
- Password minimum length: 8; current-password required on change
- JWT expiry: 3600s; refresh-token rotation **on** (reuse interval 10s)
- Rate limits visible: email 100, OTP 30, verify 30, token refresh 150
- Sign-up enabled; anonymous users off; phone auth off
- Site URL `https://app.foodporter.nl/`; additional redirect allow-list includes the GitHub Pages origin
- Captcha: **off**
- TOTP MFA enroll/verify is enabled at the project level (not required)

## v34 migration history

Repo file `20261024190000_v34_auth_null_tokens.sql` was applied out of band. Live `supabase_migrations.schema_migrations` still has no `20261024190000` / `v34_auth_null_tokens` row. A count of `auth.users` found **0** rows with NULL token columns (134 users).

The v40 migration records that version as a no-op **only if** the row is missing and no NULL tokens remain. It does not re-run the UPDATE. On a fresh database the original v34 file still runs first (it is idempotent).

## SECURITY DEFINER functions callable by signed-in users

All are class **(a)** — meant to be called by users, with an internal role / `auth.uid()` / ownership check — except as noted.

**(a) User-facing with checks** (examples): `my_role`, `my_status`, `my_restaurant`, `my_credit_cents`, `my_referral_code`, `my_legal_status`, `my_stops`, group-order helpers, `legal_accept`, `can_bid` (`my_role() = 'rider'`), `fp_may_bid` (uses `auth.uid()`), `fp_quote_discount` (rejects other customers), `order_phone` / `order_rider_info` / `order_chat_send` / `order_call` / `order_set_delivery_photo` (party or admin), `support_*` (admin or restaurant-own-order via `my_restaurant()`), `set_menu_item_image` / `set_restaurant_image` / `restaurant_set_availability` (`fp_owns_restaurant`), `fp_avg_week_hours` / `fp_rider_week` / `fp_rider_legal_status` (self or admin), `fp_payroll_week` / `fp_rest_overview` / `fp_atw_check_now` / `fp_list_stale_assignments` / `fp_anonymise_profile` / `fp_erase_account` / `support_admin_update` / `report_support` / `fp_test_reset_rate_limits` (`assert_admin` or `my_role() = 'admin'`; the rate-limit reset only deletes rows for `profiles.is_test`), push subscribe/unsubscribe, `push_public_key` (returns the **public** VAPID key only), `fp_proof_access`, `fp_chat_side`, `fp_request_account_deletion`.

**`fp_chat_open`:** no role check; returns a boolean about the chat window for an order id. Used by the chat RLS policy. Low information leak. Left as-is.

**`fp_restaurant_open`:** callable by **anon** as well; kept (see above).

**(b) Trigger-only / internal:** already revoked from `anon`/`authenticated`. Includes `notify_order_*`, `credit_rider_on_delivery`, `handle_new_user`, `fp_auth_user_deleted`, `purge_test_data`, `fp_rate_limit`, `fp_run_timeouts`, `accept_bid`, retention purges, etc.

No class **(c)** findings that required a code change in the database functions.

## Fixes on this branch

1. Migration `supabase/migrations/20261121020000_v40_security_review.sql` (unapplied): report `p_include_test`, grant tightening, v34 history no-op.
2. Admin UI: “Real orders only” on Payments, Delivery, Quality, and Safety (default unchecked = include test, same as Key metric).
3. Optional `FP_INTERNAL_SECRET` on `order-refund` (order_id path), `purge-retention`, `order-push`, and `order-sms`. **Not deployed.**
4. This document.
5. Local harness: `scripts/e2e/v40-security-review.sh`.

## Deliberately left as-is

- The four service_role-only tables without policies (documented).
- `fp_restaurant_open` executable by anon.
- The 59 authenticated SECURITY DEFINER RPCs (they have role/ownership checks; moving them out of `public` would break the app).
- `settings` readable by anon (public fee/zone config; includes labour percentages).
- Riders seeing accepted-order addresses during the bid window.
- Restaurant payouts visible only to admin (restaurants have no payouts SELECT); the admin payments screen is the intended path.
- Public `menu-photos` bucket.
- Mollie webhook “verify by fetch”.
- Leftover `posts` / `comments` tables (8 and 11 rows, template-like policies). Not dropped.
- Performance unused indexes / multiple permissive policies.
- Auth captcha off; MFA optional.
- Dashboard home still calls delivery/payments reports with the default (include test).

## Decisions for Zsolt

1. **When to apply v40 and deploy.** Migration + gh-pages together, after you are happy with this review. Do not apply only the migration or only the client.
2. **`FP_INTERNAL_SECRET`.** Recommended. Set it as an Edge Function secret, then update the `pg_cron` `purge-retention` job and the `pg_net` calls in `notify_order_refund` / push / SMS triggers to send `x-fp-internal-secret`. Do that in the same change window as the function deploy, or leave the secret unset so nothing breaks.
3. **Hide delivery addresses from unassigned riders?** Today every active rider can see `accepted` orders, including the address (not the phone). We can tighten that if you want.
4. **Hide labour/payroll fields in `settings` from anon?** Fees need to be public; CAO/pension rates do not strictly need to be.
5. **Drop or lock down leftover `posts`/`comments`?**
6. **Turn on hCaptcha** for sign-up / recovery?
