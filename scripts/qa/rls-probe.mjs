// RLS probe: how many rows each role can read per table, and whether writes on HR tables are refused. Read-only except refused writes.
import { client, login } from "../e2e/common.mjs";
const T = ["account_status_log","audit_events","bids","call_audit","call_config","customer_credit","earnings","feedback","group_items","group_members","group_orders","incidents","legal_acceptances","legal_requests","legal_templates","menu_items","ops_alerts","order_items","order_messages","orders","payouts","profiles","promo_codes","public_holidays","push_log","push_subscriptions","push_vapid","rate_limits","ratings","referral_codes","restaurants","rider_availability","rider_documents","rider_hr","rider_locations","rider_onboarding","rider_shifts","settings","support_messages","support_tickets","work_sessions","work_violations","order_facts","order_metrics"];
const roles = { anon: { sb: client(), id: null }, customer: await login("OUTSIDER"), rider: await login("SIMR3"), staff: await login("STAFF") };
const rows = [];
for (const t of T) {
  const r = { t };
  for (const [k, u] of Object.entries(roles)) { const q = await u.sb.from(t).select("*", { count: "exact", head: true }); r[k] = q.error ? "x" : q.count; }
  rows.push(r);
}
console.table(rows);
const c = roles.customer, rd = roles.rider;
const w = async (n, p) => { const r = await p; console.log((r.error || (r.data ?? []).length === 0 ? "REFUSED " : "ALLOWED!! ") + n); };
await w("customer insert rider_hr", c.sb.from("rider_hr").insert({ profile_id: c.id, contract_type: "employment" }).select());
await w("rider edits own rider_hr", rd.sb.from("rider_hr").update({ contract_kind: "min_max", min_hours_week: 1, max_hours_week: 2 }).eq("profile_id", rd.id).select());
await w("rider inserts onboarding step", rd.sb.from("rider_onboarding").insert({ profile_id: rd.id, step: "iban" }).select());
await w("rider inserts holiday", rd.sb.from("public_holidays").insert({ day: "2026-11-11", name: "x" }).select());
await w("rider updates settings", rd.sb.from("settings").update({ rest_min_h: 11 }).eq("id", true).select());
await w("customer reads payroll", c.sb.rpc("fp_payroll_week", { p_week: "2026-10-12" }));
await w("customer rest overview", c.sb.rpc("fp_rest_overview"));
await w("customer others legal status", c.sb.rpc("fp_rider_legal_status", { p_rider: rd.id }));
await w("customer avg hours", c.sb.rpc("fp_avg_week_hours", { p_rider: rd.id }));
await w("customer decline shift", c.sb.rpc("rider_decline_shift", { p_id: 1 }));
await w("staff atw check", roles.staff.sb.rpc("fp_atw_check_now"));
await w("anon rider_week", roles.anon.sb.rpc("fp_rider_week", { p_rider: rd.id, p_week: "2026-10-12" }));
process.exit(0);
