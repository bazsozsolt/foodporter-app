// v13: order chat (customer<->rider, customer<->restaurant), call RPC with audit, lock after delivery,
// plus the support regression: an admin-role account (like a real owner using every app) can file help tickets.
import { execSync } from "child_process";
import { client, login, ok, sleep, summary } from "./common.mjs";
const anon = client();
const admin = await login("ADMIN"), cust = await login("SIMC1"), rider = await login("SIMR1"), r2 = await login("SIMR2"), staff = await login("STAFF"), other = await login("SIMC2");
const err = (r) => r.error?.message ?? null;
await admin.sb.rpc("fp_test_reset_rate_limits");

// ---------- support regression (v13 root cause): admin role used to be forced to "customer" -> rider/restaurant categories 400'd
const a1 = await admin.sb.rpc("support_create", { p_category: "payout", p_body: "Regressie: admin gebruikt rider-hulp" });
ok("admin-role account can use rider help (was: 'Onbekende categorie voor jouw rol')", Number.isInteger(a1.data), err(a1));
const a2 = await admin.sb.rpc("support_create", { p_category: "help", p_body: "Regressie: admin gebruikt restaurant-hulp" });
ok("admin-role account can use restaurant help", Number.isInteger(a2.data), err(a2));
const own = (await admin.sb.from("orders").select("id").eq("customer_id", admin.id).eq("status", "delivered").limit(1)).data?.[0];
if (own) { const a3 = await admin.sb.rpc("support_create", { p_category: "missing_item", p_body: "Regressie: admin als klant", p_order: own.id }); ok("admin-role account can use customer help on own order", Number.isInteger(a3.data), err(a3)); }
const roles = (await admin.sb.from("support_tickets").select("role").in("id", [a1.data, a2.data])).data?.map((x) => x.role).sort();
ok("ticket role follows the help that was used", JSON.stringify(roles) === JSON.stringify(["restaurant", "rider"]), JSON.stringify(roles));
const bad = await cust.sb.rpc("support_create", { p_category: "payout", p_body: "klant probeert rider-categorie" });
ok("plain customer still can't use a rider category (Dutch error)", /Onbekende categorie/.test(err(bad) ?? ""), err(bad));
const tooShort = await cust.sb.rpc("support_create", { p_category: "other", p_body: "x" });
ok("validation errors come back in Dutch", /Beschrijf het probleem/.test(err(tooShort) ?? ""), err(tooShort));
await admin.sb.from("support_tickets").update({ status: "resolved" }).in("id", [a1.data, a2.data]);

// ---------- order chat
const oid = Number(execSync("node ../sim/one-order.mjs", { encoding: "utf8" }).trim().split("\n").pop());
ok("test order placed + accepted", oid > 0, String(oid));
let s = await cust.sb.rpc("order_chat_send", { p_order: oid, p_channel: "restaurant", p_body: "Graag extra mayo" });
ok("customer chats with the restaurant before a rider is assigned", Number.isInteger(s.data), err(s));
const rv = await staff.sb.from("order_messages").select("body").eq("order_id", oid).eq("channel", "restaurant");
ok("restaurant sees the message", rv.data?.some((m) => m.body === "Graag extra mayo"), err(rv));
s = await staff.sb.rpc("order_chat_send", { p_order: oid, p_channel: "restaurant", p_body: "Komt goed!" });
ok("restaurant replies", Number.isInteger(s.data), err(s));
s = await cust.sb.rpc("order_chat_send", { p_order: oid, p_channel: "rider", p_body: "hallo?" });
ok("rider chat is closed while no rider is assigned", !!err(s), err(s));
const ph = await cust.sb.rpc("order_call", { p_order: oid });
ok("call button refused before assignment", /Bellen kan alleen/.test(err(ph) ?? ""), err(ph));

