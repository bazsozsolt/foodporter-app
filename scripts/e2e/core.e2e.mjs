// Core order flow + RLS negatives: customer -> Mollie test payment -> restaurant accepts -> rider bids -> ready -> picked up -> delivered -> rating -> KPI.
import { execSync } from "child_process";
import { login, client, ok, errOf, sleep, RID, ADDRESS, summary } from "./common.mjs";
const cust = await login("HOST"), other = await login("CUST2"), staff = await login("STAFF"), rider = await login("RIDER"), admin = await login("ADMIN");
const anon = client();
const { data: menu } = await cust.sb.from("menu_items").select("id,name,price_cents").eq("restaurant_id", RID).eq("available", true).limit(2);

// --- anon / cross-account negatives (no order needed)
let q = await anon.from("orders").select("id").limit(1); ok("anon cannot read orders", !!q.error || q.data.length === 0, errOf(q));
q = await anon.from("profiles").select("id").limit(1); ok("anon cannot read profiles", !!q.error || q.data.length === 0, errOf(q));
q = await anon.from("settings").update({ delivery_fee_cents: 100 }).eq("id", 1).select(); ok("anon cannot change settings", !!q.error || q.data.length === 0, errOf(q));
q = await cust.sb.from("settings").update({ delivery_fee_cents: 100 }).neq("delivery_fee_cents", -1).select(); ok("customer cannot change settings", !!q.error || q.data.length === 0, errOf(q));
q = await cust.sb.from("profiles").update({ role: "admin" }).eq("id", cust.id).select(); ok("customer cannot make self admin", !!q.error || q.data?.[0]?.role !== "admin", errOf(q));
q = await cust.sb.from("profiles").select("id").neq("id", cust.id); ok("customer sees no other profiles", (q.data ?? []).length === 0, String(q.data?.length));
let r = await cust.sb.rpc("purge_test_data"); ok("customer cannot purge test data", !!r.error, errOf(r));
r = await cust.sb.rpc("report_key_metric", { p_from: "2026-01-01", p_to: "2027-01-01" }); ok("customer cannot read key metric", !!r.error, errOf(r));
r = await rider.sb.rpc("report_payments", { p_from: "2026-01-01", p_to: "2027-01-01" }); ok("rider cannot read payment report", !!r.error, errOf(r));
q = await cust.sb.from("orders").select("phone").limit(1); ok("phone column not readable via API", !!q.error, errOf(q));

// --- customer places + pays
q = await cust.sb.from("orders").insert({ customer_id: cust.id, restaurant_id: RID, subtotal_cents: 1, delivery_fee_cents: 250, address: ADDRESS, phone: "0612345678", status: "delivered", rider_id: rider.id }).select("id,status,rider_id,delivery_fee_cents").single();
ok("order insert sanitised (status/rider/fee forced)", q.data?.status === "awaiting_payment" && q.data?.rider_id === null, JSON.stringify(q.data) + (errOf(q) ?? ""));
const OID = q.data.id;
q = await cust.sb.from("order_items").insert([{ order_id: OID, menu_item_id: menu[0].id, name: "Free lunch", qty: 2, price_cents: 1 }, { order_id: OID, menu_item_id: menu[1].id, name: "x", qty: 1, price_cents: 0 }]);
ok("customer adds items", !q.error, errOf(q));
let { data: o } = await cust.sb.from("orders").select("subtotal_cents, order_items(name, price_cents)").eq("id", OID).single();
const expected = 2 * menu[0].price_cents + menu[1].price_cents;
ok("item names/prices + subtotal come from the menu", o.subtotal_cents === expected && o.order_items.every((i) => menu.some((m) => m.name === i.name && m.price_cents === i.price_cents)), `${o.subtotal_cents} vs ${expected}`);
q = await other.sb.from("orders").select("id").eq("id", OID); ok("other customer cannot see the order", q.data?.length === 0);
q = await staff.sb.from("orders").select("id").eq("id", OID); ok("restaurant cannot see unpaid order", q.data?.length === 0);
q = await rider.sb.from("orders").select("id").eq("id", OID); ok("rider cannot see unpaid order", q.data?.length === 0);
r = await other.sb.functions.invoke("create-payment", { body: { order_id: OID } }); ok("other customer cannot start payment", !!r.error);
r = await cust.sb.functions.invoke("create-payment", { body: { order_id: OID } });
ok("create-payment (Mollie test mode)", !!r.data?.checkoutUrl && r.data.testmode === true, r.data?.paymentId);
const payOut = execSync(`python3 ${new URL("./pay.py", import.meta.url).pathname} "${r.data.checkoutUrl}"`, { encoding: "utf8", timeout: 90000 });
const backUrl = (payOut.match(/final url: (\S+)/) ?? [])[1] ?? "";
ok("Mollie returns the customer to the app", backUrl.startsWith((process.env.FP_BASE ?? "https://app.foodporter.nl") + "/"), backUrl);
for (let k = 0; k < 15; k++) { ({ data: o } = await cust.sb.from("orders").select("status,payment_status,total:subtotal_cents").eq("id", OID).single()); if (o.payment_status === "paid") break; await sleep(2000); }
ok("webhook marks order paid -> placed", o.status === "placed" && o.payment_status === "paid", JSON.stringify(o));
q = await cust.sb.from("orders").update({ status: "delivered" }).eq("id", OID).select("status"); ok("customer cannot change status", !!q.error || q.data?.[0]?.status !== "delivered", errOf(q) ?? JSON.stringify(q.data));
q = await rider.sb.from("orders").select("id").eq("id", OID); ok("rider cannot see order before restaurant accepts", q.data?.length === 0);

