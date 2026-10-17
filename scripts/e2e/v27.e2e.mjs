// v27: delivery-fee split. Fixed rider bonus per delivery (settings, 0-200 cents) stored on the order at payment; earnings = bonus + tip;
// historic orders keep their old rider amounts; company revenue = commission + delivery fee - rider bonus + service fee; reports reconcile.
// Test accounts only, Mollie test mode.
import { login, ok, RID, SB_URL, ADDRESS, summary } from "./common.mjs";
const admin = await login("ADMIN"), cust = await login("SIMC1"), staff = await login("STAFF"), rider = await login("SIMR3");
const err = (r) => r?.error?.message ?? null;
const s0 = (await admin.sb.from("settings").select("id, rider_bonus_cents").single()).data;
ok("rider bonus default €0.50", s0.rider_bonus_cents === 50);
for (const v of [201, -1, 2.5]) ok(`settings reject rider bonus ${v}`, !!err(await admin.sb.from("settings").update({ rider_bonus_cents: v }).eq("id", s0.id).select("id")));
for (const [n, who] of [["customer", cust], ["restaurant", staff], ["rider", rider]]) {
  const r = await who.sb.from("settings").update({ rider_bonus_cents: 200 }).eq("id", s0.id).select("id");
  ok(`${n} cannot change the rider bonus setting`, !!err(r) || (r.data ?? []).length === 0);
}
ok("setting unchanged", (await admin.sb.from("settings").select("rider_bonus_cents").single()).data.rider_bonus_cents === 50);

