# QA v34: branded auth emails + email confirmation (2026-10-24, 17:35–18:55 Amsterdam)
Build 20261024160922 live (gh-pages 02c90742b8).
- Auth email templates (Management API, source in supabase/email-templates/build.py): confirmation, recovery, magic_link, email_change, invite, reauthentication. NL first, EN below, table-based HTML, light-only colour scheme, red #9b0708 / yellow #fad228, logo https://app.foodporter.nl/brand/logo-lockup.png, button + plain fallback link ({{ .Token }} code box for reauth), ignore line, footer Sonic Jobs V.O.F. h.o.d.n. Food Porter, Amarantstraat 6, 5044 RK Tilburg, KvK 42169998, support@foodporter.nl. No tracking pixels. Subjects bilingual (e.g. "Wachtwoord opnieuw instellen / Reset your password").
- mailer_autoconfirm=false (email confirmation on). All 132 existing users were already confirmed; all 12 test accounts sign in.
- App: after sign-up a "Kijk in je e-mail / Check your email" screen with a resend button; resend gives a neutral message and a rate-limit message; sign-in of an unconfirmed account shows a clear message plus a resend button; landing from the confirmation link signs in with a "bevestigd" toast; an expired or reused link shows a toast. Signing up with an existing address gets the same answer as a new one (no enumeration).
- Tests: admin-user.mjs creates and deletes throwaway users through the admin API (no email). account.ui.py 24/24 (sign-up/resend calls answered locally). Confirmation landing tested with an admin generateLink (no mail): signs in, toast shows, reused link → "verlopen". erase 10/10.
- Full suite (CRAWL_CONCURRENCY=1): 725 PASS, 0 FAIL. Crawler had 1 flaky finding (rider /rider/shifts "Add block" no-op); a rerun of the rider role found 0.
- Real emails: 2 to cdtecniek.bouw@gmail.com (recovery 18:12, magic link 18:13). Auth logs show /recover 200 and /otp 200 with no SMTP errors.
- Note: auth admin listUsers returns 500 "Database error finding users" on this project (probably the anonymised erased rows). The test helper looks users up with SQL instead.

## Addendum (18:59–19:10 Amsterdam): admin listUsers 500 fixed
- Cause: 115 seeded example.com test users (seed run of 2026-09-03, inserted straight into auth.users) had NULL confirmation_token, recovery_token, email_change_token_new and email_change, which GoTrue reads as non-null strings. The erase function (v25) deletes the auth row, so it wasn't the cause.
- Fix: migration 20261024190000_v34_auth_null_tokens.sql (coalesce the token columns to '', run in a transaction, only rows with NULLs, i.e. the 115 test users); scripts/test-data/generate_seed.py now writes ''.
- Verified: 0 NULL rows left; admin listUsers lists all 134 users across pages with no error; erase.e2e 10/10.
