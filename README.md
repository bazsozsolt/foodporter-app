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
Schema & RLS: `supabase/migrations/20261013000000_init.sql` (`supabase db push`). Key metric view: `order_metrics`.

## Static preview
`STATIC_EXPORT=1 BASE_PATH=/foodporter-app npm run build` → `out/` (published to the `gh-pages` branch; `docs/github-pages-workflow.yml` can be moved to `.github/workflows/` once gh has the `workflow` scope).
