// Web push backend: key pair, strict RLS, RPC-only subscriptions, sending on order events, pruning dead endpoints.
// Uses throwaway endpoints on httpbin.org (201 = accepted, 410 = gone) with freshly generated keys: no real devices.
import crypto from "crypto";
import { execSync } from "child_process";
import { client, login, ok, sleep, summary, SB_URL } from "./common.mjs";
const fakeKeys = () => { const e = crypto.createECDH("prime256v1"); e.generateKeys(); return { p256dh: e.getPublicKey("base64url"), auth: crypto.randomBytes(16).toString("base64url") }; };
const anon = client();
const admin = await login("ADMIN"), r1 = await login("SIMR1"), r2 = await login("SIMR2"), cust = await login("SIMC1"), staff = await login("STAFF"), other = await login("SIMC2");

await fetch(`${SB_URL}/functions/v1/order-push`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order_id: 999999999 }) });
const pk = await r1.sb.rpc("push_public_key");
ok("VAPID public key available to signed-in users", typeof pk.data === "string" && pk.data.length > 80, pk.error?.message ?? `${pk.data?.length} chars`);
ok("public key hidden from anon", !!(await anon.rpc("push_public_key")).error || !(await anon.rpc("push_public_key")).data);
for (const [who, c] of [["anon", anon], ["rider", r1.sb], ["admin", admin.sb]]) {
  const v = await c.from("push_vapid").select("*"); ok(`${who} cannot read the VAPID private key`, !!v.error || (v.data ?? []).length === 0, v.error?.message ?? "0 rows");
  const l = await c.from("push_log").select("*").limit(1); ok(`${who} cannot read push_log`, !!l.error || (l.data ?? []).length === 0);
}
const ins = await r1.sb.from("push_subscriptions").insert({ profile_id: r1.id, endpoint: "https://httpbin.org/status/201", p256dh: "x", auth: "y" });
ok("direct insert into push_subscriptions is blocked", !!ins.error, ins.error?.message);

const sub = async (u, endpoint) => { const k = fakeKeys(); return u.sb.rpc("push_subscribe", { p_endpoint: endpoint, p_p256dh: k.p256dh, p_auth: k.auth, p_user_agent: "fp-e2e" }); };
const tag = Date.now();
const E_OK1 = `https://httpbin.org/status/201?fp=${tag}r1`, E_GONE = `https://httpbin.org/status/410?fp=${tag}r2`, E_C = `https://httpbin.org/status/201?fp=${tag}c`, E_S = `https://httpbin.org/status/201?fp=${tag}s`;
ok("rider subscribes via RPC", !(await sub(r1, E_OK1)).error);
ok("second rider subscribes (dead endpoint)", !(await sub(r2, E_GONE)).error);
ok("customer subscribes", !(await sub(cust, E_C)).error);
ok("restaurant staff subscribes", !(await sub(staff, E_S)).error);
const own = await r1.sb.from("push_subscriptions").select("endpoint");
ok("users only see their own subscriptions", (own.data ?? []).length >= 1 && own.data.every((s) => s.endpoint.includes("r1") || !s.endpoint.includes(String(tag))), JSON.stringify(own.data?.map((s) => s.endpoint.slice(-20))));
const theirs = await other.sb.from("push_subscriptions").select("endpoint").like("endpoint", `%${tag}%`);
ok("another user sees none of them", (theirs.data ?? []).length === 0);
ok("unsubscribing someone else's endpoint does nothing", !(await other.sb.rpc("push_unsubscribe", { p_endpoint: E_OK1 })).error && (await r1.sb.from("push_subscriptions").select("id").eq("endpoint", E_OK1)).data.length === 1);

for (const r of [r1, r2]) await r.sb.from("profiles").update({ online: true }).eq("id", r.id);
const oid = Number(execSync("node ../sim/one-order.mjs", { encoding: "utf8" }).trim().split("\n").pop());
ok("test order placed + accepted", oid > 0, String(oid));
const log = async () => { const { data } = await admin.sb.rpc("push_log_for_order", { p_order: oid }); return data ?? []; };
let rows = [];
for (let k = 0; k < 20; k++) { rows = await log(); if (rows.some((r) => r.event_key.startsWith("bid:") && r.recipients > 0) && rows.some((r) => r.event_key.startsWith("rest:"))) break; await sleep(2000); }
const get = (p) => rows.find((r) => r.event_key.startsWith(p));
ok("restaurant got a 'new order' push", get("rest:")?.sent >= 1, JSON.stringify(get("rest:")));
ok("online riders got a bid push", get("bid:")?.sent >= 1, JSON.stringify(get("bid:")));
ok("dead rider endpoint pruned", get("bid:")?.pruned >= 1 && (await r2.sb.from("push_subscriptions").select("id").eq("endpoint", E_GONE)).data.length === 0);
ok("customer got a status push", get(`cust:${oid}:accepted`)?.sent >= 1, JSON.stringify(get("cust:")));
const again = await fetch(`${SB_URL}/functions/v1/order-push`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order_id: oid }) }).then((r) => r.json());
ok("repeat/spoofed call sends nothing extra", again.results.every((r) => r.skipped), JSON.stringify(again.results));
execSync(`node ../sim/one-order.mjs cancel ${oid}`);
for (let k = 0; k < 10; k++) { rows = await log(); if (get(`cust:${oid}:cancelled`)) break; await sleep(1500); }
ok("customer told about the cancellation", get(`cust:${oid}:cancelled`)?.sent >= 1);
for (const [u, e] of [[r1, E_OK1], [cust, E_C], [staff, E_S]]) await u.sb.rpc("push_unsubscribe", { p_endpoint: e });
ok("unsubscribe removes the device", (await cust.sb.from("push_subscriptions").select("id").eq("endpoint", E_C)).data.length === 0);
for (const r of [r1, r2]) await r.sb.from("profiles").update({ online: false }).eq("id", r.id);
process.exit(summary() ? 1 : 0);
