// v24: sold out until tomorrow (restaurant quick edit) + server refuses sold-out dishes; status-log retention function is locked down.
import { ADDRESS, login, ok, RID, SB_URL, summary } from "./common.mjs";
const staff = await login("STAFF"), cust = await login("SIMC1"), anonCust = cust;
const myRid = (await staff.sb.from("profiles").select("restaurant_id").eq("id", staff.id).single()).data.restaurant_id;
ok("staff belongs to the test restaurant", myRid === RID, myRid);
const m = (await staff.sb.from("menu_items").select("id,name,price_cents").eq("restaurant_id", RID).eq("available", true).order("name").limit(1).single()).data;
const until = new Date(Date.now() + 18 * 3600e3).toISOString();
const u = await staff.sb.from("menu_items").update({ available: false, sold_out_until: until }).eq("id", m.id).select("available,sold_out_until").single();
ok("staff marks a dish sold out until tomorrow", !u.error && u.data.available === false && u.data.sold_out_until, u.error?.message);
const vis = (await cust.sb.from("menu_items").select("id").eq("restaurant_id", RID).eq("available", true)).data.map((x) => x.id);
ok("customer menu hides the sold-out dish", !vis.includes(m.id));
const o = (await cust.sb.from("orders").insert({ customer_id: cust.id, restaurant_id: RID, subtotal_cents: m.price_cents, delivery_fee_cents: 295, address: ADDRESS, phone: "+31 6 0000 0000", status: "awaiting_payment" }).select("id").single()).data;
await cust.sb.from("order_items").insert({ order_id: o.id, menu_item_id: m.id, name: m.name, qty: 1, price_cents: m.price_cents });
const tok = (await cust.sb.auth.getSession()).data.session.access_token;
const pay = await fetch(`${SB_URL}/functions/v1/create-payment`, { method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json", Origin: "http://localhost:8787" }, body: JSON.stringify({ order_id: o.id, tip_cents: 0 }) });
ok("payment refused for a sold-out dish", pay.status >= 400, String(pay.status));
const other = await cust.sb.from("menu_items").update({ available: false }).eq("id", m.id).select("id");
ok("customer cannot change availability", (other.data ?? []).length === 0);
const r = await staff.sb.from("menu_items").update({ available: true, sold_out_until: null }).eq("id", m.id).select("available").single();
ok("staff brings it back on", r.data?.available === true);
for (const [who, c] of [["customer", cust.sb], ["staff", staff.sb]]) {
  ok(`${who} cannot run the retention purge`, !!(await c.rpc("fp_purge_status_log")).error);
  ok(`${who} cannot run the sold-out restore`, !!(await c.rpc("fp_restore_sold_out")).error);
}
await cust.sb.from("orders").update({ status: "cancelled" }).eq("id", o.id);
summary();
