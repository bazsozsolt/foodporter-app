# v28 full audit (18 Oct 2026, times EEST unless noted)
Box: no restart since v27 (up 14 h); node_modules, Playwright headless shell, Chrome, gh, /tmp/ghp2, /tmp/site, test photo all present.

## Phase 1 – Health
- Live version.json = local build 20261017105052.
- 1000 static pages (incl. restaurant pages) all 200; 49 legal files (index.json HTML + every PDF version) all 200.
- sw.js, manifest, version.json served; freshness.ts polls version.json (no-store) for the update prompt.
- Edge functions: create-payment v22 (verify_jwt), mollie-webhook v12, order-push v6, order-refund v4, order-sms v2, purge-retention v2.
- Cron (10 jobs), last 24 h: 0 failed runs. fp-purge-status-log (03:35 UTC = 05:35 Amsterdam) ran OK (account_status_log > 2 years).
  fp-purge-proofs → purge-retention HTTP 200 at 03:25 UTC: removed 0 photos, 0 tickets, 0 chat (nothing due yet). fp-purge-locations OK (7 days).
- Logs 24 h: one API 500 = support_create rate limit during the support e2e. Cause: fp_rate_limit raises SQLSTATE P0429, which
  PostgREST maps to 500. Fix in phase 6: PT429 → HTTP 429. Other DB messages are expected test denials (RLS, admin only, push_log de-dup).
