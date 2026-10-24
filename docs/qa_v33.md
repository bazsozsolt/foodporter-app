# QA v33 — Sonic Jobs V.O.F. company details (2026-10-24, 17:21–18:10 Amsterdam)
Build 20261024152218 live (gh-pages ea33f8fb7b). KvK 42169998, btw NL870021977B01, Amarantstraat 6, 5044 RK Tilburg.
- company.ts (kvk/vat/address, email support@foodporter.nl) → footer; /terms, /privacy name address+KvK(+btw in terms).
- Templates 01–13 filled ({{KVK}}/{{ADRES}} + btw; [support@…]/[privacy@…] → real addresses), versions +0.1: rider_zzp 0.4, rider_employment 0.7, restaurant_partner 0.4, customer_terms 0.5, privacy_statement 0.6, dpa_restaurant 0.4, rider_conduct 0.3, platform_transparency 0.7, dpia_gps 0.5, processing_register 0.6, rider_onboarding 0.5, deactivation_appeal 0.3, dpa_payroll 0.3. Migration 20261024171000_v33_company_details (effective 2026-10-24; test accounts re-signed only). Synced to /workspace/foodporter/legal; checklist updated.
- Remaining placeholders by design: {{PAYROLL_PROVIDER}}, {{ARBODIENST}}, {{COMMISSIE_PCT}} (per-partner).
- Full suite (one browser, CRAWL_CONCURRENCY=1): run-all.sh all pass, 0 FAIL lines (erase 10/10, crawler 0 findings all roles), account.ui 20/20.
- Site: 16/16 pages show KvK, 27 links 200. Grep: no {{KVK}}/{{ADRES}}/[volgt]/[KvK-nummer]/Vestigingsadres left in either repo.
