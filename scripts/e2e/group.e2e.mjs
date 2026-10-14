import { login, client, ok, errOf, RID, ADDRESS, summary } from "./common.mjs";
const host = await login("HOST"), guest = await login("GUEST"), out = await login("OUTSIDER"), staff = await login("STAFF");
const { data: menu } = await host.sb.from("menu_items").select("id,name,price_cents,restaurant_id").eq("restaurant_id", RID).eq("available", true).limit(4);
const { data: other } = await host.sb.from("menu_items").select("id").neq("restaurant_id", RID).eq("available", true).limit(1);

let r = await host.sb.rpc("create_group_order", { p_restaurant: RID, p_name: "Host Henk" });
ok("host creates group", !r.error && r.data?.code?.length === 6, errOf(r) ?? r.data?.code);
const G = r.data.id, CODE = r.data.code;

// realtime: host listens to basket changes
const events = [];
const ch = host.sb.channel("g-" + G).on("postgres_changes", { event: "UPDATE", schema: "public", table: "group_orders", filter: `id=eq.${G}` }, (p) => events.push(p.eventType));
await new Promise((res) => ch.subscribe((s) => s === "SUBSCRIBED" && res()));
const outEvents = [];
const och = out.sb.channel("o-" + G).on("postgres_changes", { event: "*", schema: "public", table: "group_items" }, (p) => outEvents.push(p)).on("postgres_changes", { event: "*", schema: "public", table: "group_orders" }, (p) => outEvents.push(p));
await new Promise((res) => och.subscribe((s) => s === "SUBSCRIBED" && res()));

r = await guest.sb.rpc("group_preview", { p_code: CODE.toLowerCase() });
ok("guest previews by code (case-insensitive)", r.data?.restaurant_name && r.data?.host_name === "Host Henk", JSON.stringify(r.data));
r = await client().rpc("group_preview", { p_code: CODE });
ok("anon cannot preview", !!r.error || r.data === null, errOf(r));
r = await guest.sb.rpc("join_group_order", { p_code: CODE, p_name: "Gast <b>Gerda</b>" });
ok("guest joins", r.data === G, errOf(r));
r = await guest.sb.rpc("group_add_item", { p_group: G, p_menu_item: menu[0].id, p_qty: 2 });
ok("guest adds item", !r.error, errOf(r)); const gItem = r.data;
r = await guest.sb.rpc("group_add_item", { p_group: G, p_menu_item: menu[1].id, p_qty: 1 });
const gItem2 = r.data;
r = await host.sb.rpc("group_add_item", { p_group: G, p_menu_item: menu[2].id, p_qty: 1 });
ok("host adds item", !r.error, errOf(r)); const hItem = r.data;

const { data: items } = await host.sb.from("group_items").select("id,user_id,name,qty,price_cents").eq("group_id", G);
const { data: mem } = await host.sb.from("group_members").select("user_id,display_name").eq("group_id", G);
ok("host sees all 3 items + 2 named members", items.length === 3 && mem.length === 2, mem.map((m) => m.display_name).join(", "));
ok("display name sanitised", mem.some((m) => m.display_name === "Gast bGerda/b"));
ok("server-side price on lines", items.every((i) => menu.find((m) => m.name === i.name)?.price_cents === i.price_cents));

// --- RLS negatives
let q = await out.sb.from("group_orders").select("id").eq("id", G); ok("outsider cannot read group", q.data?.length === 0);
q = await out.sb.from("group_items").select("id").eq("group_id", G); ok("outsider cannot read items", q.data?.length === 0);
q = await out.sb.from("group_members").select("user_id").eq("group_id", G); ok("outsider cannot read members", q.data?.length === 0);
q = await client().from("group_items").select("id"); ok("anon cannot read items", !!q.error || q.data?.length === 0, errOf(q));
r = await out.sb.rpc("group_add_item", { p_group: G, p_menu_item: menu[0].id, p_qty: 1 }); ok("outsider cannot add (not member)", !!r.error, errOf(r));
r = await client().rpc("join_group_order", { p_code: CODE }); ok("anon cannot join", !!r.error, errOf(r));
q = await guest.sb.from("group_items").insert({ group_id: G, user_id: guest.id, menu_item_id: menu[0].id, name: "x", qty: 1, price_cents: 1 }); ok("direct insert blocked", !!q.error, errOf(q));
q = await guest.sb.from("group_items").update({ price_cents: 1 }).eq("id", gItem).select(); ok("direct price update blocked", !!q.error || q.data?.length === 0, errOf(q));
q = await guest.sb.from("group_orders").update({ status: "locked" }).eq("id", G).select(); ok("direct group update blocked", !!q.error || q.data?.length === 0, errOf(q));
q = await host.sb.from("group_items").delete().eq("id", gItem).select(); ok("direct delete blocked", !!q.error || q.data?.length === 0, errOf(q));
r = await guest.sb.rpc("group_add_item", { p_group: G, p_menu_item: other[0].id, p_qty: 1 }); ok("other restaurant's item rejected", !!r.error, errOf(r));
r = await guest.sb.rpc("group_add_item", { p_group: G, p_menu_item: menu[0].id, p_qty: 99 }); ok("absurd qty rejected", !!r.error, errOf(r));
r = await guest.sb.rpc("group_set_qty", { p_item: hItem, p_qty: 5 }); ok("guest cannot edit host's item", !!r.error, errOf(r));
r = await guest.sb.rpc("group_remove_item", { p_item: hItem }); ok("guest cannot remove host's item", !!r.error, errOf(r));
r = await guest.sb.rpc("group_set_locked", { p_group: G, p_locked: true }); ok("guest cannot lock", !!r.error, errOf(r));
r = await guest.sb.rpc("group_set_deadline", { p_group: G, p_minutes: 30 }); ok("guest cannot set deadline", !!r.error, errOf(r));
r = await guest.sb.rpc("group_checkout", { p_group: G, p_address: "FP TEST x", p_phone: "0612345678" }); ok("guest cannot check out", !!r.error, errOf(r));
r = await guest.sb.rpc("group_cancel", { p_group: G }); ok("guest cannot cancel", !!r.error, errOf(r));

