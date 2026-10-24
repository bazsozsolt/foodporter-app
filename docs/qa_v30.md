# QA v30 — app moved to https://app.foodporter.nl (2026-10-24)
Build 20261024074322 (UTC id; 09:43 Amsterdam), gh-pages commit 09ce05f8d3.
- Pages custom domain: app.foodporter.nl (public/CNAME), cert approved, HTTPS enforced. Apex foodporter.nl is NOT claimed by this repo (kept free for the marketing site); it was set briefly at 09:20 and switched away.
- basePath removed (build with STATIC_EXPORT=1 only); manifest start_url/scope "/", SW scope root, links check 76 internal/0 broken.
- Supabase auth: site_url https://app.foodporter.nl/, allow-list app.foodporter.nl/** + bazsozsolt.github.io/foodporter-app/** (temporary). Min password 8 unchanged.
- Edge functions redeployed: create-payment (APP_URL default + CORS), order-refund (CORS), order-push (VAPID subject). No APP_URL secret set; no DB rows/functions/cron reference the old URL.
- Tests on https://app.foodporter.nl: account.ui 19/19, manual-assign 4/4, legal-ui 14/14, v19 11/11, v26 37/37, a11y 0 critical/serious, crawl 0 findings; node e2e suites all pass (run vs apex at 09:2x). v20.ui 12/14: the two "week pay" checks click "previous week" and the seeded shifts now sit in the current week — calendar-relative test, not an app bug.
- Throwaway fp-v30-*@example.com accounts deleted. No real orders/emails touched; Mollie test mode.
- Old URL bazsozsolt.github.io/foodporter-app/* still 301s to foodporter.nl/* from GitHub CDN cache (age ~45 min at 10:08); should switch to app.foodporter.nl when the cache expires.
