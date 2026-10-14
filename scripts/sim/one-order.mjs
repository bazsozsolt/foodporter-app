// Creates one paid + accepted TEST order at 't Kaasbolleke (so riders get a bid alert); `cancel <id>` closes it again.
import { login } from "../e2e/common.mjs";
const RID = "187f751c-bebb-4a34-9d4b-9b1a9e8851db";
const admin = await login("ADMIN");
if (process.argv[2] === "cancel") { await admin.sb.from("orders").update({ status: "cancelled", cancel_reason: "test: notification check" }).eq("id", +process.argv[3]); process.exit(0); }
const c = await login("SIMC1"), staff = await login("STAFF");
const m = (await admin.sb.from("menu_items").select("id,name,price_cents").eq("restaurant_id", RID).eq("available", true).limit(1)).data[0];
const o = (await c.sb.from("orders").insert({ customer_id: c.id, restaurant_id: RID, subtotal_cents: m.price_cents, delivery_fee_cents: 295, address: "FP TEST: Heuvelstraat 12, Tilburg", phone: "+31 6 0000 0000" }).select("id").single()).data;
await c.sb.from("order_items").insert({ order_id: o.id, menu_item_id: m.id, name: m.name, qty: 1, price_cents: m.price_cents });
await admin.sb.from("orders").update({ status: "placed", paid_at: new Date().toISOString(), payment_status: "paid", mollie_payment_id: `tr_sim_notify_${Date.now()}`, lat: 51.5555, lng: 5.0913, is_test: true }).eq("id", o.id);
const a = await staff.sb.from("orders").update({ status: "accepted", prep_minutes: 10, ready_at: new Date(Date.now() + 600000).toISOString() }).eq("id", o.id).select("id");
console.log(a.error ? "ERR " + a.error.message : o.id);
