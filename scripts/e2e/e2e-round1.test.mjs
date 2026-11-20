// Unit checks for the eight e2e-round-1 fixes. No network, no secrets.
import { isStaleAssignment, assignmentExpectedAt, STALE_ASSIGNMENT_GRACE_MS, isTodayAmsterdam, amsterdamDay } from "../../src/lib/staleAssignment.ts";
import { riderEarningsCents, paidTotalCents, orderMoneyBreakdown } from "../../src/lib/orderMoney.ts";
import { loadCheckoutDraft, saveCheckoutDraft, clearCheckoutDraft, CHECKOUT_DRAFT_KEY } from "../../src/lib/checkoutDraft.ts";

let fail = 0;
const ok = (name, cond, x = "") => { if (!cond) { fail++; console.log("FAIL " + name + (x ? " — " + x : "")); } else console.log("PASS " + name); };

const now = Date.parse("2026-11-20T22:00:00+01:00");
const hoursAgo = (h) => new Date(now - h * 3600 * 1000).toISOString();

ok("assigned 4h ago is stale", isStaleAssignment({ status: "assigned", assigned_at: hoursAgo(4) }, now));
ok("assigned 2h ago is not stale", !isStaleAssignment({ status: "assigned", assigned_at: hoursAgo(2) }, now));
ok("exactly 3h ago is not stale (strictly older than the grace)", !isStaleAssignment({ status: "assigned", assigned_at: hoursAgo(3) }, now));
ok("3h plus 1s is stale", isStaleAssignment({ status: "assigned", assigned_at: new Date(now - STALE_ASSIGNMENT_GRACE_MS - 1000).toISOString() }, now));
ok("ready_at 4h ago is stale even if assigned earlier", isStaleAssignment({ status: "ready", assigned_at: hoursAgo(8), ready_at: hoursAgo(4) }, now));
ok("ready_at 1h ago is not stale even if assigned 8h ago", !isStaleAssignment({ status: "ready", assigned_at: hoursAgo(8), ready_at: hoursAgo(1) }, now));
ok("picked_up 5h ago is not stale", !isStaleAssignment({ status: "picked_up", assigned_at: hoursAgo(6), ready_at: hoursAgo(5) }, now));
ok("delivered is not stale", !isStaleAssignment({ status: "delivered", assigned_at: hoursAgo(8), ready_at: hoursAgo(7) }, now));
ok("placed is not stale", !isStaleAssignment({ status: "placed", assigned_at: hoursAgo(8) }, now));
ok("assigned with no timestamps is not stale", !isStaleAssignment({ status: "assigned" }, now));
ok("expected time prefers ready_at", assignmentExpectedAt({ status: "ready", assigned_at: hoursAgo(8), ready_at: hoursAgo(1) }) === Date.parse(hoursAgo(1)));

ok("today in Amsterdam", isTodayAmsterdam("2026-11-20T23:13:59+01:00", now) && amsterdamDay(now) === "2026-11-20");
ok("yesterday is not today", !isTodayAmsterdam("2026-11-19T23:00:00+01:00", now));

ok("earnings = bonus + tip", riderEarningsCents({ rider_bonus_cents: 50, tip_cents: 100, delivery_fee_cents: 249 }) === 150);
ok("earnings do not use the delivery fee", riderEarningsCents({ rider_bonus_cents: 50, tip_cents: 100, delivery_fee_cents: 249 }) !== 249 + 100);
ok("missing bonus falls back to 50, or settings", riderEarningsCents({ tip_cents: 100, delivery_fee_cents: 249 }) === 150
  && riderEarningsCents({ tip_cents: 0, delivery_fee_cents: 249 }, { rider_bonus_cents: 80 }) === 80);
ok("pickup earns only the tip", riderEarningsCents({ fulfilment: "pickup", rider_bonus_cents: 50, tip_cents: 100, delivery_fee_cents: 0 }) === 100);

const money = orderMoneyBreakdown({ subtotal_cents: 1790, delivery_fee_cents: 249, service_fee_cents: 99, tip_cents: 100, discount_cents: 0, credit_cents: 0 });
ok("customer total includes tip", money.total_cents === 2238 && money.tip_cents === 100 && money.food_cents === 1790);
ok("paidTotalCents matches", paidTotalCents({ subtotal_cents: 1790, delivery_fee_cents: 249, service_fee_cents: 99, tip_cents: 100 }) === 2238);
ok("discount and credit come off the total", orderMoneyBreakdown({ subtotal_cents: 1790, delivery_fee_cents: 249, service_fee_cents: 99, tip_cents: 100, discount_cents: 200, credit_cents: 50 }).total_cents === 1988);

// sessionStorage polyfill for Node
const mem = new Map();
globalThis.sessionStorage = { getItem: (k) => mem.has(k) ? mem.get(k) : null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const draft = { restaurant_id: "rest-1", address: "Heuvelstraat 12, Tilburg", phone: "0612345678", tip: 100, customTip: "", door: false, pickup: false, method: "iDEAL", when: null, quote: { q: { code: "TESTPROMO", discount_cents: 300, credit_cents: 0, error: null }, code: "TESTPROMO", credit: false }, geo: { lat: 51.55, lng: 5.09, label: "Heuvelstraat 12", distance_km: 0.2 } };
saveCheckoutDraft(draft);
ok("draft restores for the same restaurant", loadCheckoutDraft("rest-1")?.phone === "0612345678" && loadCheckoutDraft("rest-1")?.quote.code === "TESTPROMO" && loadCheckoutDraft("rest-1")?.tip === 100);
ok("draft is ignored for another restaurant", loadCheckoutDraft("rest-2") == null);
clearCheckoutDraft();
ok("draft clears", loadCheckoutDraft("rest-1") == null && !mem.has(CHECKOUT_DRAFT_KEY));

console.log(fail ? fail + " failed" : "all passed");
process.exit(fail ? 1 : 0);
