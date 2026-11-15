# QA v35: account flows retest on the live app (2026-11-15, 09:50–10:10 Amsterdam)
Target: https://app.foodporter.nl (live gh-pages build; repo main at 04f37419d8, no code/config/deploy changes in this step).
Method: headless Playwright Chromium, one browser at a time (CRAWL_CONCURRENCY=1), 390×844 viewport.
- `scripts/e2e/account.ui.py` (unchanged) → **24/24 PASS** (sign-up/resend/recover calls answered locally, as designed).
- Supplementary live checks (scratch scripts outside the repo, /workspace/fptest/auth_v35*.py, v35-admin.mjs, v35-curpw*.mjs):
  real sign-up calls (not mocked), admin `generateLink` for confirmation + recovery (no mail), ?next= payloads, logout storage, data export.
  Run 1: 22/25 then stopped at the recovery form; run 2 (recovery + ?next=): 13/17. All failures are listed under Bugs.
Auth config read back (read-only): min length 8 + lower/upper/digit/symbol, HIBP on, mailer_autoconfirm=false, otp 900 s,
SMTP smtp-relay.brevo.com:587 sender noreply@foodporter.nl "Food Porter", security_update_password_require_current_password=true.

## Results per flow
| Flow | Result | Evidence |
|---|---|---|
| Sign-up, strict rule (UI) | PASS | Button disabled + NL hint for `Shrt1A!` (7), `testtest1!`, `TESTTEST1!`, `Testtesttest!`, `Testtest12` |
| Sign-up, strict rule (server) | PASS | `Fpv35€testje9` (only non-ASCII symbol) → /signup 422 "Password should contain at least one character of each…", no user created, NL rule message shown |
| Sign-up, leaked-password check | PASS | `Password1!` → /signup 422 "known to be weak", UI: "Dit wachtwoord komt voor in bekende datalekken", no user created |
| Sign-up, strong password | PASS | /signup 200, "Kijk in je e-mail" screen, user created unconfirmed, confirmation_sent_at set |
| Unconfirmed sign-in | PASS | /token 400 email_not_confirmed → "bevestig eerst" box + resend button |
| Resend confirmation (neutral / rate-limit msg) | PASS | account.ui.py (mocked responses) |
| Email confirmation link | PASS | admin generateLink(signup) → /verify 303 → app, "bevestigd" toast, signed in, email_confirmed_at set; reused link → "verlopen" toast |
| Login / generic error / no enumeration | PASS | wrong password and unknown email both "Onjuist e-mailadres of wachtwoord." |
| Logout | PASS (auth) / **FAIL (device data)** | auth token removed, lands on /login, /admin /rider /restaurant /my-orders ask to sign in; cart + favourites stay in localStorage (bug 4) |
| Forgot password (request) | PASS | neutral "Als er een account…" message (send mocked) |
| Reset link landing | **FAIL** | recovery link lands on `https://app.foodporter.nl/#` (home, signed in) instead of `/login/?reset=1` — reproduced in 2 runs (bug 2) |
| Set new password (reset form) | PASS (reached manually via /login/?reset=1) | no current-password field, weak → disabled, leaked → datalek msg, new password saved, ?reset=1 removed, old password rejected, new password signs in; reused recovery link → "verlopen" |
| Change password (signed in) | PASS for password sessions / **FAIL for link sessions** | mismatch blocked, leaked rejected, change OK; but wrong current password ACCEPTED after signing in via confirmation link (bug 3) |
| Forgot email help | PASS | guidance with privacy contact (account.ui.py) |
| ?next= open-redirect protection | **FAIL** | `//evil.example`, `https://evil.example/`, `\\evil.example`, `javascript:…` blocked; `/my-orders` works; but `/\evil.example`, `/%09/evil.example`, `/%0A/evil.example` → browser ends on `https://evil.example/` after sign-in (bug 1) |
| Data download | PASS | foodporter-my-data.json, 23 keys, own profile id only, orders [] |
| Delete account link/request | PASS | link from /login to /privacy#rights; "Verwijder mijn account" → "Verzoek ontvangen" (privacy ticket created, cleaned up) |
| Page errors | PASS | none in any run |

