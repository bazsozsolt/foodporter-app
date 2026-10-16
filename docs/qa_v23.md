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
## Phase 3: role flows, one suite at a time (load checked, leftovers killed after each)
- Node e2e: all 17 suites green. core 38, group 47, push 24, support 40, chat 46, chat-admin 10, photos 13, compliance 13, tips 10, hours 18, proof 16, pickup 15, promo 34, cross 66, legal 45, employment 34, v20 35. That covers customer, group, pickup, scheduled, promo, tips, rider clock-in, call-ins, rest, restaurant, admin, payroll, legal and support.
- New scripts/e2e/v22.ui.py (30 checks, NL + EN):
  - white header and red wordmark;
  - cart bar does not overlap the tab bar;
  - sheet is a modal dialog, fully on screen, checkout button reachable;
  - Esc, backdrop tap and removing the last item all close the sheet;
  - sheet → checkout works, and /cart still works as fallback;
  - rider main screen is compact, the Diensten tab is marked current, the compact line links to the tab;
  - restaurant KPI line;
  - admin search finds #1600 outside the date range;
  - 44 px tap targets on every visible control.
- **Bug found and fixed:** after emptying the cart in the sheet, adding a dish reopened the sheet straight away and the overlay blocked the page. The add button now closes it.
- **Fixed:** controls under 44 px: Item niet beschikbaar (38 px), shift delete, legal expand, install prompt, SOS, chat send, data export, group deadline chips.
- UI suites:
  - manual-assign 4/4, legal 14, v19 11, v20 14, admin-smoke 25, notify 8, sound 8, v13 15: all green.
  - v20: one transient login miss; passed on rerun.
  - support.ui: 14/14 after a test fix. It had picked an already refunded order, so it hit the refund cap ("niets meer terug te betalen"), which is correct behaviour. It now picks an unrefunded order (never 1043/1046) and polls for the message.
  - v13: 15/15 after a test fix. Rider SIMR1 still has 2 old test orders assigned from yesterday (1731/1732), so the test opened the wrong chat. Job cards now have a `job-<id>` testid and the test targets its own order.
  - push.ui 4/6: headless Chromium has no push service. Known environment limit, not part of run-all; push.e2e passes 24/24 on the server side.
## Phase 4: crawler (full mode = mobile + desktop × NL + EN, one role at a time, local build of HEAD)
- anon: 60 visits, 154 clicks, 0 findings.
- customer: 68 visits, 222 clicks, 0 findings.
- rider (including /rider/shifts): 16 visits, 48 clicks, 0 findings.
- restaurant: 8 visits, 24 clicks, 0 findings.
- admin: 64 visits, 328 clicks, 0 findings.
- admin-as-roles: 40 visits, 169 clicks, 0 findings.
- Admin was cut off twice by outside interruptions (an external kill of the run and the browser), not by the crawler; the third run was clean.
- Load peaked at 6.9 for a moment after the restaurant role, then dropped back below 1.5 before the next role started.
- Stale test orders 1731/1732 (SIMR1, is_test): confirmed cancelled. Riders have no active test jobs left. 1043/1046 untouched.
## Phase 5: a11y and visual
- a11y.ui.py: 38/38 page × language combinations with "axe: none" and no missing focus rings, /rider/shifts included.
- Visual check of the local HEAD screenshots (/tmp/v23shots): white header and red wordmark on all roles, cart sheet above the tab bar, rider main screen compact, Diensten tab active, restaurant KPI line, admin English. 44 px targets are enforced by v22.ui.py (30/30).
- Note: the admin "Needs attention" list shows test-only "refund failed: already refunded" alerts from the earlier support.ui runs (caused by the old order-picking), plus test SOS tickets. These are test data and can be resolved in the admin.
## Phase 6: deploy
- One deploy: gh-pages 9a426646e. Live version.json {"build":"20261016080010"} matches the local build.
- Affected suites rerun against live: v22.ui 30/30, v13.ui 15/15, support.ui 14/14. Load stayed under 2.
