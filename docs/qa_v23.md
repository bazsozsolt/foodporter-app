# QA v23: full recheck after the v22 redesign (2026-10-16)
## Phase 1: static
- tsc OK. eslint: 0 errors, 1 known warning (`<img>` in DeliveryProof, intentional for signed proof URLs). i18n parity: 747 pairs, 0 problems.
- links.py (live): 73 internal links, 0 broken; 5 external, 0 non-2xx. New assets (wordmark-red.png, /rider/shifts/) return 200.
- Legal PDFs: 27 checked live, 0 bad (HTTP code + pdfinfo).
## Phase 2: Supabase
- Security advisors:
  - WARN: anon can execute fp_restaurant_open. Intended: guests can see opening hours.
  - WARN: leaked-password protection is off. Dashboard setting, needs Zsolt.
  - WARN: the authenticated SECURITY DEFINER RPCs. Intended: all of them are guarded inside.
  - INFO: RLS without policies on call_config, push_vapid, rate_limits, push_log. Intended: service_role only.
  - Same set as v21, nothing new.
- Performance advisors: INFO only. 10 unused FK indexes on low-traffic tables (incidents, call_audit, support, …). Kept on purpose, since they back the v21 FK fixes.
- rls-probe: 12/12 privileged RPCs refused for the wrong roles. The visibility matrix matches the role design (riders see only their own status log, customers and riders see only their own bids).