// --- restaurant accepts
q = await staff.sb.from("orders").update({ status: "accepted", prep_minutes: 10, ready_at: new Date(Date.now() + 600000).toISOString(), created_at: "2020-01-01" }).eq("id", OID).select("status, created_at");
ok("restaurant accepts (created_at pinned)", q.data?.[0]?.status === "accepted" && !q.data[0].created_at.startsWith("2020"), errOf(q) ?? JSON.stringify(q.data));
q = await staff.sb.from("orders").update({ status: "delivered" }).eq("id", OID).select("status"); ok("restaurant cannot skip to delivered", !!q.error || q.data?.[0]?.status !== "delivered", errOf(q));

// --- rider bids; auction closes 60 s after first bid (resolved by cron)
q = await other.sb.from("bids").insert({ order_id: OID, rider_id: other.id, eta_minutes: 5 }); ok("customer cannot bid", !!q.error, errOf(q));
q = await rider.sb.from("bids").insert({ order_id: OID, rider_id: rider.id, eta_minutes: 25 }).select("id").single(); ok("rider bids 25 min", !q.error, errOf(q));
q = await rider.sb.from("bids").insert({ order_id: OID, rider_id: rider.id, eta_minutes: 20 }); ok("rider cannot double-bid", !!q.error, errOf(q));
let st; for (let k = 0; k < 30; k++) { ({ data: st } = await cust.sb.from("orders").select("status,rider_id").eq("id", OID).single()); if (st?.status === "assigned") break; await sleep(5000); }
ok("auction resolves -> rider assigned", st.status === "assigned" && st.rider_id === rider.id, JSON.stringify(st));
r = await rider.sb.rpc("order_phone", { p_order: OID }); ok("assigned rider can get customer phone", r.data === "0612345678");
r = await other.sb.rpc("order_phone", { p_order: OID }); ok("other user cannot get the phone", !r.data, String(r.data));

// --- ready -> picked up -> delivered
q = await staff.sb.from("orders").update({ status: "ready" }).eq("id", OID).select("status"); ok("restaurant marks ready", q.data?.[0]?.status === "ready", errOf(q));
q = await rider.sb.from("orders").update({ status: "picked_up" }).eq("id", OID).select("status"); ok("rider picks up", q.data?.[0]?.status === "picked_up", errOf(q));
q = await rider.sb.from("orders").update({ status: "delivered" }).eq("id", OID).select("status"); ok("rider delivers", q.data?.[0]?.status === "delivered", errOf(q));
q = await rider.sb.from("earnings").select("amount_cents").eq("order_id", OID); ok("rider credited 100% of fee", q.data?.length === 1 && q.data[0].amount_cents > 0, JSON.stringify(q.data));
q = await other.sb.from("ratings").insert({ order_id: OID, food_stars: 1 }); ok("other customer cannot rate", !!q.error, errOf(q));
q = await cust.sb.from("ratings").insert({ order_id: OID, food_stars: 5, rider_stars: 5, comment: "e2e" }); ok("customer rates", !q.error, errOf(q));

// --- KPI
const today = new Date(); const from = new Date(today.getTime() - 86400000).toISOString(), to = new Date(today.getTime() + 86400000).toISOString();
r = await admin.sb.rpc("report_key_metric", { p_from: from, p_to: to });
const row = (r.data?.by_rider ?? []).find((x) => x.rider === "Test Rider Rik" || x.rider === "Rik");
ok("admin key metric returns day/restaurant/rider breakdown", !r.error && r.data.by_day.length >= 1 && r.data.by_restaurant.length >= 1 && !!row, errOf(r) ?? JSON.stringify({ pct: r.data?.pct, paid: r.data?.paid, rider: row }));
ok("delivered fast + on-time order counts as a hit", row && row.hits >= 1, JSON.stringify(row));
r = await admin.sb.rpc("report_key_metric", { p_from: from, p_to: to, p_include_test: false });
ok("real-only filter excludes test orders", !r.error && !(r.data.by_rider ?? []).some((x) => x.rider === row?.rider), errOf(r));
console.log("ORDER", OID);
process.exit(summary() ? 1 : 0);
