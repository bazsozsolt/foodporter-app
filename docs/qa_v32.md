# QA v32 — Sonic Jobs V.O.F. as project owner + legal party (2026-10-24, 16:37–17:20 Amsterdam)
Builds: 20261024143946 (powered-by, Next 16.4.3) and 20261024144219 (legal party) — live, gh-pages 859b9029dc.
## Changes
- Footer (all pages): "Een project van Sonic Jobs V.O.F." / "Powered by Sonic Jobs V.O.F."; company line now "Sonic Jobs V.O.F. h.o.d.n. Food Porter · KvK [KvK-nummer] · btw [..] · [adres]" (src/lib/company.ts name set; kvk/vat/address/email stay placeholders).
- Welcome/Over ons: "Food Porter is een project van Sonic Jobs V.O.F.".
- /terms and /privacy: name Sonic Jobs V.O.F. h.o.d.n. Food Porter as contracting party / controller (NL+EN), updated 24-10-2026.
- Legal templates 01–13: {{BEDRIJFSNAAM}} → "Sonic Jobs V.O.F. h.o.d.n. Food Porter"; 07–12 got a "Verantwoordelijke partij" line. Versions +0.1: rider_zzp 0.3, rider_employment 0.6, restaurant_partner 0.3, customer_terms 0.4, privacy_statement 0.5, dpa_restaurant 0.3, rider_conduct 0.2, platform_transparency 0.6, dpia_gps 0.4, processing_register 0.5, rider_onboarding 0.4, deactivation_appeal 0.2, dpa_payroll 0.2. Re-rendered HTML+PDF; migration 20261024150000_v32_legal_entity (new rows via version table, effective 2026-10-24, sha256 of html; re-sign TEST accounts only — real riders/restaurants get the re-accept prompt).
- compliance-checklist: legal party item + lawyer question (V.O.F. partners jointly and severally liable; V.O.F. suitable as employer vs BV; SBI/activities cover meal delivery/platform; trade name registered). Synced to /workspace/foodporter/legal.
- Next.js 16.4.0 → 16.4.3 (critical advisory GHSA-2464-fhr4-w9xw etc.; build had started failing with SecurityFatalError). tsc 0, eslint 0 errors.
## Tests (live, one browser, CRAWL_CONCURRENCY=1, load < 0.7)
- run-all.sh: all suites pass except erase (5/10) — test bug: random password sometimes missed a character class under the strict policy. Fixed (suffix "Aa1!"), rerun 10/10.
- legal 45, legal-ui 14, v19-ui 11, v20-ui 14, v26-ui 37, reports 14, i18n 821 pairs 0 problems, a11y 0 critical/serious, crawler 0 findings.
- account.ui.py not rerun (needs a throwaway email arg; no auth-flow code changed).
Test data only; 1043/1046 untouched; Mollie test mode.
