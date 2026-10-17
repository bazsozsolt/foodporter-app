# v26 – business model from the approved financial plan

Source: Zsolt's approved plan (PDF + Excel). Numbers used: commission 25% delivered / 20% founding rate first 3 months / 10% pickup;
delivery fee €2.49 (≤3 km) / €3.49 (3–5 km) / €4.99 (5–10 km); service fee €0.99 on delivery only; zone 5 km core, 5–10 km Stage 2;
min-max contracts default (3 h shifts), 0-hours banned from 1 Jan 2028; tips 100% to riders.

## Phase 1 – data model + server pricing (migrations applied)
- 20261017090000_v26_business_model: settings (commission rates, fee bands, contract defaults, checks), fp_delivery_fee, fp_commission_rate,
  restaurants.partner_since + nullable commission_pct override, orders.commission_pct stored per order (historic orders backfilled to 12%),
  trigger sets the rate at payment, guards against client tampering (commission, service fee, fulfilment after payment), rider_hr min-max default,
  order_facts / report_payments with per-order rates.
- 20261017091000_v26_fee_basis: fee distance basis (restaurant→customer default, or centre), orders.fee_km, client can't set it.
- create-payment v22: zone 5–10 km server check, distance fee band, service fee (not on pickup), breakdown; 409 price_changed when the
  client's expected total differs (no Mollie payment created).
## Phase 2 – UI
- Checkout / cart / group: transparent NL/EN breakdown (food, delivery fee with km, service fee, tip, promo, credit), fee explainer.
- Restaurant dashboard: commission from stored per-order amounts + current rates + founding-rate end date.
- Admin: Business model panel (commission, fee bands, basis, service fee, zone 5–10, contract defaults, reset to plan defaults);
  restaurants: custom rate + partner date; finance: current/pickup/effective rates (+CSV); orders: service fee, rate in detail + CSV;
  legal: new riders default min-max 8–16 h, 0-hours marked "banned from 2028".
- Copy: welcome, terms page, rider info, Help FAQ (fees + zone).
- Feedback 8: home allergen filter default now "… (kies)" / "… (choose)" after the "Zonder"/"Without" label.
## Phase 3 – legal
- Ported live v0.4 privacy statement + register edits into the md sources (render now byte-identical to live).
- rider_employment 0.4, restaurant_partner 0.2 ({{COMMISSIE_PCT}} replaced by 25/20/10 + P2B notice), customer_terms 0.2, platform_transparency 0.4.
- Migration 20261017092000_v26_legal_versions: rows with sha256 of the HTML; test_seed re-sign for test accounts only (0 real accounts).
## Phase 4 – tests
- Fix found while testing: orders uses column-level SELECT grants, so the new commission_pct / fee_km were unreadable (every app order
  query would have failed). Migration 20261017093000_v26_order_col_grants grants SELECT on both (rows still limited by RLS; phone stays hidden).
- New scripts/e2e/v26.e2e.mjs (36 checks: settings bounds + roles, fee bands, client tamper discarded, 409 price_changed without a Mollie
  payment, stored = charged, 20%/10% stored at payment, staff/customer can't rewrite, pickup no fees, 5 km zone refusal, historic 12% kept,
  payout report rates) and scripts/e2e/v26.ui.py (26 checks + screenshots). rider_hr default min-max 8–16 h verified in a rolled-back SQL test.
- employment.e2e: pinned TZ to Europe/Amsterdam (box is in Bucharest; shift-day maths must match the DB).
## Phase 5 – full recheck + deploy (17 Oct 2026, EEST)
- Static: tsc 0, eslint 0, NL/EN parity 782 pairs 0 problems (admin-only adminBusiness.tsx added to the parity skip list like adminFinance).
- Advisors: same as the v25 baseline (security-definer RPC list, leaked-password protection needs Pro); nothing new from v26.
- E2E, sequential: core 38, group 47, tips 10, promo 34, pickup 15, cross 66, support 40, chat 46, chat-admin 10, legal 45, v24 10,
  audit 42, erase 10, proof 16, hours 18, compliance 13, employment 36 (max-shift branch exercised after 12:05 Amsterdam), photos 13,
  push 24, v20 35, v26 36, reports 14 – all green.
