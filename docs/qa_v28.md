# v28 full audit (18 Oct 2026, times EEST unless noted)
Box: no restart since v27 (up 14 h); node_modules, Playwright headless shell, Chrome, gh, /tmp/ghp2, /tmp/site, test photo all present.

## Phase 1 – Health
- Live version.json = local build 20261017105052.
- 1000 static pages (incl. restaurant pages) all 200; 49 legal files (index.json HTML + every PDF version) all 200.
- sw.js, manifest, version.json served; freshness.ts polls version.json (no-store) for the update prompt.
- Edge functions: create-payment v22 (verify_jwt), mollie-webhook v12, order-push v6, order-refund v4, order-sms v2, purge-retention v2.
- Cron (10 jobs), last 24 h: 0 failed runs. fp-purge-status-log (03:35 UTC = 05:35 Amsterdam) ran OK (account_status_log > 2 years).
  fp-purge-proofs → purge-retention HTTP 200 at 03:25 UTC: removed 0 photos, 0 tickets, 0 chat (nothing due yet). fp-purge-locations OK (7 days).
- Logs 24 h: one API 500 = support_create rate limit during the support e2e. Cause: fp_rate_limit raises SQLSTATE P0429, which
  PostgREST maps to 500. Fix in phase 6: PT429 → HTTP 429. Other DB messages are expected test denials (RLS, admin only, push_log de-dup).

## Phase 2 – Security
- Advisors: security = same 62 functions as the v25 baseline, no new lint types (WARN anon/auth security-definer executable,
  leaked-password protection needs Pro). Performance: INFO unused indexes only.
- SECURITY DEFINER review (v26/v27): credit_rider_on_delivery and fp_partner_since_on_sign are trigger-only (no execute
  for anon/authenticated). report_payments, fp_payroll_week, mark_rider_payout and mark_restaurant_payout call assert_admin();
  fp_rider_week checks the caller. fp_commission_rate, fp_delivery_fee and fp_order_commission are invoker calculators/triggers.
  All pin search_path=public.
- Views order_facts, order_metrics and legal_templates_current are security_invoker (RLS applies).
- NEW scripts/e2e/rls.e2e.mjs: anon + HOST/OUTSIDER/STAFF/RIDER/SIMR1/ADMIN × 40 tables/views. Every visible row must belong
  to the caller (or to an order it is a party of). orders.phone not selectable. Non-admin cannot update settings, self-promote
  to admin, insert earnings/payouts, or call report/payroll/payout RPCs. Anon cannot insert orders. **225/225 PASS.**
- Storage: support-photos and delivery-proof private (own folder / fp_proof_access), menu-photos public read with writes limited
  to the own restaurant folder; size and MIME limits on all 3 buckets.
- Bundle: no service_role, sb_secret key, Mollie/Twilio/VAPID secrets, private keys or JWTs. (The only "sb_secret_" hit is
  supabase-js's prefix check.) Only .env.example is git-tracked.
- XSS: React escapes everywhere. dangerouslySetInnerHTML only renders same-origin legal HTML from admin-only template rows.
  **FIXED:** PhotoCredits made an href from menu_items.image_credit (restaurant-writable); now only http(s) URLs become links.
- Edge functions without gateway JWT: mollie-webhook re-fetches the payment from Mollie; order-push and order-sms re-read state
  and de-duplicate (spoof-safe); order-refund getUser + admin; purge-retention has no auth by design (idempotent, only past-retention).
- Rate limits: order_call 10/h, order_chat 40/10 min, support 6/h (SOS 5/h), support_reply 30/10 min; promo brute force → audit e2e.
  **FIXED (live DB):** fp_rate_limit SQLSTATE P0429 → PT429, so PostgREST returns HTTP 429 instead of 500
  (migration 20261018090000; v13.ui mock updated).
- Verified live: 7th support ticket within the hour → **HTTP 429** code PT429 with the same NL message (it was 500).
  This created 6 "test rate-limit status" tickets on the OUTSIDER test account.

## Phase 3 – Payments / money
- Suites (sequential, load < 1): v26 36/36, v27 26/26, cross 66/66 (tamper, Mollie amount = breakdown, partial/full refunds
  capped at paid − refunded, rider keeps bonus + tip after refunds, reconciliation), tips 10/10, promo 34/34, group 47/47,
  pickup 15/15, support 40/40 (refund requests, SOS), audit 42/42 (promo brute force 429). **316/316.**
- DB-wide reconciliation over all 321 delivered orders (excl. 1043/1046):
  - charge = restaurant net + rider (bonus + tip) + platform share: 0 mismatches;
  - rider earnings rows = bonus + tip: 0 mismatches, 0 duplicate earnings, 0 earnings on pickup;
  - commission_cents = subtotal × pct: 0 off;
  - since v26 every pct ∈ {25, 20, 10} and every real delivery fee ∈ {249, 349, 499};
  - all 24 orders with a stored bonus have bonus = min(fee, €0.50);
  - no refund above the charged amount.
- Service fee 0 on 14 delivery orders from 17 Oct 09:15–10:34 UTC: all are tr_sim_* fixtures (cross/chat-admin mark orders paid
  as admin, no fee_km), not create-payment checkouts. Every real checkout since v26 carries €0.99. Not a bug.
- Orders 1431/1432 (14 Oct, pre-v26) are flagged is_test=false; left untouched → for Zsolt.
- Payouts: rows only via mark_rider_payout / mark_restaurant_payout (assert_admin); RLS insert/update/delete admin-only;
  no cron job touches payouts; the functions call Mollie only for payments and refunds (no transfer/settlement API).
  Nothing is auto-paid.
