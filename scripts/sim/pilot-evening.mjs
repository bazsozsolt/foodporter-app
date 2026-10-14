// Simulates a pilot evening against the live Supabase project with TEST accounts only.
// ~30 orders: fast/on-time, slow bids (>3 min), late (ETA 5 min, delivered after), stacked pairs, group orders,
// restaurant timeouts and no-bid orders (real Mollie TEST payments so the refund path runs). Takes ~14 minutes.
import { execSync } from "child_process";
import fs from "fs";
import { login, sleep } from "../e2e/common.mjs";
const PAY = new URL("../e2e/pay.py", import.meta.url).pathname;
const R = { kaas: "187f751c-bebb-4a34-9d4b-9b1a9e8851db", wolfke: "27be6503-9605-40e3-8747-d39aa7664ce4", zusje: "926ec133-17e2-470b-9e44-17907a1fa983", veld: "7b7ab3c4-4f84-4326-a34a-1e4b199c8d13", melisa: "caf27df4-be1a-4158-b4de-2e9bc7e873b5" };
// public street names with approximate coordinates (no people's data)
const ADDR = [["Ringbaan-Noord 40", 51.5745, 5.0902], ["Bredaseweg 120", 51.5700, 5.0640], ["Spoorlaan 300", 51.5605, 5.0790], ["Korvelseweg 100", 51.5510, 5.0770],
  ["Oisterwijksebaan 20", 51.5650, 5.1060], ["Goirkestraat 50", 51.5700, 5.0890], ["Piusstraat 80", 51.5680, 5.0800], ["Hasseltstraat 150", 51.5760, 5.0960],
  ["Ringbaan-Oost 200", 51.5560, 5.1050], ["Hoogvensestraat 60", 51.5630, 5.0650]];
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const admin = await login("ADMIN"), staff = await login("STAFF");
const riders = { rik: await login("RIDER"), sem: await login("SIMR1"), fenna: await login("SIMR2"), joep: await login("SIMR3") };
const cust = [await login("SIMC1"), await login("SIMC2"), await login("CUST2"), await login("OUTSIDER")];
const host = await login("HOST"), guest = await login("GUEST");
const menus = {}; for (const [k, id] of Object.entries(R)) menus[k] = (await admin.sb.from("menu_items").select("id,name,price_cents").eq("restaurant_id", id).eq("available", true).limit(4)).data;
const results = [];
const opBy = (rk) => (rk === "kaas" ? staff.sb : admin.sb); // the Kaasbolleke test account acts as its kitchen; admin stands in for the others
const must = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };

async function paidOrder(rk, i, n = 2) { // test customer orders; admin marks it paid
  const [label, lat, lng] = ADDR[i % ADDR.length]; const c = cust[i % cust.length];
  const items = menus[rk].slice(0, n); const sub = items.reduce((a, m) => a + m.price_cents, 0);
  const o = must(await c.sb.from("orders").insert({ customer_id: c.id, restaurant_id: R[rk], subtotal_cents: sub, delivery_fee_cents: 295, address: `FP TEST: ${label}, Tilburg`, phone: "+31 6 0000 0000" }).select("id").single(), "insert order");
  must(await c.sb.from("order_items").insert(items.map((m) => ({ order_id: o.id, menu_item_id: m.id, name: m.name, qty: 1, price_cents: m.price_cents }))), "items");
  // mark paid as ops/admin would after a Mollie webhook (the real webhook path is covered by the e2e suite)
  must(await admin.sb.from("orders").update({ status: "placed", paid_at: new Date().toISOString(), payment_status: "paid", mollie_payment_id: `tr_sim_${Date.now()}_${i}`, lat, lng, is_test: true }).eq("id", o.id).select("id"), "mark paid");
  return o.id;
}
async function realPaidOrder(i) { // customer flow + real Mollie TEST payment, so a later cancel triggers a real test refund
  const c = cust[1]; const m = menus.zusje;
  const o = must(await c.sb.from("orders").insert({ customer_id: c.id, restaurant_id: R.zusje, subtotal_cents: 1, delivery_fee_cents: 295, address: "FP TEST: Heuvelstraat 12, 5038 AA Tilburg", phone: "+31 6 0000 0000" }).select("id").single(), "insert");
  must(await c.sb.from("order_items").insert([{ order_id: o.id, menu_item_id: m[i % m.length].id, name: "x", qty: 1, price_cents: 0 }]), "items");
  const p = await c.sb.functions.invoke("create-payment", { body: { order_id: o.id } }); if (!p.data?.checkoutUrl) throw new Error("create-payment failed");
  execSync(`python3 ${PAY} "${p.data.checkoutUrl}"`, { stdio: "ignore", timeout: 120000 });
  for (let k = 0; k < 20; k++) { const { data } = await c.sb.from("orders").select("status").eq("id", o.id).single(); if (data.status === "placed") return o.id; await sleep(2000); }
  throw new Error("payment not confirmed");
}
const accept = async (rk, id, prep = 10) => must(await opBy(rk).from("orders").update({ status: "accepted", prep_minutes: prep, ready_at: new Date(Date.now() + prep * 60000).toISOString() }).eq("id", id).select("id"), "accept");
async function bid(rider, id, eta) { for (let k = 0; k < 40; k++) { const r = await riders[rider].sb.from("bids").insert({ order_id: id, rider_id: riders[rider].id, eta_minutes: eta }); if (!r.error) return; if (/duplicate/.test(r.error.message)) return; await sleep(5000); } throw new Error(`bid ${rider} #${id} kept failing`); }
async function waitAssigned(id) { for (let k = 0; k < 60; k++) { const { data } = await admin.sb.from("orders").select("status,rider_id").eq("id", id).single(); if (data.rider_id) return data; await sleep(3000); } throw new Error(`#${id} never assigned`); }
async function finish(rk, rider, id, deliverAfterMs = 20000) {
  must(await opBy(rk).from("orders").update({ status: "ready" }).eq("id", id).select("id"), "ready");
  must(await riders[rider].sb.from("orders").update({ status: "picked_up" }).eq("id", id).select("id"), "pickup");
  await sleep(deliverAfterMs);
  must(await riders[rider].sb.from("orders").update({ status: "delivered" }).eq("id", id).select("id"), "deliver");
}
async function scenario(kind, i, fn) { try { const id = await fn(); results.push({ kind, id, ok: true }); log("✓", kind, "#" + id); } catch (e) { results.push({ kind, ok: false, error: e.message }); log("✗", kind, e.message); } }