## Real email (Brevo)
Exactly **one** real email: sign-up confirmation to cdtecniek.bouw+fpv35@gmail.com, 09:52:51 Amsterdam. auth_logs: POST /signup 200 with
auth_event user_confirmation_requested (721 ms, GoTrue sends synchronously and returns 500 on SMTP failure); no SMTP/mailer errors in auth_logs
08:45–09:30 UTC. Inbox arrival not verified by me (no access to that Gmail). Its link is dead now (account deleted). All other links via generateLink.

## Bugs (not fixed in this step)
1. **Open redirect via `?next=`** (security, medium). `src/app/login/page.tsx` goNext only checks `startsWith("/") && !startsWith("//")`.
   The URL parser turns `/\host`, `/<TAB>/host`, `/<LF>/host` into `//host`, so router.push leaves the site.
   Repro: signed out, open `https://app.foodporter.nl/login/?next=%2F%5Cevil.example`, sign in → https://evil.example/.
   Fix: `const u = new URL(n, location.origin); router.push(u.origin === location.origin ? u.pathname + u.search + u.hash : "/")`
   (optionally also reject `\` and control chars). Replace the weak `?next=//evil.example` check in account.ui.py with this payload loop.
2. **Password-reset link doesn't open the "new password" form** (functional, high). `src/lib/store.ts` initSupabase awaits loadCatalog/loadUserData
   before registering onAuthStateChange, so the PASSWORD_RECOVERY event fired while supabase-js parses `#…type=recovery` is missed; only
   `landedFrom === "signup"` is handled. User ends up signed in on the home page. (Real reset emails use the same implicit-flow hash link.)
   Fix: after loadUserData add `if (landedFrom === "recovery" && state.signedIn && !/\/login\/?$/.test(location.pathname)) location.assign(base + "/login/?reset=1")`,
   and/or register onAuthStateChange before the awaits. Add a recovery-landing assertion to account.ui.py.
3. **Current password not checked for link-based sessions** (security/UX, medium). With a password session the server rejects a wrong
   current_password (400 current_password_invalid; no current → 400 current_password_required). With a session from an email link
   (amr "otp": confirmation link, magic link, recovery) GoTrue skips the check: UI test with "Wrong-current-9!" → "Wachtwoord gewijzigd";
   API repro via magiclink verifyOtp → updateUser accepted. Fix: in updatePassword (non-reset) verify first with
   `signInWithPassword({ email, password: currentPassword })` and show "Je huidige wachtwoord klopt niet" on failure; consider turning on the
   password-changed notification email (currently off, template English-only) after making it NL/EN.
4. **Logout leaves cart and favourites on the device** (privacy, low). `foodporter-cart-v1` and `fp-favs` survive signOut (shared phone → next user
   sees them). Fix: remove CART_KEY (and fp-favs, or make favourites per user) in actions.signOut before the reload.
5. **Client password rule wider than server** (UX, low). passwordProblem accepts any non-alphanumeric (e.g. €, space); server only accepts the
   ASCII list. Result is a server 422 and the generic rule message. Fix: use the server's symbol set in the client regex and name it in the hint.
6. **Housekeeping** (low). Deleting an auth user leaves its `profiles` row (no FK/cascade from profiles to auth.users); self sign-ups get is_test=false.
   There are 18 orphan profiles that still hold an email (seed/test example.com addresses from earlier runs) — not touched.
   account.ui.py never deletes its main account; leftovers fp-v33-acct-…/fp-v34-acct-…@example.com still exist (not touched). Fix: `adm("delete", EMAIL)` at the end.

## Cleanup
Test accounts created and deleted (auth user + orphan profile + privacy ticket): cdtecniek.bouw+fpv35@gmail.com, +fpv35acct@gmail.com,
+fpv35acct-unc@gmail.com. Verified 0 auth users and 0 profiles left matching cdtecniek.bouw+fpv35%. Zsolt's own account and orders 1043/1046 untouched,
no payouts, no Mollie calls. My headless Chromium processes exited; an unrelated headless Firefox (another session) was left running.
`npm ci --ignore-scripts` was run in the checkout to restore node_modules (no tracked files changed).

## Not tested
Real reset-email / real confirmation-email click-through (used generateLink to save Brevo quota), Google/Apple sign-in, magic-link UI,
actual erasure after a delete request (admin step, covered by erase.e2e on v34), EN-language variants of these screens (only NL asserted).

---
# QA v35b: verification of the fixes on branch `cursor/account-auth-fixes-5007` (e55a818397) — 2026-11-15, 10:35–10:50 Amsterdam
Not deployed, no PR, nothing committed/pushed. Checked out locally, `npm ci --ignore-scripts`, `STATIC_EXPORT=1 npm run build` (OK, all routes
exported, out/CNAME = app.foodporter.nl), `tsc --noEmit` clean, eslint clean on changed files, `node scripts/e2e/auth-rules.test.mjs` 30/30.
Served `out/` with `python3 -m http.server` on http://127.0.0.1:4335 against the same Supabase project; headless Chromium, one browser at a time.
**How links were tested without localhost in the redirect allow-list:** admin `generateLink` (no email) → fetch the `/verify` action link with
`redirect: manual` → Supabase redirects to the site URL with the session/error in the hash → rewrite only the origin to http://127.0.0.1:4335
and open it. That exercises the app's real hash handling (`#access_token…&type=signup|recovery|magiclink`, `#error_code=otp_expired`).
For "reused link", the action link was consumed once and the *second* /verify redirect (otp_expired) was opened.
Runs: account.ui.py (branch version) NL 41/42 and EN 41/42 (EN via a copy that only sets fp-lang=en); auth_v35_local.py NL 51/53, EN 51/53;
reused-link check 4/4; reset-form-on-password-session check. The only failures were test-method artefacts (explained below), none in the app.
Real emails sent: **0** (sign-up/resend/recover answered locally; auth_logs 09:30–10:30 UTC show only /admin/generate_link events, no mail sends).

## Fixes
| # | Fix | Result | Evidence |
|---|---|---|---|
| 1 | ?next= open redirect | PASS | 12 bypass payloads (`//`, `https://`, `/\`, `/<TAB>/`, `/<LF>/`, `/<CR>/`, `\\`, `javascript:`, `/%5C`, `/%255C`, `///`, `/\/`) → `/`, NL+EN; `/my-orders`, `/group?code=ABC234`, `/r/<id>` kept |
| 2 | Recovery link lands on reset form | PASS | recovery landing → `/login/?reset=1`, no current-password field, weak disabled, leaked rejected, saved, `?reset=1` removed; NL+EN; magic link does NOT open the reset form |
| 3 | Current password checked for link sessions | PASS | after confirmation-link and magic-link sign-in, wrong current → "Je huidige wachtwoord klopt niet / Your current password is incorrect", password unchanged; correct current → changed, still signed in |
| 4 | Logout clears cart + favourites | PASS | after sign-out cart = `{"restaurant_id":null,"qty":{}}`, fp-favs removed, auth token removed, language choice kept |
| 5 | Client password rule = server rule | PASS | `Fpv35€testje9`, `Test test1` blocked in UI with "ASCII-symbool / ASCII symbol" hint; `Fpv35€test9!` allowed; leaked `Password1!` still 422 server-side, no account |
| 6 | Housekeeping | PARTIAL | account.ui.py now deletes its users in `finally` (verified: auth users gone). Deleting an auth user still leaves the `profiles` row (+ privacy ticket): 8 orphan profiles from these runs, removed by me manually. No DB/cascade change in the branch (needs a migration, out of scope for an app-only fix). |

## Regressions (NL + EN): all PASS
Sign-up strict rule + leaked check, check-email screen, resend neutral + rate-limit messages, unconfirmed sign-in box, confirmation landing toast,
login, generic wrong-password / unknown-email message, change password (mismatch, leaked, success), logout + protected pages (/admin /rider
/restaurant /my-orders), forgot password neutral message, forgot-email guidance, reused confirmation/recovery link → "verlopen/expired" toast and not
signed in, data download (own profile only), delete-account request, no page errors.

## Test-method artefacts (not app bugs)
- account.ui.py "new password works" FAILs (NL+EN): the branch removed the old `goto(/login/?next=//evil.example)` line, so the assertion now runs
  on the home page that goNext() navigates to after sign-in (no "Ingelogd" text). The same password signs in fine in the very next steps.
  Script fix: `pg.goto(B + "/login/")` and poll for "Ingelogd|Signed in" before that assertion.
- auth_v35_local "reused link" FAILs: my first version reopened the already-verified landing URL (a still-valid token), not the /verify link; the
  corrected reuse check passed 4/4.

## Diff review (main...branch, 8 files)
- No changes to next.config.ts, basePath, public/CNAME, layout/CSP, service worker, deploy script or package files. CSP unchanged and still fine.
- safeNext: sound (rejects non-`/` start, `//`, backslash/control chars, encoded %5C/%09/%0A/%0D/%00 before and after one decode, then same-origin
  URL check). It returns the decoded path; legitimate paths with literal `%25` sequences would be decoded once (cosmetic, none exist today).
- updatePassword re-auth via signInWithPassword: client-side only. Someone holding a link session can still call the Auth API directly without the
  current password (GoTrue design); acceptable since link possession = mailbox control. Side effects: a new session is minted, wrong attempts count
  toward the sign-in rate limit, and accounts without a password (OAuth/magic-link only) can no longer set one via "Change password" (currently none
  in use; Google/Apple sign-in not enabled in the UI test). Minor.
- Recovery fallback also triggers on `?type=recovery` in the query: a crafted link sends a signed-in user to the reset form. Harmless: for a password
  session the save is rejected by the server (verified: "klopt niet" shown, password unchanged); message wording is slightly confusing there. Minor.
- Logout now also clears favourites (were documented as device-level); product choice, matches the privacy request.
- admin-user.mjs `link` prints a one-time token URL to stdout (comment says don't log it); account.ui.py doesn't print it. Fine for local tests.
- auth-rules.test.mjs imports .ts directly (works on Node 24 with a MODULE_TYPELESS warning); not part of the build.
- No secrets, no personal data, no new network endpoints added.

## Verdict
**GO** for deploying the app changes, after (recommended, not blocking) fixing the account.ui.py "new password works" assertion. Bug 6 (orphan
profiles on auth-user delete) remains open as a separate DB task. Test accounts created in v35b (8, all `cdtecniek.bouw+fpv35…`) were deleted with
their profiles; 0 left. Checkout returned to `main` (local branch ref deleted), local server and my headless browsers stopped.

## v35c: merge + test fix (2026-11-15, 10:50–11:05 Amsterdam)
- `cursor/account-auth-fixes-5007` fast-forwarded into main (e55a818397), approved by Zsolt ("Yes, merge and publish the account fixes now.").
- account.ui.py: "new password works" now opens /login/ and polls for "Ingelogd|Signed in" first. Local static build 20261115095021:
  run 1 41/42 (that check PASS; one flaky miss: the `/\evil.example` sign-in took > 8 s, so the URL still held `?next=…evil.example`; app stayed on
  the login page, no redirect), run 2 **42/42**. Consider a longer wait in that loop if it recurs.
