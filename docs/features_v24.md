# v24: improvements (2026-10-16)
## Phase A: candidates, ranked by value/effort (already present: reorder button, offline banner, webp-resized menu uploads, tip at checkout)
| # | Candidate | Value | Effort | Decision |
|---|---|---|---|---|
| 1 | 2-year retention purge for support/chat/status logs (cron) | High (GDPR promise in privacy page) | S | **do** |
| 2 | Restaurant "sold out until tomorrow" with automatic return | High (fewer cancellations) | S | **do** |
| 3 | Favourites (heart on cards plus a "Favorieten" chip on home, on-device) | Med-high | S | **do** |
| 4 | Admin today KPIs: late %, acceptance (bid) rate, avg delivery time, cancellations | Med-high | S | **do** |
| 5 | Allergen-free filter on home ("zonder gluten/noten…" across restaurants) | Med | M | **do if time** |
| 6 | After-delivery tip (second Mollie payment) | Med | L, touches payments | skip: needs Zsolt (fees, UX, Mollie live) |
| 7 | ETA accuracy (learn per-restaurant prep from actual_prep_minutes) | Med | M | later (needs more real data) |
| 8 | Rider weekly insights chart | Low-med | M | later |
| 9 | Rating flow polish | Low (already works) | S | later |
| 10 | Image optimisation | n/a | n/a | already webp + resize for menu; proof/support photos are resized JPEG |

## Phase B: implemented (one commit each)
1. **v24.1 Status-log retention:** `fp_purge_status_log()` (service_role only) plus daily cron `fp-purge-status-log` at 03:35 deletes account_status_log rows older than 2 years, as promised in deactivation_appeal §5. Tested in a rolled-back transaction: a 3-year-old row was purged, a 1-year-old row kept.
2. **v24.2 Sold out until tomorrow:**
   - The restaurant Menu tab has a "Snel aanpassen: uitverkocht" panel: one tap sets available=false until tomorrow 06:00, and "Weer aan" restores it.
   - New column menu_items.sold_out_until. `fp_restore_sold_out()` runs every 5 min via cron.
   - Customers no longer see the dish, and create-payment refuses it (400).
3. **v24.3 Favourites:**
   - Heart on each restaurant card (a sibling of the link, so no nested-interactive problem) and on the menu header.
   - "♥ Favorieten (n)" chip on home.
   - Stored on the device only (fp-favs). No server data, so no privacy impact.
4. **v24.4 Admin today health:**
   - Late deliveries (with average minutes late), On time, Cancelled (% of orders) and Avg order → door.
   - Calculated from order_facts. Admin is in English.
5. **v24.5 "Zonder <allergeen>" on home:** shows restaurants with at least one dish that has allergen info and doesn't contain the chosen allergen. All 14 EU allergens, NL/EN.

## Phase C: verification
- v24.e2e 10/10, v24.ui 17/17 (local and live), v22.ui 36/36, core 38, group 47, cross 66.
- a11y 38/38 clean. Parity 767 pairs, 0 problems.
- Crawler quick, one role at a time: 0 findings for all 6 roles. Load stayed under 1.
- Deploy gh-pages 8995b8c48. Live version.json {"build":"20261016094019"} verified.
- Screenshots: screens_v24/home-favourites-nl.png, home-without-gluten-nl.png, restaurant-sold-out-nl.png, admin-today-health.png.

## Remaining / needs Zsolt
- Retention for support tickets and chat: not stated in the privacy page. Proposal: 2 years for support, 6 months for order chat. Needs Zsolt's decision before adding the purge.
- After-delivery tip (second Mollie payment): needs a decision on fees and UX before going live.
- Allergen data is still "test values" for OSM restaurants, so the filter is only as good as the restaurants' own tagging.
- Later: ETA learning from actual_prep_minutes, rider weekly insights, rating polish.
