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
| Customer | `/` restaurants · `/r/[id]` menu · `/cart` · `/checkout` · `/orders/[id]` tracking |
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
`STATIC_EXPORT=1 BASE_PATH=/foodporter-app npm run build` → `out/` (published to the `gh-pages` branch; `docs/github-pages-workflow.yml` can be moved to `.github/workflows/` once gh has the `workflow` scope).
