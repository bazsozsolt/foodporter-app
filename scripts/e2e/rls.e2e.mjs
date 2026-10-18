// v28 RLS probe: every role (anon + 6 test accounts) reads every table; each visible row must belong to the caller.
// Write probes use no-op values or test rows only.
import { client, login, ok, summary } from "./common.mjs";
const OWN = { // table: [cols that may equal my uid], [cols that may equal my restaurant]
  account_status_log: [["profile_id"]], customer_credit: [["customer_id"]], earnings: [["rider_id"]], feedback: [["user_id"]],
  legal_acceptances: [["profile_id"], ["restaurant_id"]], legal_requests: [["profile_id"], ["restaurant_id"]],
  push_subscriptions: [["profile_id"]], referral_codes: [["customer_id"]], rider_availability: [["rider_id"]],
  rider_documents: [["profile_id"]], rider_hr: [["profile_id"]], rider_onboarding: [["profile_id"]], rider_shifts: [["rider_id"]],
  work_sessions: [["rider_id"]], work_violations: [["rider_id"]], payouts: [["rider_id"], ["restaurant_id"]],
  call_audit: [["caller_id"]], order_facts: [["customer_id", "rider_id"], ["restaurant_id"]],
  group_orders: [["host_id"], ["restaurant_id"]],
};
const ADMIN_ONLY = ["ops_alerts", "promo_codes", "call_config", "push_log", "push_vapid", "rate_limits", "audit_events", "public_holidays_x"];
const PUBLIC = ["restaurants", "menu_items", "settings", "legal_templates", "legal_templates_current", "public_holidays"];
const VIA_ORDER = { bids: "order_id", ratings: "order_id", order_metrics: "id" }; // party-of-the-order tables
const ALL = ["orders", ...Object.keys(VIA_ORDER), ...Object.keys(OWN), ...ADMIN_ONLY.filter(t => !t.endsWith("_x")), "profiles", "order_items", "order_messages", "support_tickets", "support_messages",
  "group_members", "group_items", "incidents", "rider_locations"];
