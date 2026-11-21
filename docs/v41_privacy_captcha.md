# v41 privacy extras (not live)

This branch is built from main after the v40 go-live. It is **not applied or deployed** until Zsolt approves.

## Rider addresses
Unassigned riders no longer read `orders.address`, phone, customer id, or exact coordinates. The bid board is `rider_bid_orders` / `fp_rider_bid_board()`, which returns a neighbourhood label (postcode + city + distance). Assigned riders still read the full order row. The rider UI also hides the street on bid cards.

## Settings
Labour, CAO/WML, payroll, pension, ATW maxima and similar columns stay on `settings`, now selectable only by admins. Public fees, zone, min order, bid windows and the rider bonus come from `settings_public`. Logged-in restaurants get commission rates from `settings_partner`. Riders get the two shift-planning fields they need from `settings_work`.

## posts / comments
Unused starter tables. 8 posts and 11 comments were copied to the operator backup (`/workspace/fptest/v41/backup/`) before this migration is applied. The migration drops the tables.

## Captcha (Turnstile) — what Zsolt needs to create
Supabase Auth supports [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/) or hCaptcha. **Turnstile is recommended** (free). This branch prepares the static PWA login/sign-up pages (NL/EN, labelled, works without a build-time secret) behind a config flag. **Auth captcha is not turned on** and no provider account was created.

To switch it on later, Zsolt needs to:

1. Create a free Cloudflare account (if he does not already have one).
2. Open Turnstile and add a widget for `app.foodporter.nl` (also allow `localhost` for tests).
3. Copy the **site key** (public) and the **secret key** (private).
4. Put the site key in the app as `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and rebuild/deploy the PWA.
5. In the Supabase dashboard: Authentication → Attack protection / captcha: choose Cloudflare Turnstile, paste the **secret key**, and only then enable it.
6. Do not enable step 5 until the site key is already in the deployed app, or sign-in will fail.

Until those keys exist, leave the env var unset. The login page stays as it is now. `NEXT_PUBLIC_CAPTCHA_MOCK=1` is only for automated UI tests (a labelled checkbox, no Cloudflare).
