// v26: business model from the approved financial plan. Server-side fees (distance bands + service fee), price tamper guard,
// per-order commission (20% founding / 25% / 10% pickup), settings bounds, historic orders unchanged. Test data only, Mollie test mode.
import { login, ok, RID, SB_URL, ADDRESS, summary } from "./common.mjs";
const admin = await login("ADMIN"), cust = await login("SIMC1"), staff = await login("STAFF");
const err = (r) => r?.error?.message ?? null;
const s0 = (await admin.sb.from("settings").select("*").single()).data;
ok("plan defaults: zone 5 km, service €0.99, bands 249/349/499",
  Number(s0.zone_radius_km) === 5 && s0.service_fee_cents === 99 && JSON.stringify(s0.delivery_fee_bands.map((b) => b.fee_cents)) === "[249,349,499]");
ok("plan defaults: commission 25 / 20 for 3 months / 10 pickup, min-max contracts",
  Number(s0.commission_delivery_pct) === 25 && Number(s0.commission_intro_pct) === 20 && s0.commission_intro_months === 3 && Number(s0.commission_pickup_pct) === 10 && s0.default_contract_kind === "min_max");
// settings bounds (each update must fail and leave the row unchanged)
for (const [name, patch] of [["zone 12 km", { zone_radius_km: 12 }], ["zone 4 km", { zone_radius_km: 4 }], ["commission 50%", { commission_delivery_pct: 50 }],
  ["descending fee bands", { delivery_fee_bands: [{ max_km: 5, fee_cents: 349 }, { max_km: 3, fee_cents: 249 }] }], ["fee €15", { delivery_fee_bands: [{ max_km: 10, fee_cents: 1500 }] }],
  ["fractional cents", { delivery_fee_bands: [{ max_km: 10, fee_cents: 249.5 }] }], ["contract max < min", { minmax_default_min_h: 20, minmax_default_max_h: 10 }]]) {
  const r = await admin.sb.from("settings").update(patch).eq("id", s0.id).select("id");
  ok(`settings reject ${name}`, !!err(r), err(r) ?? "accepted!");
}
const cu = await cust.sb.from("settings").update({ service_fee_cents: 0 }).eq("id", s0.id).select("id");
ok("a customer cannot change settings", !!err(cu) || (cu.data ?? []).length === 0);
const st = await staff.sb.from("settings").update({ commission_delivery_pct: 5 }).eq("id", s0.id).select("id");
ok("restaurant staff cannot change settings", !!err(st) || (st.data ?? []).length === 0);
const rs = await staff.sb.from("restaurants").update({ commission_pct: 5, partner_since: "2020-01-01" }).eq("id", RID).select("id");
ok("restaurant staff cannot set their own commission or partner date", !!err(rs) || (rs.data ?? []).length === 0);
const s1 = (await admin.sb.from("settings").select("*").single()).data;
ok("settings unchanged after rejected updates", JSON.stringify(s1) === JSON.stringify(s0));
// fee bands
const fees = []; for (const km of [0.4, 3, 3.01, 5, 7, 25]) fees.push((await admin.sb.rpc("fp_delivery_fee", { p_km: km })).data);
ok("fee bands 0.4/3/3.01/5/7/25 km = 249/249/349/349/499/499", JSON.stringify(fees) === "[249,249,349,349,499,499]", JSON.stringify(fees));

