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
