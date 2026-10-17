// v17 QA: cross-feature flows (scheduled+pickup+promo, group+tip+door photo, stacked tips, credit floor,
// scheduled at a closed restaurant, refunds on promo/tip orders, payouts reconciling with the charged amount)
// plus RLS negatives on the v17 tables. Test data only.
import { readFileSync } from "node:fs";
import { ADDRESS, ANON, client, login, ok, RID, SB_URL, sleep, summary } from "./common.mjs";
const anon = client();
const admin = await login("ADMIN"), staff = await login("STAFF"), cust = await login("SIMC1"), rider = await login("SIMR3");
const host = await login("HOST"), guest = await login("GUEST"), out = await login("OUTSIDER");
const err = (r) => r?.error?.message ?? null;
const img = readFileSync(new URL("../../public/brand/mark.png", import.meta.url));
const menu = (await admin.sb.from("menu_items").select("id,name,price_cents").eq("restaurant_id", RID).eq("available", true).order("price_cents", { ascending: false }).limit(3)).data;
const m = menu[0];
const ORIGIN = "http://localhost:8787";
const started = new Date(Date.now() - 60e3).toISOString();
const mine = [];
async function newOrder(u, { qty = 3, ...extra } = {}) {
  const r = await u.sb.from("orders").insert({ customer_id: u.id, restaurant_id: RID, subtotal_cents: m.price_cents * qty, delivery_fee_cents: 295, address: extra.fulfilment === "pickup" ? "Afhalen" : ADDRESS, phone: "+31 6 0000 0000", status: "awaiting_payment", ...extra }).select("id").single();
  if (r.error) throw new Error(r.error.message);
  await u.sb.from("order_items").insert({ order_id: r.data.id, menu_item_id: m.id, name: m.name, qty, price_cents: m.price_cents });
  await admin.sb.from("orders").update({ is_test: true }).eq("id", r.data.id);
  mine.push(r.data.id); return r.data.id;
}
async function pay(u, id, body = {}) {
  const tok = (await u.sb.auth.getSession()).data.session.access_token;
  const r = await fetch(`${SB_URL}/functions/v1/create-payment`, { method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json", Origin: ORIGIN }, body: JSON.stringify({ order_id: id, ...body }) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
const COLS = "id, status, subtotal_cents, delivery_fee_cents, service_fee_cents, tip_cents, discount_cents, credit_cents, commission_cents, promo_code, scheduled_for, release_at, refund_status, refund_cents, fulfilment, rider_bonus_cents";
const row = async (id) => (await admin.sb.from("orders").select(COLS).eq("id", id).single()).data;
const paidTotal = (o) => o.subtotal_cents + o.delivery_fee_cents + (o.service_fee_cents ?? 0) + (o.tip_cents ?? 0) - (o.discount_cents ?? 0) - (o.credit_cents ?? 0);
// "paid" = simulated test payment (tr_sim_), the same thing mollie-webhook does on a paid status
const markPaid = (id) => admin.sb.from("orders").update({ status: "placed", paid_at: new Date().toISOString(), payment_status: "paid", mollie_payment_id: `tr_sim_qa${id}` }).eq("id", id);
const FLOW = ["placed", "accepted", "assigned", "ready", "picked_up", "delivered"];
async function walk(id, to, riderId = rider.id) {
  const cur = (await row(id)).status;
  for (const st of FLOW.slice(FLOW.indexOf(cur) + 1, FLOW.indexOf(to) + 1)) {
    const r = await admin.sb.from("orders").update({ status: st, ...(st === "assigned" ? { rider_id: riderId, assigned_at: new Date().toISOString() } : {}) }).eq("id", id);
    if (r.error) return r.error.message;
  }
  return null;
}
const refundCall = (body) => fetch(`${SB_URL}/functions/v1/order-refund`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${admin.session.access_token}`, apikey: ANON }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));

const hoursBefore = (await admin.sb.from("restaurants").select("opening_hours, closed_dates, paused_until, busy_extra_minutes").eq("id", RID).single()).data;
const allDay = Object.fromEntries(["1", "2", "3", "4", "5", "6", "7"].map((d) => [d, [["00:00", "24:00"]]]));
const setAvail = (args) => staff.sb.rpc("restaurant_set_availability", { p_rid: RID, ...args });
await setAvail({ p_hours: allDay, p_set_hours: true }); await setAvail({ p_closed: [] });
const CODE = `QAX${Date.now().toString(36).toUpperCase()}`;
const CODE2 = CODE + "B", CODE3 = CODE + "C";
for (const cd of [CODE2, CODE3]) await admin.sb.from("promo_codes").insert({ code: cd, kind: "fixed", value: 400, min_order_cents: 1500, max_uses: 50, is_test: true, expires_at: new Date(Date.now() + 864e5).toISOString() });
await admin.sb.from("promo_codes").insert({ code: CODE, kind: "fixed", value: 400, min_order_cents: 1500, max_uses: 50, is_test: true, expires_at: new Date(Date.now() + 864e5).toISOString() });

try {
  // 1. scheduled + pickup + promo
  const a = await newOrder(cust, { fulfilment: "pickup" });
  const slot = new Date(Date.now() + 3 * 3600e3);
  const pa = await pay(cust, a, { promo_code: CODE, scheduled_for: slot.toISOString() });
  const ra = await row(a);
  ok("scheduled pickup with promo is accepted", pa.status === 200, `${pa.status} ${pa.body.error ?? ""}`);
  ok("pickup: no fee, promo applied, slot stored", ra.delivery_fee_cents === 0 && ra.discount_cents === 400 && ra.promo_code === CODE && !!ra.scheduled_for, JSON.stringify({ fee: ra.delivery_fee_cents, d: ra.discount_cents }));
  ok("Mollie amount = items + service − discount", pa.body.amount_cents === paidTotal(ra) && paidTotal(ra) === ra.subtotal_cents + ra.service_fee_cents - 400, `${pa.body.amount_cents} vs ${paidTotal(ra)}`);
  ok("pickup release = slot − prep only (no ride lead)", new Date(ra.release_at) < slot && slot - new Date(ra.release_at) <= 80 * 60000, `${(slot - new Date(ra.release_at)) / 60000} min`);
  ok("tip on scheduled pickup still refused", (await pay(cust, a, { promo_code: CODE, scheduled_for: slot.toISOString(), tip_cents: 100 })).status === 422);
  await markPaid(a);
  ok("not released to restaurant before release_at (status stays placed)", (await row(a)).status === "placed");

  // 2. group order + tip + leave at door + photo proof
  let r = await host.sb.rpc("create_group_order", { p_restaurant: RID, p_name: "QA host" }); const G = r.data?.id ?? r.data;
  const code = (await host.sb.from("group_orders").select("code").eq("id", G).single()).data?.code;
  await guest.sb.rpc("join_group_order", { p_code: code, p_name: "QA gast" });
  await guest.sb.rpc("group_add_item", { p_group: G, p_menu_item: menu[0].id, p_qty: 2 });
  await host.sb.rpc("group_add_item", { p_group: G, p_menu_item: menu[1].id, p_qty: 1 });
  await host.sb.rpc("group_set_locked", { p_group: G, p_locked: true });
  r = await host.sb.rpc("group_checkout", { p_group: G, p_address: ADDRESS, p_phone: "0612345678" });
  const g = r.data; ok("group checkout creates an order", !!g && !r.error, err(r)); mine.push(g);
  await admin.sb.from("orders").update({ is_test: true }).eq("id", g);
  const pg = await pay(host, g, { tip_cents: 200, leave_at_door: true });
  const rg = await row(g);
  ok("host chooses leave-at-door at group payment", (await admin.sb.from("orders").select("leave_at_door").eq("id", g).single()).data?.leave_at_door === true);
  ok("group payment with €2 tip", pg.status === 200 && rg.tip_cents === 200, `${pg.status} ${pg.body.error ?? ""}`);
  ok("group Mollie amount includes tip + service", pg.body.amount_cents === paidTotal(rg), `${pg.body.amount_cents} vs ${paidTotal(rg)}`);
  await markPaid(g);
  ok("group order walks to picked up", !(await walk(g, "picked_up")));
  const dv0 = await rider.sb.from("orders").update({ status: "delivered" }).eq("id", g).select("status");
  ok("group door drop needs the photo", !!err(dv0) || dv0.data?.[0]?.status !== "delivered");
  const path = `${g}/qa${Date.now()}.jpg`;
  ok("rider uploads door photo", !(await rider.sb.storage.from("delivery-proof").upload(path, img, { contentType: "image/png" })).error);
  ok("photo attached", !err(await rider.sb.rpc("order_set_delivery_photo", { p_order: g, p_path: path })));
  const dv = await rider.sb.from("orders").update({ status: "delivered" }).eq("id", g).select("status");
  ok("group order delivered", dv.data?.[0]?.status === "delivered", err(dv));
  const eg = (await admin.sb.from("earnings").select("amount_cents, tip_cents").eq("order_id", g).maybeSingle()).data;
  const gb = (await row(g)).rider_bonus_cents;
  ok("rider gets the fixed bonus (v27) + full group tip", gb === 50 && eg?.tip_cents === 200 && eg.amount_cents === gb + 200, JSON.stringify({ eg, gb }));
  ok("guest cannot see the door photo", !(await guest.sb.storage.from("delivery-proof").createSignedUrl(path, 60)).data?.signedUrl);
  ok("host can see the door photo", !!(await host.sb.storage.from("delivery-proof").createSignedUrl(path, 60)).data?.signedUrl);

  // 3. stacked order with tips
  const s1 = await newOrder(cust, { qty: 1 }), s2 = await newOrder(cust, { qty: 2 });
  await pay(cust, s1, { tip_cents: 100 }); await pay(cust, s2, { tip_cents: 300 });
  await markPaid(s1); await markPaid(s2);
  await walk(s1, "assigned"); await walk(s2, "assigned");
  await admin.sb.from("orders").update({ stacked: true }).in("id", [s1, s2]);
  const w1 = await walk(s1, "delivered"), w2 = await walk(s2, "delivered");
  const es = (await admin.sb.from("earnings").select("order_id, amount_cents, tip_cents").in("order_id", [s1, s2])).data ?? [];
  const r1 = await row(s1), r2 = await row(s2);
  ok("stacked: both delivered", !w1 && !w2, `${w1} ${w2}`);
  ok("stacked: each tip credited once to the rider", es.length === 2 && es.find((e) => e.order_id === s1)?.tip_cents === 100 && es.find((e) => e.order_id === s2)?.tip_cents === 300, JSON.stringify(es));
  ok("stacked: earnings = rider bonuses + tips", es.reduce((x, e) => x + e.amount_cents, 0) === r1.rider_bonus_cents + r2.rider_bonus_cents + 400 && r1.rider_bonus_cents === 50);

  // 4. credit never pushes the charge below €1 (min order) and stays on the balance
  await admin.sb.from("customer_credit").insert({ customer_id: cust.id, cents: 5000, reason: "admin" }).select("id");
  const bal0 = (await cust.sb.rpc("my_credit_cents")).data ?? 0;
  const c = await newOrder(cust, { qty: 1, fulfilment: "pickup" });
  const pc = await pay(cust, c, { use_credit: true });
  const rc = await row(c);
  ok("credit larger than the order still checks out", pc.status === 200, `${pc.status} ${pc.body.error ?? ""}`);
  ok("charge never below €1 Mollie minimum", pc.body.amount_cents >= 100 && pc.body.amount_cents === paidTotal(rc), `${pc.body.amount_cents}`);
  await markPaid(c);
  ok("only the used credit is deducted", ((await cust.sb.rpc("my_credit_cents")).data ?? 0) === bal0 - rc.credit_cents, `${bal0} - ${rc.credit_cents}`);
  ok("promo below its minimum is refused", (await pay(cust, await newOrder(cust, { qty: 1 }), { promo_code: CODE })).status === 422 || m.price_cents >= 1500);
  // cancelling returns the credit
  await admin.sb.from("orders").update({ status: "cancelled", cancel_reason: "test: qa" }).eq("id", c);
  ok("cancel returns the used credit", ((await cust.sb.rpc("my_credit_cents")).data ?? 0) === bal0);
  await admin.sb.from("customer_credit").insert({ customer_id: cust.id, cents: -5000, reason: "admin", order_id: c });

  // 5. scheduled order while the restaurant is closed now
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", weekday: "short" }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  const dow = String(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(p.weekday) + 1);
  await setAvail({ p_hours: { ...allDay, [dow]: [] }, p_set_hours: true });
  const k = await newOrder(cust);
  ok("closed now: ASAP order refused", (await pay(cust, k)).body.code === "closed");
  ok("closed now: slot later today (still closed) refused", (await pay(cust, k, { scheduled_for: new Date(Date.now() + 3600e3).toISOString() })).body.code === "schedule");
  const pk = await pay(cust, k, { scheduled_for: new Date(Date.now() + 26 * 3600e3).toISOString() });
  ok("closed now: slot tomorrow (open) accepted", pk.status === 200, `${pk.status} ${pk.body.error ?? ""}`);
  await setAvail({ p_hours: allDay, p_set_hours: true });

  // 6. refunds on promo + tip orders
  const f = await newOrder(cust);
  const pf = await pay(cust, f, { promo_code: CODE2, tip_cents: 150 });
  await markPaid(f);
  const rf = await row(f), paidF = paidTotal(rf);
  ok("promo+tip order charged correctly", pf.body.amount_cents === paidF && rf.discount_cents === 400 && rf.tip_cents === 150, `${pf.body.amount_cents} vs ${paidF}`);
  ok("walk promo+tip order to delivered", !(await walk(f, "delivered")));
  const eF = (await admin.sb.from("earnings").select("amount_cents, tip_cents").eq("order_id", f).maybeSingle()).data;
  const over = await cust.sb.rpc("support_create", { p_category: "missing_item", p_body: "QA test: meer dan betaald", p_order: f, p_refund_cents: paidF + 1 });
  ok("refund request above the paid amount is refused", !!err(over));
  const t1 = await cust.sb.rpc("support_create", { p_category: "missing_item", p_body: "QA test: item ontbreekt", p_order: f, p_refund_cents: 300 });
  ok("partial refund request accepted", !err(t1), err(t1));
  const rr1 = await refundCall({ ticket_id: t1.data, amount_cents: 300 });
  ok("partial refund 3,00 simulated", rr1.status === 200 && rr1.body.cents === 300, JSON.stringify(rr1.body));
  const t2 = await admin.sb.rpc("support_create", { p_category: "other", p_body: "QA test: rest terug", p_order: f });
  const rr2 = await refundCall({ ticket_id: t2.data, amount_cents: 999999 });
  ok("second refund capped at paid − already refunded (tip incl., discount excl.)", rr2.status === 200 && rr2.body.cents === paidF - 300, `${JSON.stringify(rr2.body)} expected ${paidF - 300}`);
  const t3 = await admin.sb.rpc("support_create", { p_category: "other", p_body: "QA test: nog meer", p_order: f });
  const rr3 = await refundCall({ ticket_id: t3.data, amount_cents: 100 });
  ok("nothing left to refund after full refund", rr3.status === 200 && !!rr3.body.skipped, JSON.stringify(rr3.body));
  const eF2 = (await admin.sb.from("earnings").select("amount_cents, tip_cents").eq("order_id", f).maybeSingle()).data;
  ok("rider keeps fee + tip after customer refunds", eF2?.tip_cents === 150 && eF2.amount_cents === eF.amount_cents, JSON.stringify(eF2));
  // full refund on cancel (paid, tip + promo)
  const x = await newOrder(cust);
  await pay(cust, x, { promo_code: CODE3, tip_cents: 250 }); await markPaid(x);
  const rx = await row(x), usesBefore = (await admin.sb.from("promo_codes").select("uses").eq("code", CODE3).single()).data.uses;
  await admin.sb.from("orders").update({ status: "cancelled", cancel_reason: "test: qa" }).eq("id", x);
  let rx2 = null; for (let i = 0; i < 30; i++) { rx2 = await row(x); if (rx2.refund_status && rx2.refund_status !== "processing") break; await sleep(1500); }
  ok("cancel refunds exactly what was charged (tip incl., discount excl.)", rx2.refund_status === "simulated" && rx2.refund_cents === paidTotal(rx), `${rx2.refund_status} ${rx2.refund_cents} vs ${paidTotal(rx)}`);
  ok("cancel frees the promo use", usesBefore === 1 && (await admin.sb.from("promo_codes").select("uses").eq("code", CODE3).single()).data.uses === 0, String(usesBefore));
  ok("no earnings for a cancelled order", !(await admin.sb.from("earnings").select("id").eq("order_id", x).maybeSingle()).data);

  // 7. payouts reconcile with the charged amounts
  const to = new Date(Date.now() + 60e3).toISOString();
  const rep = (await admin.sb.rpc("report_payments", { p_from: started, p_to: to })).data;
  const deliv = (await admin.sb.from("orders").select(COLS).in("id", mine).eq("status", "delivered")).data ?? [];
  const charged = deliv.reduce((s, o) => s + paidTotal(o), 0);
  const facts = Object.fromEntries(((await admin.sb.from("order_facts").select("id, commission_cents").in("id", deliv.map((o) => o.id))).data ?? []).map((f) => [f.id, f.commission_cents]));
  for (const o of deliv) o.commission_cents = facts[o.id] ?? 0;
  const restNet = deliv.reduce((s, o) => s + o.subtotal_cents - o.commission_cents, 0);
  const riderAll = ((await admin.sb.from("earnings").select("amount_cents").in("order_id", deliv.map((o) => o.id))).data ?? []).reduce((s, e) => s + e.amount_cents, 0);
  // v27: platform keeps commission + (delivery fee - rider bonus) + service fee, minus promo/credit it funds
  const platform = deliv.reduce((s, o) => s + o.commission_cents + o.delivery_fee_cents - (o.rider_bonus_cents ?? o.delivery_fee_cents) + (o.service_fee_cents ?? 0) - (o.discount_cents ?? 0) - (o.credit_cents ?? 0), 0);
  ok("Mollie total = restaurant net + rider earnings + platform share", charged === restNet + riderAll + platform, `${charged} = ${restNet} + ${riderAll} + ${platform}`);
  const repR = (rep?.restaurants ?? []).find((y) => y.restaurant_id === RID), repRider = (rep?.riders ?? []).find((y) => y.rider_id === rider.id);
  ok("restaurant payout report covers these orders", repR && repR.net_cents >= restNet, `${repR?.net_cents} >= ${restNet}`);
  ok("rider payout report covers fees + tips", repRider && repRider.earned_cents >= riderAll && repRider.tip_cents >= 650, `${repRider?.earned_cents} >= ${riderAll}`);
  ok("commission is on items only, never on tip", deliv.every((o) => o.commission_cents <= o.subtotal_cents));

  // RLS negatives on v17 tables / columns
  ok("anon cannot read promo codes", ((await anon.from("promo_codes").select("code")).data ?? []).length === 0);
  ok("customer cannot read promo codes", ((await cust.sb.from("promo_codes").select("code")).data ?? []).length === 0);
  ok("customer cannot create a promo code", !!err(await cust.sb.from("promo_codes").insert({ code: "HACK" + Date.now(), kind: "percent", value: 100 })));
  ok("customer cannot raise promo uses", ((await cust.sb.from("promo_codes").update({ max_uses: 9999 }).eq("code", CODE).select("code")).data ?? []).length === 0);
  ok("customer cannot grant themselves credit", !!err(await cust.sb.from("customer_credit").insert({ customer_id: cust.id, cents: 10000, reason: "admin" })));
  ok("others cannot read someone's credit", ((await out.sb.from("customer_credit").select("id").eq("customer_id", cust.id)).data ?? []).length === 0);
  ok("anon cannot read credit", ((await anon.from("customer_credit").select("id")).data ?? []).length === 0);
  ok("referral codes not listable by others", ((await out.sb.from("referral_codes").select("code").eq("customer_id", cust.id)).data ?? []).length === 0);
  ok("customer cannot insert a referral code for someone else", !!err(await out.sb.from("referral_codes").insert({ customer_id: cust.id, code: "QAHACK01" })));
  ok("anon cannot call my_credit_cents", !!err(await anon.rpc("my_credit_cents")));
  ok("anon cannot call my_referral_code", !!err(await anon.rpc("my_referral_code")));
  ok("trigger fn fp_on_paid_p6 not callable", !!err(await cust.sb.rpc("fp_on_paid_p6")));
  ok("customer cannot set discount on own order", (await (async () => { const z = await newOrder(cust, { qty: 1 }); await cust.sb.from("orders").update({ discount_cents: 999, credit_cents: 999, promo_code: CODE }).eq("id", z); const q = await row(z); return q.discount_cents === 0 && q.credit_cents === 0 && !q.promo_code; })()));
  ok("anon cannot list proof photos", ((await anon.storage.from("delivery-proof").list(String(g))).data ?? []).length === 0);
  ok("outsider cannot list proof photos", ((await out.sb.storage.from("delivery-proof").list(String(g))).data ?? []).length === 0);
  ok("proof bucket is not public", !(await fetch(`${SB_URL}/storage/v1/object/public/delivery-proof/${path}`)).ok);
  ok("outsider cannot delete a proof photo", ((await out.sb.storage.from("delivery-proof").remove([path])).data ?? []).length === 0 && !!(await admin.sb.storage.from("delivery-proof").createSignedUrl(path, 60)).data?.signedUrl);
  ok("customer cannot change opening hours directly", ((await cust.sb.from("restaurants").update({ opening_hours: {} }).eq("id", RID).select("id")).data ?? []).length === 0);
  ok("other restaurant staff/customer cannot set availability", !!err(await cust.sb.rpc("restaurant_set_availability", { p_rid: RID, p_pause_minutes: 30 })));
  ok("anon cannot read account_status_log", ((await anon.from("account_status_log").select("id")).data ?? []).length === 0);
  ok("customer sees only own account_status_log", ((await cust.sb.from("account_status_log").select("profile_id")).data ?? []).every((y) => y.profile_id === cust.id));
  ok("customer cannot write account_status_log", !!err(await cust.sb.from("account_status_log").insert({ profile_id: cust.id, to_status: "active" })));
} finally {
  await admin.sb.from("restaurants").update(hoursBefore).eq("id", RID);
  for (const id of mine) { const o = await row(id); if (o && !["delivered", "cancelled"].includes(o.status)) await admin.sb.from("orders").update({ status: "cancelled", cancel_reason: "test: qa cleanup" }).eq("id", id); }
  await admin.sb.from("promo_codes").update({ active: false }).in("code", [CODE, CODE + "B", CODE + "C"]);
}
process.exit(summary() ? 1 : 0);