const m = (await admin.sb.from("menu_items").select("id,name,price_cents").eq("restaurant_id", RID).eq("available", true).order("price_cents", { ascending: false }).limit(1).single()).data;
const qty = Math.max(1, Math.ceil(1600 / m.price_cents));
const tok = (await cust.sb.auth.getSession()).data.session.access_token;
const pay = (body) => fetch(`${SB_URL}/functions/v1/create-payment`, { method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json", Origin: "http://localhost:8787" }, body: JSON.stringify(body) });
async function order(extra = {}) {
  const ins = await cust.sb.from("orders").insert({ customer_id: cust.id, restaurant_id: RID, subtotal_cents: 1, delivery_fee_cents: 100, rider_bonus_cents: 999,
    address: ADDRESS, phone: "+31 6 0000 0000", status: "awaiting_payment", ...extra }).select("id, rider_bonus_cents").single();
  await cust.sb.from("order_items").insert({ order_id: ins.data.id, menu_item_id: m.id, name: m.name, qty, price_cents: 1 });
  await admin.sb.from("orders").update({ is_test: true }).eq("id", ins.data.id);
  return ins;
}
const week = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
const wk0 = (await admin.sb.rpc("fp_rider_week", { p_rider: rider.id, p_week: week })).data;
const d = await order();
ok("client-sent rider bonus is discarded", d.data.rider_bonus_cents == null, JSON.stringify(d.data));
const pr = await pay({ order_id: d.data.id, tip_cents: 150 }); const pj = await pr.json().catch(() => ({}));
ok("payment created (Mollie test)", pr.ok && pj.testmode === true, `${pr.status}`);
ok("no rider bonus before payment", (await admin.sb.from("orders").select("rider_bonus_cents").eq("id", d.data.id).single()).data.rider_bonus_cents == null);
await admin.sb.from("orders").update({ status: "placed", paid_at: new Date().toISOString(), payment_status: "paid" }).eq("id", d.data.id);
const paid = (await admin.sb.from("orders").select("rider_bonus_cents, delivery_fee_cents, service_fee_cents, commission_cents, tip_cents").eq("id", d.data.id).single()).data;
ok("bonus stored at payment = €0.50", paid.rider_bonus_cents === 50, JSON.stringify(paid));
for (const [n, who] of [["customer", cust], ["restaurant", staff], ["rider", rider]]) await who.sb.from("orders").update({ rider_bonus_cents: 999 }).eq("id", d.data.id);
ok("customer/restaurant/rider cannot change the stored bonus", (await admin.sb.from("orders").select("rider_bonus_cents").eq("id", d.data.id).single()).data.rider_bonus_cents === 50);
await admin.sb.from("settings").update({ rider_bonus_cents: 120 }).eq("id", s0.id);
await admin.sb.from("orders").update({ status: "accepted", prep_minutes: 10, accepted_at: new Date().toISOString() }).eq("id", d.data.id);
ok("later setting change does not alter a paid order", (await admin.sb.from("orders").select("rider_bonus_cents").eq("id", d.data.id).single()).data.rider_bonus_cents === 50);
await admin.sb.from("settings").update({ rider_bonus_cents: 50 }).eq("id", s0.id);
for (const st of ["assigned", "ready", "picked_up", "delivered"]) {
  const r = await admin.sb.from("orders").update({ status: st, ...(st === "assigned" ? { rider_id: rider.id, assigned_at: new Date().toISOString() } : {}), ...(st === "ready" ? { ready_at: new Date().toISOString() } : {}),
    ...(st === "picked_up" ? { picked_up_at: new Date().toISOString() } : {}), ...(st === "delivered" ? { delivered_at: new Date().toISOString() } : {}) }).eq("id", d.data.id).select("status");
  if (err(r)) console.log("  step", st, err(r));
}
const earn = (await admin.sb.from("earnings").select("amount_cents, tip_cents").eq("order_id", d.data.id).maybeSingle()).data;
ok("rider earning = bonus €0.50 + 100% of the tip", earn && earn.amount_cents === 50 + 150 && earn.tip_cents === 150, JSON.stringify(earn));
const wk1 = (await admin.sb.rpc("fp_rider_week", { p_rider: rider.id, p_week: week })).data;
ok("weekly summary: bonus +€0.50, tips +€1.50", wk1.bonus_cents - wk0.bonus_cents === 50 && wk1.tips_cents - wk0.tips_cents === 150, `${wk0.bonus_cents}→${wk1.bonus_cents}, ${wk0.tips_cents}→${wk1.tips_cents}`);
const mon = new Date(week); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
const pw = ((await admin.sb.rpc("fp_payroll_week", { p_week: mon.toISOString().slice(0, 10) })).data ?? []).find((r) => r.rider_id === rider.id);
ok("payroll export carries the same bonus", pw && pw.bonus_cents === wk1.bonus_cents, JSON.stringify(pw ?? {}).slice(0, 120));
const fact = (await admin.sb.from("order_facts").select("rider_bonus_cents, company_revenue_cents, commission_cents, delivery_fee_cents, service_fee_cents").eq("id", d.data.id).single()).data;
ok("company revenue = commission + delivery fee − bonus + service fee", fact.company_revenue_cents === fact.commission_cents + fact.delivery_fee_cents - 50 + fact.service_fee_cents && fact.service_fee_cents === 99, JSON.stringify(fact));
// pickup
const p = await order({ fulfilment: "pickup", address: "Afhalen bij 't Kaasbolleke" });
await pay({ order_id: p.data.id, tip_cents: 0 });
await admin.sb.from("orders").update({ status: "placed", paid_at: new Date().toISOString(), payment_status: "paid" }).eq("id", p.data.id);
ok("pickup: rider bonus 0", (await admin.sb.from("orders").select("rider_bonus_cents").eq("id", p.data.id).single()).data.rider_bonus_cents === 0);
await admin.sb.from("orders").update({ status: "cancelled", cancel_reason: "v27 test", cancelled_at: new Date().toISOString() }).eq("id", p.data.id);
// historic
const old = (await admin.sb.from("orders").select("id, delivery_fee_cents, rider_bonus_cents, earnings(amount_cents, tip_cents)").lt("paid_at", "2026-10-17T10:00:00Z").eq("status", "delivered").not("rider_id", "is", null).limit(300)).data ?? [];
const withE = old.filter((o) => (o.earnings ?? []).length || o.earnings?.amount_cents != null).map((o) => ({ ...o, e: Array.isArray(o.earnings) ? o.earnings[0] : o.earnings }));
ok("historic orders keep NULL bonus (old terms)", old.length > 0 && old.every((o) => o.rider_bonus_cents == null), `${old.length}`);
ok("historic earnings still = full delivery fee + tip", withE.length > 0 && withE.every((o) => o.e.amount_cents - (o.e.tip_cents ?? 0) === o.delivery_fee_cents), `${withE.length} checked`);
const hf = (await admin.sb.from("order_facts").select("id, rider_bonus_cents, delivery_fee_cents").in("id", old.slice(0, 50).map((o) => o.id))).data ?? [];
ok("reports count the old rider amount for historic orders", hf.length > 0 && hf.every((f) => f.rider_bonus_cents === f.delivery_fee_cents));
// reconcile report_payments.platform with order_facts + earnings for the window
const from = new Date(Date.now() - 2 * 864e5).toISOString(), to = new Date(Date.now() + 3600e3).toISOString();
const rp = (await admin.sb.rpc("report_payments", { p_from: from, p_to: to })).data;
const facts = (await admin.sb.from("order_facts").select("id, rider_id, commission_cents, delivery_fee_cents, rider_bonus_cents, service_fee_cents, tip_cents, company_revenue_cents").eq("status", "delivered").gte("delivered_at", from).lt("delivered_at", to).limit(5000)).data ?? [];
const sum = (k, xs = facts) => xs.reduce((a, f) => a + Number(f[k] ?? 0), 0);
const pf = rp.platform;
ok("platform totals = sum of delivered orders", pf.orders === facts.length && pf.commission_cents === sum("commission_cents") && pf.rider_bonus_cents === sum("rider_bonus_cents") && pf.service_fee_cents === sum("service_fee_cents") && pf.company_revenue_cents === sum("company_revenue_cents"), JSON.stringify(pf));
ok("company revenue identity holds", pf.company_revenue_cents === pf.commission_cents + pf.delivery_fee_cents - pf.rider_bonus_cents + pf.service_fee_cents);
const ids = facts.filter((f) => f.rider_id).map((f) => f.id); let es = [];
for (let i = 0; i < ids.length; i += 200) es = es.concat((await admin.sb.from("earnings").select("order_id, amount_cents, tip_cents").in("order_id", ids.slice(i, i + 200))).data ?? []);
const byId = new Map(facts.map((f) => [f.id, f]));
ok("rider bonuses in the report = rider earnings (excl. tips)", es.length > 0 && es.every((e) => e.amount_cents - (e.tip_cents ?? 0) === byId.get(e.order_id).rider_bonus_cents), `${es.length} earnings`);
ok("customer cannot read the revenue report", !!err(await cust.sb.rpc("report_payments", { p_from: from, p_to: to })));
console.log("test orders:", d.data.id, p.data.id);
process.exit(summary() ? 1 : 0);
