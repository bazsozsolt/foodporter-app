# QA v31 — full live check of https://app.foodporter.nl (2026-10-24, 14:52–15:50 Amsterdam)
Build 20261024134006 (UTC id; 15:40 Amsterdam), gh-pages 532b5696c5. One browser at a time, CRAWL_CONCURRENCY=1, load < 0.7.
## Results (live)
- run-all.sh: every node e2e suite pass (core 39 incl. new Mollie-return check, group, push, support, chat, photos, compliance, tips, hours, proof, pickup, promo 34, cross 66, legal 45, employment 36, v20 35, v24, audit 42, erase, v26 36, v27 26); manual-assign 4/4, legal-ui 14/14, v19 11/11, v20-ui 14/14, v26-ui 37/37, a11y 0 critical/serious, i18n 816 pairs 0 problems, reports 14/14, crawler 0 findings (all roles, mobile+desktop).
- account.ui.py 20/20 (after fix below).
- Mollie (test mode) paid → returns to https://app.foodporter.nl/order/?id=… (new assert in core.e2e.mjs).
- Old URL bazsozsolt.github.io/foodporter-app/ and /login/ → 301 app.foodporter.nl.
- Supabase auth: site_url https://app.foodporter.nl/, allow-list app.foodporter.nl/** (+ old github.io/** temporary, harmless), min 8, HIBP on.
- PWA: manifest start_url/scope "/", SW registered at scope https://app.foodporter.nl/. Cert app.foodporter.nl valid to 2027-01-22.
## Bugs found + fixed
1. Change password always failed silently: Supabase now has "require current password" (+ "reauthentication") on; app sent no current password → 400 current_password_required, no visible error. Fix: "Huidig wachtwoord / Current password" field (not in reset-link mode, which Supabase exempts), clear error messages. Disabled `security_update_password_require_reauthentication` (it emails an OTP for sessions > 24 h; app has no OTP step and mail quota is ~2/h; current password already proves identity).
2. Server password policy requires lower+upper+digit+symbol, but app said "min 8 characters" and showed a wrong error. Fix: client check + hints mirror the policy (sign-up, change, reset); leaked-password error mapped.
## Test fixes
- v20.ui.setup.mjs seeds shifts in the previous calendar week (relative), so "Vorige week" works any day — no app bug.
- account.ui.py polls instead of fixed waits; core.e2e asserts Mollie return URL.
Throwaway fp-v31-*@example.com accounts (10) deleted. No real orders/emails; 1043/1046 untouched.