- UI (local, then live where relevant): v22 36, v24 17, support 14, legal 14 (live), manual-assign 4, v19 11, v20 14, admin-smoke 25,
  notify 8, sound 8, push 7/7 (--chrome; the FCM delivery step is skipped in this sandbox), v13 15, v26 26 (local + live), a11y 38 pages 0 issues,
  crawler --quick one role at a time: 0 findings (anon/customer/rider/restaurant/admin/admin-as-roles).
- Box after the reboot: reinstalled the Playwright headless shell, recreated /tmp/fp_photo.png, the /tmp/ghp2 gh-pages worktree and the gh binary.
- Deployed once: build 20261017100021, live version.json = out/version.json; live legal HTML sha256 = DB.
- Feedback 8: resolved_at set after the deploy (10:04 UTC = 13:04 EEST). Note: the admin crawl had already clicked "Done" at 12:48 EEST;
  the crawler now treats Done/Reopen as do-not-click.
- Screens: /workspace/foodporter/screens_v26/ (checkout-breakdown-nl/en, checkout-pickup-nl/en, restaurant-figures-nl/en,
  admin-business-settings, admin-restaurant-payouts), retaken on the live site.

# v27 – split the delivery fee (Zsolt's decision, 17 Oct 2026)
- Rule: riders get a fixed per-delivery bonus (settings.rider_bonus_cents, default €0.50, 0–200 cents, admin Business model panel,
  part of "reset to plan defaults"); the rest of the delivery fee + the service fee is Food Porter revenue; tips 100% to riders.
- DB (20261017100000_v27_rider_bonus): orders.rider_bonus_cents set once on the payment transition (pickup 0; capped at the delivery fee);
  clients can't set it (insert sanitised, update guarded); earnings = bonus + tip. Orders paid before v27 keep NULL = old terms (rider gets
  the full delivery fee); no backfill, so 1043/1046 are untouched. order_facts: rider_bonus_cents, company_revenue_cents, tip_cents;
  report_payments.platform: commission, delivery fees, rider bonuses, service fees, tips, company revenue.
- App: rider order card shows "Bezorgbonus €0,50 (+ fooi)"; rider earnings + rider info + help FAQ + checkout explainer + terms page + home copy;
  admin: Business model rider bonus field, "Food Porter revenue" panel + CSV on Payments, "Company revenue" KPI on the overview, orders detail/CSV.
  Weekly summary + payroll CSV already read the bonus from earnings (unchanged code, now €0.50 per new delivery).
- Legal (20261017101000_v27_legal_versions): rider_employment 0.5, platform_transparency 0.5 (fixed bonus), customer_terms 0.3 (fees go to
  Food Porter); test riders re-signed (test_seed) only.
- Tests: new v27.e2e (26: bounds/roles, client value discarded, stored at payment, can't be changed by customer/restaurant/rider, later setting
  change doesn't alter paid orders, earnings = €0.50 + tip, weekly + payroll delta, pickup 0, historic unchanged (272 orders), report totals =
  sum of facts, bonuses = earnings excl. tips); cross/tips updated to the new rule (Mollie total = restaurant net + rider earnings + platform share).
- Recheck: core 38, cross 66, tips 10, group 47, pickup 15, promo 34, support 40, proof 16, legal 45, employment 36, v20 35, v24 10, v26 36,
  v27 26, audit 42, reports 14; UI v26/v27 32, v20 14, legal 14, v22 36, v19 11, admin-smoke 25, manual-assign 4; a11y 38 pages 0 issues;
  crawler one role at a time 0 findings; tsc/eslint 0; parity 784 pairs 0; advisors unchanged.
- Note: v26's commission backfill had set commission_pct = 12 on 1043/1046 (amounts unchanged); left as is.
