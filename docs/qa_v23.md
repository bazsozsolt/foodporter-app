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
