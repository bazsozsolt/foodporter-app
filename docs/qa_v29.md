# QA v29 — account flows (2026-10-23)
Build 20261023200627 (UTC id; 22:06 Amsterdam), live on gh-pages. Test: `scripts/e2e/account.ui.py` 19/19 PASS on live (throwaway example.com accounts, removed afterwards; no emails sent — recovery call stubbed).

## Checked
Sign-up, sign-in, magic link, forgot password, new password, forgot email, sign-out, protected pages after logout (admin/rider/restaurant/my-orders), delete account, NL/EN parity (816 pairs, 0 problems), tsc, eslint, build.

## Bugs / gaps fixed
- No "Forgot password" flow → added (neutral message, no enumeration; rate-limit message).
- No new-password page → PASSWORD_RECOVERY event routes to /login/?reset=1 with "choose new password" (+ repeat, min 8). Signed-in users can also change their password.
- No "Forgot email/user ID" → guidance panel (no lookup, so it cannot leak whether an account exists).
- Sign-up min password 6 → 8 (client + action); clearer errors (weak, same password, already registered, wait).
- Sign-out stayed on page with in-memory data → now full reload to /login, session token removed (verified).
- `?next=` open redirect (e.g. //evil) → only same-app paths allowed.
- No link from account to delete/export → added (privacy#rights anchor).
- Erasure (admin `fp_anonymise_profile`) left login email + password active → now scrubs auth email/phone/metadata, bans login, ends sessions; admin can't erase self. Migration 20261023200000_v29_erasure_auth (dry-run verified in rollback).

## Needs Zsolt / open
- Management API token (SUPABASE_ACCESS_TOKEN) is now invalid (401): could not read/set Auth URL config. Please set in Supabase → Auth → URL config: Site URL `https://bazsozsolt.github.io/foodporter-app/`, redirect allow-list `https://bazsozsolt.github.io/foodporter-app/**`; Auth → Providers → Email: minimum password length 8. Or give a fresh token.
- Default Supabase SMTP: ~2 emails/hour, only to team addresses → reset/magic-link emails unreliable. Needs custom SMTP (e.g. Postmark/Brevo/Resend) for real use.
- Email confirmation is OFF (mailer_autoconfirm=true): anyone can sign up with any address, and "already registered" on sign-up reveals that an address exists. Turn on "Confirm email" once custom SMTP is in place.
- Leaked-password protection needs the Pro plan (known).
