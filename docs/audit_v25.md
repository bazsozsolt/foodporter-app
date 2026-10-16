# FoodPorter v25 audit: security, payments, privacy (2026-10-16)

Test data only. Mollie test mode. Orders 1043/1046 untouched. No messages sent. Tests: scripts/e2e/audit.e2e.mjs (42/42).

## Phase 1: Security
- Advisors reviewed. 100 SECURITY DEFINER functions, all have search_path set. Only fp_restaurant_open runs for anon (intended).
- RLS probe: anon reads 0 rows from 10 personal tables. IDOR: other customers cannot pay, read or chat on someone else's order.
- Storage: support-photos and delivery-proof are private (owner/admin/proof policy). menu-photos is public-read with owner write. MIME and size limits set.
- Edge functions: create-payment requires a JWT, has a CORS allowlist and recomputes prices server-side. Webhook ignores spoofed ids (it re-fetches from Mollie). Support refunds are admin-only.
- Bundle: no service_role or Mollie keys in out/. CSP meta is present ('unsafe-inline' is needed by Next static export). GitHub Pages cannot set HTTP headers (frame-ancestors/HSTS are limited).
- XSS: user text is rendered as React text. dangerouslySetInnerHTML is used only for our own legal HTML.
- MEDIUM, FIXED: promo codes had no brute-force limit. Now max 10 wrong codes per customer per hour.
- LOW: fp_chat_open returns a boolean for any order id (no data leak).
- Auth config updated by Zsolt: minimum password length 8, email OTP expiry 15 min. Leaked-password (HIBP) protection needs the Pro plan. Email confirmation is left off because of the default SMTP rate limit.

## Phase 2: Payments
- HIGH, FIXED: a customer could add order_items after the Mollie amount was fixed, which inflated the restaurant subtotal. Items are now locked once payment starts.
- FIXED (defence in depth): the webhook compares the Mollie amount and currency with the order total. On a mismatch it sets paid_amount_mismatch, raises an ops alert and does not release the order.
- Verified: client subtotal/money fields are ignored or blocked, a customer cannot mark an order paid, tip 0 to €20 in whole cents, min €1 / max €500, order-refund skips unpaid orders, refunds are capped by Mollie amountRemaining and claimed atomically, payouts and earnings cannot be marked paid by non-admins, unknown promo is refused.
- LOW: simulated tr_sim payments (test only) do not cap a full refund against earlier support refunds.

## Phase 3: Privacy / AVG
- MEDIUM, FIXED: data export lacked support tickets/messages, chat, legal acceptances, shifts, work sessions, availability and push devices. All added, and the text is now NL/EN.
- MEDIUM, FIXED: there was no right to erasure. Added "Delete my account" on /privacy (creates a privacy ticket, 30-day SLA) and an admin "Anonymise profile" action on privacy tickets. It clears name, phone, IBAN, email, push, location, availability and referral data, and refuses while an order is active. It was tested in a rolled-back transaction.
- Retention cron jobs are all scheduled and succeeding. rate_limits are purged after 1 day.
- localStorage is functional only (language, cart, favourites, alerts). No tracking cookies, so no consent banner is needed.
- Third parties (Supabase EU, Mollie, PDOK, OSM tiles, SMS, GitHub Pages) are already in privacy statement v0.4.
- GPS is shared only while the rider is online or on a job, as the privacy text describes.
- Erasure now also deletes the Supabase Auth login. The admin action "Anonymise & delete login" calls fp_erase_account (SECURITY DEFINER, admin only). It refuses admins, refuses the owners of orders 1043/1046, and refuses while an order is active. It anonymises the profile, then deletes auth.users.
  - The profiles to auth.users FK (on delete cascade) was dropped, so the anonymised profile row and all orders, earnings and payouts are kept (fiscal, 7 years).
  - Tested on throwaway test users (scripts/e2e/erase.e2e.mjs 10/10): the login is gone and the profile row is kept, anonymised.