const S = [];
const at = (sec, kind, fn) => S.push(sleep(sec * 1000).then(() => scenario(kind, S.length, fn)));
// 7 fast + on time (bid right away, ETA 35, delivered quickly); a competing slower bid for realism
const fastRiders = ["sem", "fenna", "joep", "sem", "fenna", "joep", "rik"];
fastRiders.forEach((rd, k) => at(k * 25, "fast_on_time", async () => { const rk = ["zusje", "veld", "melisa"][k % 3]; const id = await paidOrder(rk, k); await accept(rk, id); await bid(rd, id, 30); await bid(fastRiders[(k + 1) % 7] === rd ? "rik" : fastRiders[(k + 1) % 7], id, 40).catch(() => {}); await waitAssigned(id); await finish(rk, rd, id); return id; }));
// 4 slow bids (first bid after 3.5 min) -> misses the 3-minute rule but on time
["fenna", "joep", "sem", "fenna"].forEach((rd, k) => at(20 + k * 30, "slow_bid", async () => { const id = await paidOrder("veld", 10 + k); await accept("veld", id); await sleep(210000); await bid(rd, id, 35); await waitAssigned(id); await finish("veld", rd, id); return id; }));
// 5 late: ETA 5 min, delivered ~6.5 min after assignment
["rik", "sem", "joep", "fenna", "rik"].forEach((rd, k) => at(40 + k * 60, "late", async () => { const rk = k % 2 ? "melisa" : "zusje"; const id = await paidOrder(rk, 20 + k); await accept(rk, id, 5); await bid(rd, id, 5); await waitAssigned(id); await finish(rk, rd, id, 390000); return id; }));
// 4 stacked pairs: same rider takes two Kaasbolleke/Wolfke orders heading north
["rik", "sem", "joep", "fenna"].forEach((rd, k) => at(320 + k * 75, "stacked_pair", async () => {
  const a = await paidOrder("kaas", 0), b = await paidOrder("wolfke", 7); // Ringbaan-Noord / Hasseltstraat: same direction
  await accept("kaas", a); await bid(rd, a, 35); await waitAssigned(a);
  await accept("wolfke", b); await bid(rd, b, 35); const s = await waitAssigned(b);
  if (s.rider_id !== riders[rd].id) throw new Error("second order went to another rider");
  await finish("kaas", rd, a, 5000); await finish("wolfke", rd, b, 5000); return `${a}+${b}`; }));
// 2 group orders (host pays via real Mollie TEST checkout)
[0, 1].forEach((k) => at(60 + k * 200, "group", async () => {
  const g = must(await host.sb.rpc("create_group_order", { p_restaurant: R.wolfke, p_name: "Host" }), "group");
  must(await guest.sb.rpc("join_group_order", { p_code: g.code, p_name: "Gast" }), "join");
  must(await cust[0].sb.rpc("join_group_order", { p_code: g.code, p_name: "Sim" }), "join2");
  for (const [who, m] of [[host, 0], [guest, 1], [cust[0], 2], [guest, 3]]) must(await who.sb.rpc("group_add_item", { p_group: g.id, p_menu_item: menus.wolfke[m].id, p_qty: 1 }), "add");
  must(await host.sb.rpc("group_set_locked", { p_group: g.id, p_locked: true }), "lock");
  const id = must(await host.sb.rpc("group_checkout", { p_group: g.id, p_address: "FP TEST: Heuvelstraat 12, 5038 AA Tilburg", p_phone: "0612345678" }), "checkout");
  const p = await host.sb.functions.invoke("create-payment", { body: { order_id: id } }); if (!p.data?.checkoutUrl) throw new Error("create-payment");
  execSync(`python3 ${PAY} "${p.data.checkoutUrl}"`, { stdio: "ignore", timeout: 120000 });
  for (let n = 0; n < 20; n++) { const { data } = await admin.sb.from("orders").select("status").eq("id", id).single(); if (data.status === "placed") break; await sleep(2000); }
  await accept("wolfke", id); const rd = k ? "joep" : "sem"; await bid(rd, id, 30); await waitAssigned(id); await finish("wolfke", rd, id); return id; }));
// 2 restaurant timeouts (never accepted -> cron cancels after 5 min, alert + real test refund)
[0, 1].forEach((k) => at(5 + k * 15, "restaurant_timeout", async () => realPaidOrder(k)));
// 2 no-bid: accepted, nobody bids -> renotify at 3 min, ops alert at 10 min; then ops cancels (refund)
[2, 3].forEach((k) => at(35 + k * 10, "no_bid", async () => { const id = await realPaidOrder(k); await accept("zusje", id); return id; }));
await Promise.all(S);
fs.writeFileSync(new URL("./last-run.json", import.meta.url), JSON.stringify(results, null, 1));
log("done:", results.filter((r) => r.ok).length, "ok,", results.filter((r) => !r.ok).length, "failed");
process.exit(0);
