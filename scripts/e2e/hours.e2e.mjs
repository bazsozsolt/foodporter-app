// v17 P3: opening hours, holiday closures, pause/busy mode; RPC permissions and server-side enforcement in create-payment.
import { ADDRESS, client, login, ok, RID, SB_URL, summary } from "./common.mjs";
const anon = client();
const admin = await login("ADMIN"), staff = await login("STAFF"), cust = await login("SIMC1");
const err = (r) => r.error?.message ?? null;
const set = (u, args, rid = RID) => u.sb.rpc("restaurant_set_availability", { p_rid: rid, ...args });
const isOpen = async () => (await anon.rpc("fp_restaurant_open", { p_rid: RID })).data;
const before = (await admin.sb.from("restaurants").select("opening_hours, closed_dates, paused_until, busy_extra_minutes").eq("id", RID).single()).data;
const other = (await admin.sb.from("restaurants").select("id").neq("id", RID).eq("active", true).limit(1).single()).data;
const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).map((x) => [x.type, x.value]));
const dow = String(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(p.weekday) + 1), today = `${p.year}-${p.month}-${p.day}`;
const allDay = Object.fromEntries(["1", "2", "3", "4", "5", "6", "7"].map((d) => [d, [["00:00", "24:00"]]]));

ok("customer cannot change opening hours", !!err(await set(cust, { p_hours: allDay, p_set_hours: true })));
ok("staff cannot change another restaurant", !!err(await set(staff, { p_pause_minutes: 30 }, other.id)));
ok("invalid hours are rejected", !!err(await set(staff, { p_hours: { "1": [["22:00", "09:00"]] }, p_set_hours: true })));
ok("invalid weekday key is rejected", !!err(await set(staff, { p_hours: { "8": [] }, p_set_hours: true })));
const s1 = await set(staff, { p_hours: allDay, p_set_hours: true });
ok("staff saves their weekly hours", !err(s1) && s1.data?.open_now === true, err(s1));
ok("anyone can read the hours", !!(await anon.from("restaurants").select("opening_hours").eq("id", RID).single()).data?.opening_hours?.["1"]);
await set(staff, { p_hours: { ...allDay, [dow]: [] }, p_set_hours: true });
ok("closed on this weekday -> not open", (await isOpen()) === false);

// payment is refused while closed
const m = (await admin.sb.from("menu_items").select("id,name,price_cents").eq("restaurant_id", RID).eq("available", true).order("price_cents", { ascending: false }).limit(1).single()).data;
const o = (await cust.sb.from("orders").insert({ customer_id: cust.id, restaurant_id: RID, subtotal_cents: m.price_cents * 3, delivery_fee_cents: 295, address: ADDRESS, phone: "+31 6 0000 0000", status: "awaiting_payment" }).select("id").single()).data;
await cust.sb.from("order_items").insert({ order_id: o.id, menu_item_id: m.id, name: m.name, qty: 3, price_cents: m.price_cents });
const tok = (await cust.sb.auth.getSession()).data.session.access_token;
const pay = () => fetch(`${SB_URL}/functions/v1/create-payment`, { method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json", Origin: "http://localhost:8787" }, body: JSON.stringify({ order_id: o.id }) });
let r = await pay(); let b = await r.json().catch(() => ({}));
ok("payment at a closed restaurant is refused server-side", r.status === 422 && b.code === "closed", `${r.status} ${b.code}`);

await set(staff, { p_hours: allDay, p_set_hours: true });
await set(staff, { p_closed: [today] });
ok("holiday closure today -> not open", (await isOpen()) === false);
await set(staff, { p_closed: [] });
const pz = await set(staff, { p_pause_minutes: 30 });
ok("pause 30 min -> not open", !err(pz) && (await isOpen()) === false, err(pz));
r = await pay(); b = await r.json().catch(() => ({}));
ok("payment while paused is refused", r.status === 422 && b.code === "closed", `${r.status} ${b.code}`);
ok("pause above 12 h is rejected", !!err(await set(staff, { p_pause_minutes: 1000 })));
await set(staff, { p_pause_minutes: 0 });
ok("resume -> open again", (await isOpen()) === true);
const bz = await set(staff, { p_busy: 20 });
ok("busy mode +20 min is saved", bz.data?.busy_extra_minutes === 20, err(bz));
ok("busy above 60 min is rejected", !!err(await set(staff, { p_busy: 90 })));
ok("admin can pause any restaurant", !err(await set(admin, { p_pause_minutes: 0 }, other.id)));
const aud = await admin.sb.from("audit_events").select("id").eq("type", "restaurant_availability").eq("from_value", RID).gte("created_at", new Date(Date.now() - 600e3).toISOString());
ok("changes are in the audit log", (aud.data ?? []).length >= 5, err(aud));

// restore
await admin.sb.from("orders").update({ status: "cancelled", cancel_reason: "test: hours" }).eq("id", o.id);
await set(admin, { p_hours: before.opening_hours, p_set_hours: true, p_closed: before.closed_dates ?? [], p_busy: before.busy_extra_minutes ?? 0, p_pause_minutes: 0 });
ok("restored (always open for the rest of the suite)", (await isOpen()) === true);
process.exit(summary() ? 1 : 0);