// --- host powers
r = await guest.sb.rpc("group_set_qty", { p_item: gItem, p_qty: 3 }); ok("guest edits own qty", !r.error, errOf(r));
r = await host.sb.rpc("group_remove_item", { p_item: gItem2 }); ok("host removes guest item", !r.error, errOf(r));
r = await host.sb.rpc("group_set_deadline", { p_group: G, p_minutes: 30 }); ok("host sets 30 min deadline", !r.error, errOf(r));
r = await host.sb.rpc("group_set_locked", { p_group: G, p_locked: true }); ok("host locks", !r.error, errOf(r));
r = await guest.sb.rpc("group_add_item", { p_group: G, p_menu_item: menu[0].id, p_qty: 1 }); ok("guest cannot add when locked", !!r.error, errOf(r));
r = await guest.sb.rpc("group_set_qty", { p_item: gItem, p_qty: 1 }); ok("guest cannot change qty when locked", !!r.error, errOf(r));
r = await out.sb.rpc("join_group_order", { p_code: CODE }); ok("nobody can join when locked", !!r.error, errOf(r));

await new Promise((res) => setTimeout(res, 2500));
ok("host got realtime basket events", events.length >= 4, events.join(","));
const leaked = outEvents.filter((p) => Object.keys(p.new ?? {}).length || Object.keys(p.old ?? {}).some((k) => k !== "id"));
ok("outsider gets no basket contents via realtime", leaked.length === 0, `${outEvents.length} events (${outEvents.map((p) => p.eventType).join(",")}), ${leaked.length} with data`);

// --- checkout
const expected = 3 * menu[0].price_cents + menu[2].price_cents;
r = await host.sb.rpc("group_checkout", { p_group: G, p_address: ADDRESS, p_phone: "0612345678" });
ok("host checks out -> order", !r.error && r.data, errOf(r) ?? String(r.data)); const OID = r.data;
r = await host.sb.rpc("group_checkout", { p_group: G, p_address: ADDRESS, p_phone: "0612345678" });
ok("checkout idempotent", r.data === OID);
let { data: o } = await host.sb.from("orders").select("id,status,subtotal_cents,delivery_fee_cents,group_order_id,customer_id,order_items(name,qty,price_cents,guest_name)").eq("id", OID).single();
ok("order subtotal computed server-side", o.subtotal_cents === expected, `${o.subtotal_cents} vs ${expected}`);
ok("order lines labelled per person", o.order_items.length === 2 && o.order_items.every((i) => i.guest_name), o.order_items.map((i) => `${i.guest_name}: ${i.qty}x ${i.name}`).join(" | "));
ok("order linked to group", o.group_order_id === G && o.customer_id === host.id);
q = await guest.sb.from("orders").select("id").eq("id", OID); ok("guest cannot read host's order/phone", q.data?.length === 0);
r = await guest.sb.functions.invoke("create-payment", { body: { order_id: OID } }); ok("guest cannot pay/claim order", !!r.error);
r = await host.sb.functions.invoke("create-payment", { body: { order_id: OID } });
let m = r.error?.message; if (r.error?.context) { try { m = JSON.stringify(await r.error.context.json()); } catch {} }
ok("create-payment returns Mollie checkout", !!r.data?.checkoutUrl && r.data.testmode === true, m ?? r.data?.paymentId);
console.log("ORDER", OID, "GROUP", G, "CODE", CODE);
console.log("CHECKOUT", r.data?.checkoutUrl ?? "");
import { execSync } from "child_process";
if (r.data?.checkoutUrl) {
  execSync(`python3 ${new URL("./pay.py", import.meta.url).pathname} "${r.data.checkoutUrl}"`, { stdio: "ignore", timeout: 90000 });
  let o2; for (let k = 0; k < 15; k++) { ({ data: o2 } = await host.sb.from("orders").select("status,payment_status").eq("id", OID).single()); if (o2.payment_status === "paid") break; await new Promise((res) => setTimeout(res, 2000)); }
  ok("Mollie test payment paid -> order placed", o2.payment_status === "paid" && o2.status === "placed", JSON.stringify(o2));
  const { data: so } = await staff.sb.from("orders").select("id,order_items(guest_name)").eq("id", OID);
  ok("order appears for restaurant with names", so?.length === 1 && so[0].order_items.every((i) => i.guest_name), JSON.stringify(so));
  const { data: g2 } = await guest.sb.from("group_orders").select("status,order_id").eq("id", G).single();
  ok("guest sees group as checked out", g2.status === "checked_out", JSON.stringify(g2));
}
const failed = summary();
await host.sb.removeAllChannels(); await out.sb.removeAllChannels();
process.exit(failed ? 1 : 0);