const roles = [["anon"], ["HOST"], ["OUTSIDER"], ["STAFF"], ["RIDER"], ["SIMR1"], ["ADMIN"]];
const S = {};
for (const [r] of roles) {
  const u = r === "anon" ? { sb: client(), id: null } : await login(r);
  let rest = null;
  if (u.id) { const p = await u.sb.from("profiles").select("role,restaurant_id").eq("id", u.id).single(); rest = p.data?.restaurant_id ?? null; u.role = p.data?.role; }
  S[r] = { ...u, rest };
}
const counts = {};
for (const t of ALL) {
  counts[t] = {};
  for (const [r] of roles) {
    const { sb, id, rest, role } = S[r];
    let q = await sb.from(t).select(t === "orders" ? "id,customer_id,rider_id,restaurant_id,status,fulfilment" : "*").limit(5000);
    if (q.error && /permission denied for (table|view)/.test(q.error.message)) { counts[t][r] = "denied"; if (role !== "admin") ok(`${r} ${t}: no access`, true); continue; }
    if (q.error) { const own = OWN[t] ? [...new Set(OWN[t].flat())].join(",") : "id"; q = await sb.from(t).select(own).limit(5000); }
    const rows = q.data ?? []; counts[t][r] = q.error ? "err" : rows.length;
    if (role === "admin") continue;
    if (r === "anon") { ok(`anon ${t}: no rows`, rows.length === 0, `${rows.length}`); continue; }
    if (ADMIN_ONLY.includes(t)) { ok(`${r} ${t}: admin-only, no rows`, rows.length === 0, `${rows.length}`); continue; }
    if (OWN[t]) {
      const [mine, restc = []] = OWN[t];
      const bad = rows.filter(x => !mine.some(c => x[c] === id) && !(rest && restc.some(c => x[c] === rest)));
      ok(`${r} ${t}: only own rows (${rows.length})`, bad.length === 0, bad.length ? `${bad.length} foreign` : "");
    }
    if (VIA_ORDER[t]) { const vis = S[r].orderIds; const bad = rows.filter(x => !vis.has(x[VIA_ORDER[t]]) && !(t === "bids" && x.rider_id === id)); ok(`${r} ${t}: only rows of orders it can see (${rows.length})`, bad.length === 0, bad.length ? `${bad.length} foreign` : ""); }
    if (t === "orders") {
      S[r].orderIds = new Set(rows.map(x => x.id));
      const bad = rows.filter(x => x.customer_id !== id && x.rider_id !== id && !(rest && x.restaurant_id === rest) && !(role === "rider" && x.rider_id == null));
      ok(`${r} orders: only own/assigned/restaurant (${rows.length})`, bad.length === 0, bad.length ? `${bad.length} foreign` : "");
      if (role === "rider") { const open = rows.filter(x => x.rider_id == null && x.customer_id !== id); ok(`${r} unassigned orders visible only when looking for a rider`, open.every(x => ["ready","preparing","confirmed","paid","accepted"].includes(x.status) || x.fulfilment === "pickup" ? true : false), [...new Set(open.map(x => x.status))].join(",")); }
    }
    if (t === "profiles") { const others = rows.filter(x => x.id !== id); ok(`${r} profiles: no foreign email/phone`, others.every(x => !x.email && !x.phone), `${others.length} other profiles visible`); }
    if (t === "orders") ok(`${r} orders: phone column hidden or own`, !rows.some(x => x.phone && x.customer_id !== id));
  }
}
// orders phone column must be invisible (column grant) for authenticated
{ const q = await S.OUTSIDER.sb.from("orders").select("phone").limit(1); ok("orders.phone not selectable by customers", !!q.error); }
// write probes (non-admin)
for (const r of ["HOST", "STAFF", "RIDER"]) {
  const { sb, id } = S[r];
  const cur = (await S.ADMIN.sb.from("settings").select("id,rider_bonus_cents").single()).data;
  const u1 = await sb.from("settings").update({ rider_bonus_cents: cur.rider_bonus_cents }).eq("id", cur.id).select();
  ok(`${r} cannot update settings`, !!u1.error || (u1.data ?? []).length === 0);
  const u2 = await sb.from("profiles").update({ role: "admin" }).eq("id", id).select("role");
  const after = (await S.ADMIN.sb.from("profiles").select("role").eq("id", id).single()).data?.role;
  ok(`${r} cannot make itself admin`, after !== "admin", `now ${after}`);
  const i1 = await sb.from("earnings").insert({ rider_id: id, amount_cents: 1 }).select();
  ok(`${r} cannot insert earnings`, !!i1.error);
  const i2 = await sb.from("payouts").insert({ rider_id: id, amount_cents: 1 }).select();
  ok(`${r} cannot insert payouts`, !!i2.error);
  for (const fn of ["report_payments", "fp_payroll_week", "mark_rider_payout"]) {
    const args = fn === "report_payments" ? { p_from: "2026-01-01", p_to: "2026-12-31" } : fn === "fp_payroll_week" ? { p_week: "2026-10-12" } : { p_rider: id, p_from: "2026-01-01", p_to: "2026-12-31" };
    const x = await sb.rpc(fn, args); ok(`${r} rpc ${fn} denied`, !!x.error, x.error?.message?.slice(0, 40));
  }
}
{ const a = S.anon.sb; const x = await a.rpc("report_payments", { p_from: "2026-01-01", p_to: "2026-12-31" }); ok("anon rpc report_payments denied", !!x.error);
  const y = await a.from("orders").insert({ restaurant_id: S.STAFF.rest, status: "paid" }).select(); ok("anon cannot insert orders", !!y.error); }
console.log("\nVisible rows per role:\n" + Object.entries(counts).map(([t, c]) => t.padEnd(22) + roles.map(([r]) => `${r}:${c[r]}`).join(" ")).join("\n"));
process.exit(summary() ? 1 : 0);
