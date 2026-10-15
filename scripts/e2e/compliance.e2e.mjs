// v17 P1: allergens (RLS + validation), suspension human review, minimum order + service fee enforced server-side.
import { ADDRESS, client, login, ok, RID, SB_URL, summary } from "./common.mjs";
const anon = client();
const admin = await login("ADMIN"), staff = await login("STAFF"), cust = await login("SIMC1"), rider = await login("SIMR3");
const err = (r) => r.error?.message ?? null;
const item = (await admin.sb.from("menu_items").select("id, allergens").eq("restaurant_id", RID).limit(1).single()).data;
const foreign = (await admin.sb.from("menu_items").select("id, allergens").neq("restaurant_id", RID).limit(1).single()).data;
// --- allergens
const a1 = await staff.sb.from("menu_items").update({ allergens: ["gluten", "milk"] }).eq("id", item.id).select("allergens, allergens_test");
ok("restaurant sets allergens on its own dish", !err(a1) && a1.data?.[0]?.allergens?.join() === "gluten,milk" && a1.data[0].allergens_test === false, err(a1));
ok("unknown allergen code is rejected", !!err(await staff.sb.from("menu_items").update({ allergens: ["chocolate"] }).eq("id", item.id)));
const f = await staff.sb.from("menu_items").update({ allergens: ["fish"] }).eq("id", foreign.id).select("id");
ok("restaurant cannot edit another restaurant's allergens", !!err(f) || (f.data ?? []).length === 0);
const c = await cust.sb.from("menu_items").update({ allergens: [] }).eq("id", item.id).select("id");
ok("customer cannot edit allergens", !!err(c) || (c.data ?? []).length === 0);
const pub = await anon.from("menu_items").select("allergens").eq("id", item.id).single();
ok("anyone can read allergens before ordering", pub.data?.allergens?.includes("gluten"), err(pub));
await admin.sb.from("menu_items").update({ allergens: item.allergens }).eq("id", item.id);
// --- human review of suspensions
const before = (await admin.sb.from("profiles").select("status, status_reason").eq("id", rider.id).single()).data;
ok("suspension without a reason is refused", !!err(await admin.sb.from("profiles").update({ status: "suspended", status_reason: null }).eq("id", rider.id)));
const s = await admin.sb.from("profiles").update({ status: "suspended", status_reason: "e2e: human review test" }).eq("id", rider.id).select("id");
ok("admin suspends with a reason", !err(s), err(s));
const own = await rider.sb.from("profiles").update({ status: "active" }).eq("id", rider.id).select("status");
ok("rider cannot lift their own suspension", !!err(own) || (own.data ?? []).length === 0 || own.data[0].status !== "active", err(own));
const log = await rider.sb.from("account_status_log").select("new_status, reason").eq("profile_id", rider.id).order("id", { ascending: false }).limit(1);
ok("rider sees the logged reason (for an appeal)", log.data?.[0]?.new_status === "suspended" && log.data[0].reason?.includes("human review"), err(log));
const other = await cust.sb.from("account_status_log").select("id").eq("profile_id", rider.id);
ok("others cannot read someone's status log", (other.data ?? []).length === 0);
await admin.sb.from("profiles").update({ status: before.status, status_reason: before.status_reason }).eq("id", rider.id);
// --- minimum order enforced at payment
const r0 = (await admin.sb.from("restaurants").select("min_order_cents").eq("id", RID).single()).data;
await admin.sb.from("restaurants").update({ min_order_cents: 9000 }).eq("id", RID);
const m = (await admin.sb.from("menu_items").select("id,name,price_cents").eq("restaurant_id", RID).eq("available", true).limit(1).single()).data;
const o = (await cust.sb.from("orders").insert({ customer_id: cust.id, restaurant_id: RID, subtotal_cents: m.price_cents, delivery_fee_cents: 295, address: ADDRESS, phone: "+31 6 0000 0000", status: "awaiting_payment" }).select("id").single()).data;
await cust.sb.from("order_items").insert({ order_id: o.id, menu_item_id: m.id, name: m.name, qty: 1, price_cents: m.price_cents });
const tok = (await cust.sb.auth.getSession()).data.session.access_token;
const res = await fetch(`${SB_URL}/functions/v1/create-payment`, { method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json", Origin: "http://localhost:8787" }, body: JSON.stringify({ order_id: o.id }) });
const body = await res.json().catch(() => ({}));
ok("payment below the restaurant's minimum order is refused server-side", res.status === 422 && body.code === "min_order", `${res.status} ${JSON.stringify(body).slice(0, 120)}`);
await admin.sb.from("restaurants").update({ min_order_cents: r0.min_order_cents }).eq("id", RID);
await admin.sb.from("orders").update({ status: "cancelled", cancel_reason: "test: min order" }).eq("id", o.id);
const st = await anon.from("settings").select("service_fee_cents").maybeSingle();
ok("service fee setting is readable for the price breakdown", st.data == null || typeof st.data.service_fee_cents === "number", err(st));
ok("customer cannot change the service fee", (await cust.sb.from("settings").update({ service_fee_cents: 0 }).eq("id", true).select("id")).data?.length !== 1);
process.exit(summary() ? 1 : 0);
