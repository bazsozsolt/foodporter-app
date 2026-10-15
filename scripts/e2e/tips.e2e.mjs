// v17 P2: tips validated server-side, included in the Mollie amount, credited 100% to the rider, shown in payouts.
import { ADDRESS, login, ok, RID, SB_URL, summary } from "./common.mjs";
const admin = await login("ADMIN"), cust = await login("SIMC1"), rider = await login("SIMR3");
const err = (r) => r.error?.message ?? null;
const m = (await admin.sb.from("menu_items").select("id,name,price_cents").eq("restaurant_id", RID).eq("available", true).order("price_cents", { ascending: false }).limit(1).single()).data;
const o = (await cust.sb.from("orders").insert({ customer_id: cust.id, restaurant_id: RID, subtotal_cents: m.price_cents * 3, delivery_fee_cents: 295, address: ADDRESS, phone: "+31 6 0000 0000", status: "awaiting_payment" }).select("id").single()).data;
await cust.sb.from("order_items").insert({ order_id: o.id, menu_item_id: m.id, name: m.name, qty: 3, price_cents: m.price_cents });
const tok = (await cust.sb.auth.getSession()).data.session.access_token;
const pay = (tip) => fetch(`${SB_URL}/functions/v1/create-payment`, { method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json", Origin: "http://localhost:8787" }, body: JSON.stringify({ order_id: o.id, tip_cents: tip }) });
const bad = await pay(9999); const bb = await bad.json().catch(() => ({}));
ok("tip above €20 is refused server-side", bad.status === 422 && bb.code === "tip", `${bad.status}`);
ok("negative tip is refused", (await pay(-50)).status === 422);
const good = await pay(250); const gb = await good.json().catch(() => ({}));
ok("payment with a €2.50 tip is created", good.ok && !!gb.checkoutUrl, `${good.status} ${JSON.stringify(gb).slice(0, 100)}`);
const row = (await admin.sb.from("orders").select("tip_cents, subtotal_cents, delivery_fee_cents, service_fee_cents").eq("id", o.id).single()).data;
ok("tip is stored on the order", row?.tip_cents === 250, JSON.stringify(row));
const tamper = await cust.sb.from("orders").update({ tip_cents: 0 }).eq("id", o.id).select("id");
const after = (await admin.sb.from("orders").select("tip_cents").eq("id", o.id).single()).data;
ok("customer cannot change the tip afterwards", after.tip_cents === 250, err(tamper));
const mine = await cust.sb.from("orders").select("tip_cents").eq("id", o.id).single();
ok("customer can read their tip", mine.data?.tip_cents === 250, err(mine));
// simulate the paid + delivered path (test order) and check the rider credit
await admin.sb.from("orders").update({ is_test: true }).eq("id", o.id);
let d = { error: null };
for (const st of ["placed", "accepted", "assigned", "ready", "picked_up", "delivered"]) {
  const extra = st === "placed" ? { paid_at: new Date().toISOString(), payment_status: "paid" } : st === "assigned" ? { rider_id: rider.id, assigned_at: new Date().toISOString() } : {};
  d = await admin.sb.from("orders").update({ status: st, ...extra }).eq("id", o.id);
  if (d.error) { console.log(st, d.error.message); break; }
}
ok("admin marks the test order delivered", !err(d), err(d));
const e = (await rider.sb.from("earnings").select("amount_cents, tip_cents").eq("order_id", o.id).maybeSingle()).data;
ok("rider earns delivery fee + 100% of the tip", e?.tip_cents === 250 && e.amount_cents === row.delivery_fee_cents + 250, JSON.stringify(e));
const now = new Date(), from = new Date(now.getTime() - 3600e3).toISOString(), to = new Date(now.getTime() + 3600e3).toISOString();
const rep = await admin.sb.rpc("report_payments", { p_from: from, p_to: to });
const rr = (rep.data?.riders ?? []).find((x) => x.rider_id === rider.id);
ok("rider payouts report shows tips", rr && rr.tip_cents >= 250, err(rep));
ok("customer cannot run the payments report", !!err(await cust.sb.rpc("report_payments", { p_from: from, p_to: to })));
process.exit(summary() ? 1 : 0);
