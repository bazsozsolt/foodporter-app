# Food Porter

Mobile-first food delivery pilot for central Tilburg (NL): customers order from 5–10 local restaurants, riders **bid an ETA** to claim each delivery, restaurants set prep time and mark ready.

Stack: Next.js (App Router, TypeScript, Tailwind) · Supabase (Postgres, Auth, Realtime) · Mollie (iDEAL + cards, TODO) · SMS provider (TODO).

## Run
```bash
npm install
cp .env.example .env.local   # optional; without keys the app uses mock data (localStorage)
npm run dev
```

## Routes
| Role | Routes |
|---|---|
| Customer | `/` restaurants · `/r/[id]` menu · `/cart` · `/checkout` · `/order?id=N` tracking (legacy `/orders/[id]` kept) |
| Restaurant | `/restaurant` accept, prep time, ready for pickup |
| Rider | `/rider` feed + bids + active job · `/rider/earnings` |
| Admin | `/admin` key metric, partners, payouts due |
| Auth | `/login` Apple / Google / email (Facebook later) |

## Supabase
1. SQL Editor: run `supabase/migrations/20261013000000_init.sql`, then `supabase/migrations/20261013010000_app_wiring.sql`, then `supabase/migrations/20261013020000_hardening.sql`.
2. SQL Editor: run `supabase/seed.sql` (example restaurants + menus; role snippets at the bottom).
3. Auth -> URL Configuration: Site URL `https://bazsozsolt.github.io/foodporter-app/`, add redirect URLs for the preview and `http://localhost:3000/**`.
4. Google / Apple: enable under Auth -> Providers with their client credentials.

Roles: everyone signs up as `customer`; promote with the snippets in `seed.sql`. An `admin` can drive every screen (handy for demos).

## Static preview
`STATIC_EXPORT=1 npm run build` → `out/` (published to the `gh-pages` branch, served at https://app.foodporter.nl via public/CNAME; `docs/github-pages-workflow.yml` can be moved to `.github/workflows/` once gh has the `workflow` scope).

## Payments (Mollie)
- Edge Functions in `supabase/functions/`: `create-payment` (JWT required; recomputes the amount from DB prices, creates a Mollie payment, returns `checkoutUrl`) and `mollie-webhook` (public; re-fetches the payment from Mollie and moves the order `awaiting_payment` -> `placed`, or -> `payment_failed`).
- Migrations `20261013040000_payment_statuses.sql` + `20261013050000_mollie_payments.sql`: new statuses, `paid_at`/`payment_status`; restaurants never see unpaid orders.
- Required secret: `MOLLIE_API_KEY` (use a `test_` key for testing). Optional: `APP_URL` (defaults to the GitHub Pages preview).

## SMS updates (customer)
Edge Function `order-sms` is called by a DB trigger (`pg_net`) when an order becomes **assigned**, **picked_up** or **delivered**.
It re-reads the order, dedupes via `orders.sms_sent`, and sends via the configured provider. Without secrets it does nothing (`{"disabled":true}`).

Secrets (Supabase → Edge Functions → Secrets):
| Provider | Secrets |
|---|---|
| Twilio | `SMS_PROVIDER=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` (E.164 number or alphanumeric sender, e.g. `FoodPorter`) |
| Bird (MessageBird) | `SMS_PROVIDER=bird`, `BIRD_ACCESS_KEY`, `BIRD_WORKSPACE_ID`, `BIRD_CHANNEL_ID` (SMS channel) |

Dutch numbers like `06…` are converted to `+316…`.

## Prep time
Restaurants pick 10/15/20/30 or **Custom** (5–120 min, ±5 stepper), and can add **+5 / +10 min** until the order is ready (DB-enforced, `20261013070000_prep_time_and_sms.sql`).

## v2 operations (pilot launch hardening)
- **Delivery zone:** addresses are geocoded with PDOK Locatieserver (free, NL). Checkout shows suggestions and a live zone check; `create-payment` re-geocodes server-side and refuses addresses outside `settings.zone_radius_km` from the centre.
- **Status rules:** `enforce_order_transition` trigger: no skipping steps, only the right party moves each step (restaurant: accept/ready/reject; rider: picked up/delivered; system: payment/assignment; admin: cancel).
- **Timeouts (pg_cron `fp-timeouts`, every minute → `fp_run_timeouts()`):** unpaid orders expire (30 min); restaurant must accept within 5 min, else auto-cancel + refund + ops alert; no bid after the bid window → riders re-notified; no bid after 10 min → ops alert. All configurable in Admin → Settings.
- **Refunds:** cancelling a paid order (restaurant reject, timeout, admin) calls the `order-refund` Edge Function (Mollie Refunds API, idempotent claim). Failures create an ops alert; admin can retry.
- **Ratings** after delivery feed the Quality report. **Order history + reorder** at `/my-orders`.
- **PWA:** manifest, icons, service worker (offline shell). **Alerts:** sound + vibration + system notification on restaurant/rider screens while the app is open.
- **Legal:** `/privacy` (with JSON data export), `/terms`, `/cookies`; landing page `/welcome`.