await admin.sb.from("profiles").update({ phone: "+31 6 0000 0011" }).eq("id", rider.id); // fake test number
const asg = await admin.sb.from("orders").update({ rider_id: rider.id, status: "assigned", assigned_at: new Date().toISOString() }).eq("id", oid).select("status");
ok("order assigned to test rider", asg.data?.[0]?.status === "assigned", err(asg));

const rt = []; const ch = rider.sb.channel(`e2e-chat-${oid}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "order_messages", filter: `order_id=eq.${oid}` }, (p) => rt.push(p.new)).subscribe();
await sleep(2500);
s = await cust.sb.rpc("order_chat_send", { p_order: oid, p_channel: "rider", p_body: "Ik sta beneden", p_quick: true });
ok("customer sends a quick reply to the rider", Number.isInteger(s.data), err(s));
for (let k = 0; k < 10 && !rt.length; k++) await sleep(1000);
ok("rider receives it in realtime", rt.some((m) => m.body === "Ik sta beneden" && m.quick), JSON.stringify(rt.map((m) => m.body)));
await rider.sb.removeChannel(ch);
s = await rider.sb.rpc("order_chat_send", { p_order: oid, p_channel: "rider", p_body: "Ik ben er over 2 min" });
ok("rider replies", Number.isInteger(s.data), err(s));
for (const [who, u] of [["other customer", other.sb], ["other rider", r2.sb], ["restaurant (rider channel)", staff.sb], ["anon", anon]]) {
  const v = await u.from("order_messages").select("id").eq("order_id", oid).eq("channel", "rider");
  ok(`${who} cannot read the rider chat`, (v.data ?? []).length === 0);
}
ok("other rider cannot write into it", !!err(await r2.sb.rpc("order_chat_send", { p_order: oid, p_channel: "rider", p_body: "spam" })));
ok("direct insert blocked", !!err(await cust.sb.from("order_messages").insert({ order_id: oid, channel: "rider", author_role: "customer", body: "x" })));
ok("empty message refused", /Bericht is leeg/.test(err(await cust.sb.rpc("order_chat_send", { p_order: oid, p_channel: "rider", p_body: "  " })) ?? ""));
const adm = await admin.sb.from("order_messages").select("body, author_role").eq("order_id", oid).order("created_at");
ok("admin reads both chats", (adm.data ?? []).length >= 4, JSON.stringify(adm.data?.map((m) => m.author_role)));
let pl = []; for (let k = 0; k < 10; k++) { pl = (await admin.sb.rpc("push_log_for_order", { p_order: oid })).data ?? []; if (pl.some((r) => r.event_key.startsWith("chat:"))) break; await sleep(1500); }
ok("chat messages trigger a push event", pl.some((r) => r.event_key.startsWith(`chat:${oid}:`)), JSON.stringify(pl.map((r) => r.event_key)));

// ---------- call
const c1 = await cust.sb.rpc("order_call", { p_order: oid });
ok("customer gets the rider's number during the delivery", c1.data?.number === "+31600000011" && c1.data.provider === "direct", JSON.stringify(c1.data ?? err(c1)));
const c2 = await rider.sb.rpc("order_call", { p_order: oid });
ok("rider gets the customer's number during the delivery", c2.data?.number === "+31600000000", JSON.stringify(c2.data ?? err(c2)));
for (const [who, u] of [["other customer", other.sb], ["other rider", r2.sb], ["restaurant", staff.sb]]) ok(`${who} cannot get a number`, !!err(await u.rpc("order_call", { p_order: oid })));
const au = await admin.sb.from("call_audit").select("caller_role, callee_role, provider").eq("order_id", oid);
ok("both calls are in the audit log", (au.data ?? []).length === 2, JSON.stringify(au.data));
ok("audit log is admin-only", ((await cust.sb.from("call_audit").select("id").eq("order_id", oid)).data ?? []).length === 0);

// ---------- v14 regression: an admin acting in the customer/rider views (Zsolt's case: admin picked up a test order on the rider page)
const am = await admin.sb.rpc("order_chat_send", { p_order: oid, p_channel: "rider", p_body: "Admin kijkt mee" });
ok("admin (not a party) can post in the rider chat of an active order", Number.isInteger(am.data), err(am));
const seen = await cust.sb.from("order_messages").select("author_role").eq("order_id", oid).eq("id", am.data).maybeSingle();
ok("customer sees it labelled as admin", seen.data?.author_role === "admin", JSON.stringify(seen.data));
const ac = await admin.sb.rpc("order_call", { p_order: oid, p_target: "customer" });
ok("admin acting as rider can call the customer (audited as admin)", ac.data?.number === "+31600000000", JSON.stringify(ac.data ?? err(ac)));
ok("admin must say whom to call", /Kies wie/.test(err(await admin.sb.rpc("order_call", { p_order: oid })) ?? ""));
ok("admin call is in the audit log", ((await admin.sb.from("call_audit").select("caller_role").eq("order_id", oid).eq("caller_role", "admin")).data ?? []).length === 1);
ok("still no access for a random customer", !!err(await other.sb.rpc("order_chat_send", { p_order: oid, p_channel: "rider", p_body: "hoi" })));
const loc = await admin.sb.from("rider_locations").insert({ rider_id: admin.id, order_id: oid, lat: 51.56, lng: 5.09 });
ok("admin cannot post rider locations (the client no longer tries)", !!loc.error);

// stacked: a second active job for the same rider (accepted bid path), chats stay per order
const oid2 = Number(execSync("node ../sim/one-order.mjs", { encoding: "utf8" }).trim().split("\n").pop());
await rider.sb.from("bids").insert({ order_id: oid2, rider_id: rider.id, eta_minutes: 15 });
await admin.sb.from("bids").update({ accepted: true }).eq("order_id", oid2).eq("rider_id", rider.id);
await admin.sb.from("orders").update({ rider_id: rider.id, status: "assigned", assigned_at: new Date().toISOString(), stacked: true }).eq("id", oid2);
ok("stacked job: rider chats on the second order too", Number.isInteger((await rider.sb.rpc("order_chat_send", { p_order: oid2, p_channel: "rider", p_body: "Tweede stop, ben er zo" })).data));
const leak = (await cust.sb.from("order_messages").select("order_id").eq("order_id", oid2)).data ?? [];
ok("messages stay on their own order", leak.length === 1 && leak[0].order_id === oid2, JSON.stringify(leak));
await admin.sb.from("orders").update({ status: "cancelled", cancel_reason: "test: v14 stacked" }).eq("id", oid2);

// ---------- delivered -> chat still open within the lock window, then locked; call button gone
await staff.sb.from("orders").update({ status: "ready" }).eq("id", oid);
await rider.sb.from("orders").update({ status: "picked_up" }).eq("id", oid);
const dv = await rider.sb.from("orders").update({ status: "delivered" }).eq("id", oid).select("status");
ok("rider delivers", dv.data?.[0]?.status === "delivered", err(dv) ?? JSON.stringify(dv.data));
ok("call refused after delivery", /Bellen kan alleen/.test(err(await cust.sb.rpc("order_call", { p_order: oid })) ?? ""));
ok("chat still open right after delivery", Number.isInteger((await cust.sb.rpc("order_chat_send", { p_order: oid, p_channel: "rider", p_body: "Dank je!" })).data));
await admin.sb.from("orders").update({ delivered_at: new Date(Date.now() - 3 * 3600000).toISOString() }).eq("id", oid);
ok("chat locked after the lock window (Dutch error)", /Chat is gesloten/.test(err(await rider.sb.rpc("order_chat_send", { p_order: oid, p_channel: "rider", p_body: "nog iets" })) ?? ""));
ok("parties can no longer read the locked chat", ((await cust.sb.from("order_messages").select("id").eq("order_id", oid)).data ?? []).length === 0);
ok("admin still reads it", ((await admin.sb.from("order_messages").select("id").eq("order_id", oid)).data ?? []).length >= 5);
process.exit(summary() ? 1 : 0);