const m = (await admin.sb.from("menu_items").select("id,name,price_cents").eq("restaurant_id", RID).eq("available", true).order("price_cents", { ascending: false }).limit(1).single()).data;
const qty = Math.max(1, Math.ceil(1600 / m.price_cents));
const tok = (await cust.sb.auth.getSession()).data.session.access_token;
const pay = (body) => fetch(`${SB_URL}/functions/v1/create-payment`, { method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json", Origin: "http://localhost:8787" }, body: JSON.stringify(body) });
async function newOrder(extra) {
  const ins = await cust.sb.from("orders").insert({ customer_id: cust.id, restaurant_id: RID, subtotal_cents: 1, delivery_fee_cents: 100, service_fee_cents: 0, commission_pct: 1, commission_cents: 0, fee_km: 0.1,
    address: ADDRESS, phone: "+31 6 0000 0000", status: "awaiting_payment", ...extra }).select("id, commission_pct, fee_km, service_fee_cents").single();
  if (ins.data) { await cust.sb.from("order_items").insert({ order_id: ins.data.id, menu_item_id: m.id, name: m.name, qty, price_cents: 1 }); await admin.sb.from("orders").update({ is_test: true }).eq("id", ins.data.id); }
  return ins;
}
const created = [];
// delivery order with tampered client fields
const d = await newOrder({}); created.push(d.data?.id);
ok("customer insert: client commission/fee_km are discarded", d.data && d.data.commission_pct == null && d.data.fee_km == null, err(d) ?? JSON.stringify(d.data));
const bad = await pay({ order_id: d.data.id, tip_cents: 0, expected_total_cents: 1000 }); const bb = await bad.json().catch(() => ({}));
ok("wrong expected total → 409 price_changed with breakdown", bad.status === 409 && bb.code === "price_changed" && bb.breakdown?.total_cents > 0, `${bad.status} ${bb.code}`);
ok("no Mollie payment created on 409", (await admin.sb.from("orders").select("mollie_payment_id").eq("id", d.data.id).single()).data.mollie_payment_id == null);
const b = bb.breakdown;
const expFee = (await admin.sb.rpc("fp_delivery_fee", { p_km: b.fee_km })).data;
ok("server prices food from the menu, not the client", b.subtotal_cents === m.price_cents * qty, `${b.subtotal_cents} vs ${m.price_cents * qty}`);
ok("delivery fee follows the distance band", b.delivery_fee_cents === expFee && b.fee_km > 0 && b.fee_km <= 10, `${b.fee_km} km → ${b.delivery_fee_cents}`);
ok("service fee €0.99 on delivery", b.service_fee_cents === 99);
ok("breakdown adds up", b.total_cents === b.subtotal_cents + b.delivery_fee_cents + b.service_fee_cents + b.tip_cents - b.discount_cents - b.credit_cents);
ok("negative tip rejected", !(await pay({ order_id: d.data.id, tip_cents: -500 })).ok);
const str = await pay({ order_id: d.data.id, tip_cents: 0, expected_total_cents: String(b.total_cents - 1) });
ok("expected total as a string can't bypass the check", str.status === 409 || str.status === 400, String(str.status));
const good = await pay({ order_id: d.data.id, tip_cents: 50, expected_total_cents: b.total_cents + 50 }); const gb = await good.json().catch(() => ({}));
ok("matching expected total (+tip) → Mollie test checkout", good.ok && !!gb.checkoutUrl && gb.testmode === true && gb.amount_cents === b.total_cents + 50, `${good.status} ${JSON.stringify(gb).slice(0, 120)}`);
const row = (await admin.sb.from("orders").select("subtotal_cents, delivery_fee_cents, service_fee_cents, tip_cents, fee_km, commission_pct").eq("id", d.data.id).single()).data;
ok("stored order = charged breakdown", row.delivery_fee_cents === b.delivery_fee_cents && row.service_fee_cents === 99 && row.tip_cents === 50 && Number(row.fee_km) === b.fee_km, JSON.stringify(row));
ok("no commission before payment", row.commission_pct == null);
const t1 = await cust.sb.from("orders").update({ service_fee_cents: 0, delivery_fee_cents: 100, fee_km: 0.5 }).eq("id", d.data.id).select("id");
const r1 = (await admin.sb.from("orders").select("delivery_fee_cents, service_fee_cents, fee_km").eq("id", d.data.id).single()).data;
ok("customer cannot lower fees afterwards", (!!err(t1) || (t1.data ?? []).length === 0 || true) && r1.service_fee_cents === 99 && r1.delivery_fee_cents === b.delivery_fee_cents && Number(r1.fee_km) === b.fee_km, JSON.stringify(r1));
// simulate the paid webhook (admin, test order)
await admin.sb.from("orders").update({ status: "placed", paid_at: new Date().toISOString(), payment_status: "paid" }).eq("id", d.data.id);
const paid = (await admin.sb.from("orders").select("commission_pct, commission_cents, subtotal_cents").eq("id", d.data.id).single()).data;
const rest = (await admin.sb.from("restaurants").select("commission_pct, partner_since").eq("id", RID).single()).data;
ok("paid delivery order stores the founding rate 20% (test restaurant, partner < 3 months)", Number(paid.commission_pct) === 20 && paid.commission_cents === Math.round(paid.subtotal_cents * 0.2), JSON.stringify({ paid, rest }));
await cust.sb.from("orders").update({ commission_pct: 5, commission_cents: 1 }).eq("id", d.data.id);
await staff.sb.from("orders").update({ commission_pct: 5, commission_cents: 1 }).eq("id", d.data.id);
const keep = (await admin.sb.from("orders").select("commission_pct, commission_cents").eq("id", d.data.id).single()).data;
ok("customer and restaurant cannot rewrite the stored rate (admin corrections only)", Number(keep.commission_pct) === 20 && keep.commission_cents === paid.commission_cents, JSON.stringify(keep));
const t3 = await cust.sb.from("orders").update({ fulfilment: "pickup" }).eq("id", d.data.id).select("id");
ok("customer cannot switch to pickup after paying", (await admin.sb.from("orders").select("fulfilment").eq("id", d.data.id).single()).data.fulfilment === "delivery", err(t3));
await admin.sb.from("orders").update({ status: "cancelled", cancel_reason: "v26 test", cancelled_at: new Date().toISOString() }).eq("id", d.data.id);
// pickup
const p = await newOrder({ fulfilment: "pickup", address: "Afhalen bij 't Kaasbolleke" }); created.push(p.data?.id);
const pp = await pay({ order_id: p.data.id, tip_cents: 0 }); const pj = await pp.json().catch(() => ({}));
ok("pickup: no delivery fee, no service fee", pp.ok && pj.breakdown?.delivery_fee_cents === 0 && pj.breakdown?.service_fee_cents === 0 && pj.amount_cents === pj.breakdown.subtotal_cents - pj.breakdown.discount_cents - pj.breakdown.credit_cents, JSON.stringify(pj.breakdown));
await admin.sb.from("orders").update({ status: "placed", paid_at: new Date().toISOString(), payment_status: "paid" }).eq("id", p.data.id);
const pr = (await admin.sb.from("orders").select("commission_pct, commission_cents, subtotal_cents").eq("id", p.data.id).single()).data;
ok("paid pickup order stores 10%", Number(pr.commission_pct) === 10 && pr.commission_cents === Math.round(pr.subtotal_cents * 0.1), JSON.stringify(pr));
const f = (await admin.sb.from("order_facts").select("commission_pct, fulfilment_kind, service_fee_cents").eq("id", p.data.id).single()).data;
ok("order_facts reports stored rate + fulfilment + service fee", Number(f?.commission_pct) === 10 && f.fulfilment_kind === "pickup" && f.service_fee_cents === 0, JSON.stringify(f));
await admin.sb.from("orders").update({ status: "cancelled", cancel_reason: "v26 test", cancelled_at: new Date().toISOString() }).eq("id", p.data.id);
// out of zone
const z = await newOrder({ address: "FP TEST: Grote Markt 1, 4811 XP Breda" }); created.push(z.data?.id);
const zr = await pay({ order_id: z.data.id, tip_cents: 0 }); const zj = await zr.json().catch(() => ({}));
ok("address outside the 5 km zone is refused server-side", zr.status === 422 && zj.code === "zone", `${zr.status} ${zj.code}`);
await admin.sb.from("orders").update({ status: "cancelled", cancel_reason: "v26 test", cancelled_at: new Date().toISOString() }).eq("id", z.data.id);
// historic orders
const hist = await admin.sb.from("orders").select("id, commission_pct").lt("created_at", "2026-10-16T12:00:00Z").not("paid_at", "is", null).limit(1000);
ok("historic paid orders keep their stored 12% rate", (hist.data ?? []).length > 0 && hist.data.every((o) => Number(o.commission_pct) === 12), `${hist.data?.length} orders`);
const rp = await admin.sb.rpc("report_payments", { p_from: new Date(Date.now() - 864e5).toISOString(), p_to: new Date(Date.now() + 864e5).toISOString() });
const mine = (rp.data?.restaurants ?? rp.data ?? []).find?.((x) => x.restaurant_id === RID);
ok("payout report shows current delivered + pickup rates", !rp.error && mine && Number(mine.commission_pct) === 20 && Number(mine.pickup_pct) === 10, err(rp) ?? JSON.stringify(mine).slice(0, 200));
console.log("test orders:", created.join(","));
process.exit(summary() ? 1 : 0);
