// Seeds three TEST orders at 't Kaasbolleke, one per kitchen column (New, Preparing, Ready). `cancel <ids…>` closes them.
import { login } from "../e2e/common.mjs";
const RID = "187f751c-bebb-4a34-9d4b-9b1a9e8851db";
const admin = await login("ADMIN");
if (process.argv[2] === "cancel") { for (const id of process.argv.slice(3)) await admin.sb.from("orders").update({ status: "cancelled", cancel_reason: "test: board screenshot" }).eq("id", +id); process.exit(0); }
const c = await login("SIMC1"), staff = await login("STAFF"), rider = await login("SIMR1");
const ms = (await admin.sb.from("menu_items").select("id,name,price_cents").eq("restaurant_id", RID).eq("available", true).limit(3)).data;
const ids = [];
for (const [i, target] of ["placed", "accepted", "ready"].entries()) {
  const m = ms[i % ms.length];
  const o = (await c.sb.from("orders").insert({ customer_id: c.id, restaurant_id: RID, subtotal_cents: m.price_cents * 2, delivery_fee_cents: 295, address: "FP TEST: Heuvelstraat 12, Tilburg", phone: "+31 6 0000 0000" }).select("id").single()).data;
  await c.sb.from("order_items").insert({ order_id: o.id, menu_item_id: m.id, name: m.name, qty: 2, price_cents: m.price_cents });
  await admin.sb.from("orders").update({ status: "placed", paid_at: new Date().toISOString(), payment_status: "paid", mollie_payment_id: `tr_sim_board_${Date.now()}_${i}`, lat: 51.5555, lng: 5.0913, is_test: true }).eq("id", o.id);
  if (target !== "placed") await staff.sb.from("orders").update({ status: "accepted", prep_minutes: 15, ready_at: new Date(Date.now() + 900000).toISOString() }).eq("id", o.id);
  if (target === "ready") { const r = await admin.sb.from("orders").update({ status: "assigned", rider_id: rider.id, assigned_at: new Date().toISOString() }).eq("id", o.id).select("id"); if (r.error) console.error(r.error.message); await admin.sb.from("orders").update({ status: "ready" }).eq("id", o.id); }
  ids.push(o.id);
}
const { data } = await admin.sb.from("orders").select("id,status").in("id", ids); console.log(JSON.stringify(data));
