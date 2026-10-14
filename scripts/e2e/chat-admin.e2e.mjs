// v14 regression (Zsolt's report): an ADMIN account ordering as a customer chats with / calls the rider on an active
// delivery, with the rider assigned through an accepted bid and by hand. Test orders only; cancelled at the end.
import { client, login, ok, summary } from "./common.mjs";
const RID = "187f751c-bebb-4a34-9d4b-9b1a9e8851db";
const admin = await login("ADMIN"), rider = await login("SIMR1"), staff = await login("STAFF"), other = await login("SIMC2");
const err = (r) => r.error?.message ?? null;
await admin.sb.rpc("fp_test_reset_rate_limits");
const m = (await admin.sb.from("menu_items").select("id,name,price_cents").eq("restaurant_id", RID).eq("available", true).limit(1)).data[0];
async function order() {
  const o = (await admin.sb.from("orders").insert({ customer_id: admin.id, restaurant_id: RID, subtotal_cents: m.price_cents, delivery_fee_cents: 295, address: "FP TEST: Heuvelstraat 12, Tilburg", phone: "+31 6 0000 0000" }).select("id").single()).data;
  await admin.sb.from("order_items").insert({ order_id: o.id, menu_item_id: m.id, name: m.name, qty: 1, price_cents: m.price_cents });
  await admin.sb.from("orders").update({ status: "placed", paid_at: new Date().toISOString(), payment_status: "paid", mollie_payment_id: `tr_sim_admchat_${Date.now()}`, lat: 51.5555, lng: 5.0913, is_test: true }).eq("id", o.id);
  await staff.sb.from("orders").update({ status: "accepted", prep_minutes: 10, ready_at: new Date(Date.now() + 600000).toISOString() }).eq("id", o.id);
  return o.id;
}
for (const how of ["bid", "manual"]) {
  const oid = await order();
  if (how === "bid") {
    await rider.sb.from("bids").insert({ order_id: oid, rider_id: rider.id, eta_minutes: 12 });
    await admin.sb.from("bids").update({ accepted: true }).eq("order_id", oid).eq("rider_id", rider.id);
  }
  await admin.sb.from("orders").update({ rider_id: rider.id, status: "assigned", assigned_at: new Date().toISOString() }).eq("id", oid);
  const s = await admin.sb.rpc("order_chat_send", { p_order: oid, p_channel: "rider", p_body: "Ik sta beneden", p_quick: true }).then(async (r) => r.error && /p_quick/.test(r.error.message) ? admin.sb.rpc("order_chat_send", { p_order: oid, p_channel: "rider", p_body: "Ik sta beneden" }) : r);
  ok(`[${how}] admin-as-customer sends to rider`, Number.isInteger(s.data), err(s));
  const lab = (await rider.sb.from("order_messages").select("author_role").eq("id", s.data).maybeSingle()).data;
  ok(`[${how}] rider sees it as from the customer`, lab?.author_role === "customer", JSON.stringify(lab));
  ok(`[${how}] rider replies`, Number.isInteger((await rider.sb.rpc("order_chat_send", { p_order: oid, p_channel: "rider", p_body: "Ben er zo" })).data));
  const c = await admin.sb.rpc("order_call", { p_order: oid });
  ok(`[${how}] admin-as-customer can call the rider without choosing a target`, !!c.data?.number, JSON.stringify(c.data ?? err(c)));
  ok(`[${how}] outsider still blocked`, !!err(await other.sb.rpc("order_chat_send", { p_order: oid, p_channel: "rider", p_body: "hoi" })));
  await admin.sb.from("orders").update({ status: "cancelled", cancel_reason: "test: v14 admin chat" }).eq("id", oid);
}
summary();
