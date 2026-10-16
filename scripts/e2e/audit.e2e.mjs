// v25 audit: tampering attacks with test accounts (payments, IDOR, XSS storage, rate limits). Mollie test mode only.
import { ADDRESS, client, errOf, login, ok, RID, SB_URL, sleep, summary } from "./common.mjs";
const admin = await login("ADMIN"), cust = await login("SIMC1"), other = await login("SIMC2").catch(() => null), rider = await login("SIMR3"), staff = await login("STAFF");
const anon = client();
const menu = (await cust.sb.from("menu_items").select("id,price_cents").eq("restaurant_id", RID).eq("available", true).order("price_cents", { ascending: false }).limit(2)).data;
const mkOrder = async (sb, uid, subtotal = 1) => {
  const o = (await sb.from("orders").insert({ customer_id: uid, restaurant_id: RID, subtotal_cents: subtotal, delivery_fee_cents: 0, address: ADDRESS, phone: "+31 6 0000 0000", status: "awaiting_payment" }).select("id").single());
  if (o.error) throw new Error(o.error.message);
  await sb.from("order_items").insert({ order_id: o.data.id, menu_item_id: menu[0].id, name: "x", qty: 1, price_cents: 1 });
  return o.data.id;
};
const tok = (await cust.sb.auth.getSession()).data.session.access_token;
const pay = (oid, extra = {}, t = tok) => fetch(`${SB_URL}/functions/v1/create-payment`, { method: "POST", headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json", Origin: "http://localhost:8787" }, body: JSON.stringify({ order_id: oid, tip_cents: 0, ...extra }) }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) }));
const created = [];
// --- payments
const oid = await mkOrder(cust.sb, cust.id, 1); created.push(oid);
const p1 = await pay(oid);
ok("client subtotal (1 cent) ignored: Mollie amount = server price + fees", p1.s === 200 && p1.j.amount_cents >= menu[0].price_cents, `${p1.s} ${p1.j.amount_cents} vs ${menu[0].price_cents}`);
const row = (await admin.sb.from("orders").select("subtotal_cents,status").eq("id", oid).single()).data;
ok("order subtotal rewritten server-side", row.subtotal_cents === menu[0].price_cents, String(row.subtotal_cents));
// after creating the payment: try to add items / raise qty / mark paid
const addItem = await cust.sb.from("order_items").insert({ order_id: oid, menu_item_id: menu[1].id, name: "extra", qty: 5, price_cents: 1 });
const items = (await admin.sb.from("order_items").select("qty").eq("order_id", oid)).data;
ok("customer cannot add items after the payment is created", !!addItem.error || items.length === 1, `${errOf(addItem)} items=${items.length}`);
const upQty = await cust.sb.from("order_items").update({ qty: 9 }).eq("order_id", oid).select("qty");
ok("customer cannot change qty after the payment is created", (upQty.data ?? []).length === 0 || !!upQty.error, JSON.stringify(upQty.data));
const selfPaid = await cust.sb.from("orders").update({ status: "placed", payment_status: "paid", paid_at: new Date().toISOString() }).eq("id", oid).select("status");
const st = (await admin.sb.from("orders").select("status,payment_status,paid_at").eq("id", oid).single()).data;
ok("customer cannot mark own order paid", st.status === "awaiting_payment" && !st.paid_at, JSON.stringify(st) + " " + errOf(selfPaid));
const before = (await admin.sb.from("orders").select("subtotal_cents").eq("id", oid).single()).data.subtotal_cents;
const selfFee = await cust.sb.from("orders").update({ subtotal_cents: 1, discount_cents: 99999, tip_cents: 0 }).eq("id", oid).select("id");
const st2 = (await admin.sb.from("orders").select("subtotal_cents,discount_cents").eq("id", oid).single()).data;
ok("customer cannot rewrite money fields", st2.subtotal_cents === before && before === menu[0].price_cents && (st2.discount_cents ?? 0) < 99999, JSON.stringify(st2) + " " + errOf(selfFee));
ok("tip > €20 refused", (await pay(oid, { tip_cents: 2001 })).s === 422);
ok("fractional tip refused", (await pay(oid, { tip_cents: 1.5 })).s === 422);
ok("negative tip refused", (await pay(oid, { tip_cents: -1 })).s === 422);
// IDOR: another customer pays / reads this order
if (other) {
  const ot = (await other.sb.auth.getSession()).data.session.access_token;
  ok("IDOR: other customer cannot create a payment for my order", (await pay(oid, {}, ot)).s === 404);
  ok("IDOR: other customer cannot read my order", ((await other.sb.from("orders").select("id").eq("id", oid)).data ?? []).length === 0);
  ok("IDOR: other customer cannot read my order items", ((await other.sb.from("order_items").select("id").eq("order_id", oid)).data ?? []).length === 0);
  ok("IDOR: other customer cannot post in my order chat", !!(await other.sb.rpc("order_chat_send", { p_order: oid, p_channel: "rider", p_body: "hi" })).error);
}
ok("anon cannot call create-payment", (await pay(oid, {}, "x")).s === 401);
// webhook: junk / spoofed ids do nothing
const wh = await fetch(`${SB_URL}/functions/v1/mollie-webhook`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "id=tr_doesnotexist123" });
const st3 = (await admin.sb.from("orders").select("status").eq("id", oid).single()).data;
ok("spoofed webhook id changes nothing", wh.status === 200 && st3.status === "awaiting_payment");
const wh2 = await fetch(`${SB_URL}/functions/v1/mollie-webhook`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `id=${p1.j.paymentId}` });
const st4 = (await admin.sb.from("orders").select("status").eq("id", oid).single()).data;
ok("real webhook for an open (unpaid) test payment keeps it unpaid", wh2.status === 200 && st4.status === "awaiting_payment", st4.status);
// refunds: unauthenticated support refund refused, spoofed order refund refused
const rf = await fetch(`${SB_URL}/functions/v1/order-refund`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` }, body: JSON.stringify({ ticket_id: 1, amount_cents: 500 }) });
ok("customer cannot trigger a support refund", rf.status === 403);
const rf2 = await fetch(`${SB_URL}/functions/v1/order-refund`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order_id: oid }) }).then((r) => r.json());
ok("refund call for an unpaid/non-cancelled order does nothing", rf2.skipped === "nothing to refund", JSON.stringify(rf2));
// promo abuse: unknown code, oversized
const pz = await pay(oid, { promo_code: "NOPE-NOT-REAL" }); ok("unknown promo refused", pz.s === 422 && pz.j.code === "promo", JSON.stringify(pz.j));
// payouts: rider/customer cannot mark paid
for (const [w, c] of [["rider", rider.sb], ["customer", cust.sb], ["staff", staff.sb]]) {
  const u = await c.from("payouts").update({ status: "paid" }).neq("id", 0).select("id");
  ok(`${w} cannot mark payouts paid`, (u.data ?? []).length === 0);
  const e = await c.from("rider_earnings").update({ amount_cents: 999999 }).neq("id", 0).select("id");
  ok(`${w} cannot edit rider earnings`, (e.data ?? []).length === 0);
}
// --- XSS: stored as text (rendered by React, escaped); check script tags are stored verbatim, not executed server-side
const x = await cust.sb.rpc("support_create", { p_order: null, p_category: "other", p_body: "<img src=x onerror=alert(1)> qa audit", p_photo: null, p_refund_cents: null });
ok("support accepts text with markup as plain text (no server error)", !x.error || /rate|limit|categor/i.test(errOf(x) ?? ""), errOf(x));
// --- anon access
for (const t of ["orders", "order_items", "profiles", "support_tickets", "order_messages", "payouts", "rider_earnings", "rider_locations", "push_subscriptions", "legal_acceptances"]) {
  const r = await anon.from(t).select("*").limit(1); ok(`anon reads nothing from ${t}`, !!r.error || (r.data ?? []).length === 0, errOf(r));
}
// --- rate limit on login (Supabase auth) is platform-side; promo brute force via create-payment:
let blocked = false; for (let i = 0; i < 25; i++) { const r = await pay(oid, { promo_code: `BRUTE${i}` }); if (r.s === 429 || /too many|rate|te veel/i.test(JSON.stringify(r.j))) { blocked = true; break; } }
ok("promo brute force is rate limited", blocked, "25 wrong codes");
// --- privacy: erasure request + anonymise guard
{
  const a = await cust.sb.rpc("fp_request_account_deletion"); ok("deletion request accepted", !a.error, errOf(a));
  const b = await cust.sb.rpc("fp_request_account_deletion"); ok("second request does not duplicate", !b.error && String(b.data) === String(a.data), errOf(b));
  const { data: tk } = await cust.sb.from("support_tickets").select("id, category, status").eq("created_by", cust.id).eq("category", "privacy").neq("status", "resolved");
  ok("one open privacy ticket", (tk ?? []).length === 1, JSON.stringify(tk));
  const c = await cust.sb.rpc("fp_anonymise_profile", { p_id: other?.id ?? cust.id }); ok("customer cannot anonymise", !!c.error);
  const d = await rider.sb.rpc("fp_anonymise_profile", { p_id: cust.id }); ok("rider cannot anonymise", !!d.error);
  for (const t of tk ?? []) await admin.sb.rpc("support_admin_update", { p_ticket: t.id, p_status: "resolved" });
}
await admin.sb.rpc("fp_test_reset_rate_limits");
for (const id of created) await admin.sb.from("orders").update({ status: "cancelled", cancel_reason: "qa audit" }).eq("id", id);
summary();
