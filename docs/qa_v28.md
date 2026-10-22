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

## Phase 4 – Safety / legal / privacy
- Suites: employment 34/34, compliance 13/13, hours 18/18, legal 45/45, v20 35/35, v24 10/10, erase 10/10, proof 16/16,
  photos 13/13. **194/194.**
- Rider gates (tested): unsigned contract or conduct → cannot go online; under-16 blocked; zzp contract rejected;
  12 h rest blocks clock-in (rest < 11 h cannot even be configured); break after 4.5 h; ATW alert; call-in > 12 h rejected.
  Minors: fp_rider_legal_status adds youth_night 23:00–06:00 (Europe/Amsterdam clock) and youth shift/week maxima;
  fp_legal_housekeeping (cron */10, 144 OK runs) takes minors offline at night. Code-reviewed; the night branch cannot be
  e2e-tested without faking the clock.
- SOS: support e2e "SOS raises an ops alert with location" PASS; SOS has its own limit (5/h).
- Retention jobs (phase 1) match privacy statement v0.4: GPS 7 days, proof photos 30 days, chat 6 months, support 2 years,
  status log 2 years, rate limits 30 min.
- Erasure: admin-only, refuses admins, anonymised profile row kept (erase e2e).
  **FIXED – data export (GDPR art. 15):** the JSON missed rider_hr (birthdate/contract), rider_onboarding, rider_documents,
  payouts, customer_credit, referral_codes, feedback, work_violations, group_members and account_status_log. All added,
  RLS-scoped. New v26.ui check downloads the export as a rider.
- Templates: 13 current templates; live HTML sha256 = DB sha256 for all, every versioned PDF 200. Contract v0.5 has a
  "€ [0,50]" bonus placeholder ("shown in the app"), transparency v0.5 "now €0.50", customer terms v0.3 fees 249/349/499 + 0.99,
  restaurant partner commission. All consistent with settings.
- **FIXED – rider-info:** the hardcoded "nu €0,50" / "now €0.50" is replaced by <LiveBonus/> (settings.rider_bonus_cents,
  data-testid live-bonus). New v26.ui check: admin sets €0.75 → rider-info shows €0,75 → reset to plan defaults (€0.50).
- Remaining copy that quotes current numbers: SupportSheet FAQ (fee bands), welcome page (25% commission) and terms page
  (legal snapshot, "nu"/"currently"). Correct today; they won't follow later admin changes → listed for Zsolt.

## Phase 5 – Quality per role (local build with the v28 fixes)
- Box restarted during the crawl (~13:36 EEST). node_modules, Playwright headless shell, /tmp/site server, /tmp/ghp2
  worktree and out/ restored (npm ci, playwright install, rebuild, worktree add). Commits were intact.
- Remaining e2e: core 38/38 (one transient null read in the auction poll; re-run green, loop now null-safe), chat 46/46,
  chat-admin 10/10, push 24/24, rls 225/225, reports.check 14/14.
  All e2e suites across phases 3–5: **all green.**
- UI suites: v26 34/34 (incl. new v28 live-bonus + data-export checks), v22 36/36, v24 17/17, support 14/14, legal 14/14,
  v19 11/11, admin-smoke 25/25, notify 8/8, sound 8/8, v13 15/15, push (--chrome) 7/7.
  - manual-assign 3/4 → 4/4: the test read the *first* card in the prep column (a core leftover with rider Rik). It now
    targets its own order card. Test issue, app correct.
  - v20 13/14 → 14/14: on a Sunday "tomorrow" is in next week's call-in roster, so the test now clicks Next →
    (the call-in was saved correctly). The rider rest check now polls instead of a fixed 4 s wait.
- a11y: 0 critical/serious (axe), 0 missing focus rings. Parity: 94 files, 784 NL/EN pairs, 0 problems.
- tsc clean. eslint 0 errors, 6 old warnings (unused test vars, one <img>).
- Test data: the 6 "test rate-limit status" tickets (#438–443, OUTSIDER, is_test) were resolved by a status update
  (no message insert → no push).
- 22 Oct resume: health OK (live build 20261017105052; 10 cron jobs, 24 h, 0 failures). Box rebooted again mid-crawl;
  node_modules, Playwright, out/, /tmp/site and /tmp/ghp2 restored.
- Crawler (CRAWL_CONCURRENCY=1, --quick, mobile NL + desktop EN): anon 30 pages, customer 34, rider 8, restaurant 4,
  admin 32, admin-as-roles 20. **0 findings.**

## Phase 6 – Deploy
- Fixes deployed ONCE: build 20261022125726 (rider-info LiveBonus, full GDPR export, PhotoCredits http(s)-only).
  The DB fix (rate limit → HTTP 429) was already live since 18 Oct.
- Live version.json = out/version.json. Key pages 200. v26.ui against live 34/34, incl. both v28 checks; bonus restored to €0.50.
- Git credential helper pointed at /usr/bin/gh, which the reboot removed → now /usr/local/bin/gh.

## v28b (22 Oct)
- Orders 1431/1432 set is_test=true (confirmed by Zsolt). No other non-test orders exist besides 1043/1046 (untouched).
  reports.check 14/14, cross 66/66 (reconciliation), v27 26/26.
- Live copy: help FAQ (fee bands, service fee, zone), welcome (commission, zone) and terms (fee bands, service fee, zone)
  now read settings via fillLive/<LiveText/>. New v26.ui checks: admin sets €2.59 / €1.09 / 26% → terms, welcome and FAQ
  show them → reset to plan defaults (verified 249/349/499, 99, 25%, €0.50). v26.ui 37/37, parity 0 problems, a11y 0 serious.
