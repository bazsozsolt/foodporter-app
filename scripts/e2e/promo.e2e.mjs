// v17 P6: promo codes (admin), referral credit, scheduled orders — all validated server-side.
import { ADDRESS, login, ok, RID, SB_URL, summary } from "./common.mjs";
const admin = await login("ADMIN"), staff = await login("STAFF"), cust = await login("SIMC1");
// a test customer without paid orders (for the referral path)
let fresh = null;
for (const acct of ["OUTSIDER", "GUEST", "HOST", "CUST2"]) {
  try { const u = await login(acct); const n = ((await admin.sb.from("orders").select("id").eq("customer_id", u.id).not("paid_at", "is", null).limit(1)).data ?? []).length; if (!fresh) fresh = u; if (n === 0) { fresh = u; break; } } catch { /* account missing */ }
}
const err = (r) => r.error?.message ?? null;
const m = (await admin.sb.from("menu_items").select("id,name,price_cents").eq("restaurant_id", RID).eq("available", true).order("price_cents", { ascending: false }).limit(1).single()).data;
async function newOrder(u, qty = 3) {
  const o = (await u.sb.from("orders").insert({ customer_id: u.id, restaurant_id: RID, subtotal_cents: m.price_cents * qty, delivery_fee_cents: 295, address: ADDRESS, phone: "+31 6 0000 0000", status: "awaiting_payment" }).select("id").single()).data;
  await u.sb.from("order_items").insert({ order_id: o.id, menu_item_id: m.id, name: m.name, qty, price_cents: m.price_cents });
  await admin.sb.from("orders").update({ is_test: true }).eq("id", o.id);
  return o.id;
}
async function pay(u, id, body) {
  const tok = (await u.sb.auth.getSession()).data.session.access_token;
  const r = await fetch(`${SB_URL}/functions/v1/create-payment`, { method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json", Origin: "http://localhost:8787" }, body: JSON.stringify({ order_id: id, ...body }) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
const markPaid = (id) => admin.sb.from("orders").update({ status: "placed", paid_at: new Date().toISOString(), payment_status: "paid" }).eq("id", id);
const cancel = (id) => admin.sb.from("orders").update({ status: "cancelled", cancel_reason: "test: promo" }).eq("id", id);
const quote = (u, code, sub = 3000, credit = false) => u.sb.rpc("fp_quote_discount", { p_customer: u.id, p_subtotal: sub, p_code: code, p_use_credit: credit });

const CODE = `E2E${Date.now().toString().slice(-8)}`;
ok("customer cannot read promo codes", ((await cust.sb.from("promo_codes").select("code")).data ?? []).length === 0);
ok("customer cannot create a promo code", !!err(await cust.sb.from("promo_codes").insert({ code: "HACK1", kind: "percent", value: 50 })));
ok("invalid promo value is rejected", !!err(await admin.sb.from("promo_codes").insert({ code: `${CODE}X`, kind: "percent", value: 90, is_test: true })));
const c = await admin.sb.from("promo_codes").insert({ code: CODE, kind: "fixed", value: 300, min_order_cents: 1000, max_uses: 1, expires_at: new Date(Date.now() + 864e5).toISOString(), is_test: true });
ok("admin creates a fixed €3 code (min €10, 1 use)", !err(c), err(c));
await admin.sb.from("promo_codes").insert({ code: `${CODE}OLD`, kind: "percent", value: 10, expires_at: new Date(Date.now() - 1000).toISOString(), is_test: true });
let q = await quote(cust, CODE.toLowerCase());
ok("valid code gives €3 off (case-insensitive)", q.data?.discount_cents === 300 && !q.data.error, JSON.stringify(q.data ?? err(q)));
ok("below minimum order is refused", !!(await quote(cust, CODE, 500)).data?.error);
ok("expired code is refused", /verlopen/.test((await quote(cust, `${CODE}OLD`)).data?.error ?? ""));
ok("first-order code refused for a returning customer", /eerste/.test((await quote(cust, "TESTWELKOM")).data?.error ?? ""));
ok("unknown code is refused", !!(await quote(cust, "NOPE123")).data?.error);
ok("cannot quote for someone else", !!err(await cust.sb.rpc("fp_quote_discount", { p_customer: fresh.id, p_subtotal: 3000, p_code: CODE, p_use_credit: false })));

const o1 = await newOrder(cust);
const p1 = await pay(cust, o1, { promo_code: CODE });
ok("payment with the code is created", p1.status === 200, `${p1.status} ${JSON.stringify(p1.body).slice(0, 100)}`);
const r1 = (await admin.sb.from("orders").select("discount_cents, promo_code").eq("id", o1).single()).data;
ok("discount stored on the order", r1.discount_cents === 300 && r1.promo_code === CODE, JSON.stringify(r1));
ok("customer cannot change the discount", !!err(await cust.sb.from("orders").update({ discount_cents: 5000 }).eq("id", o1)) || (await admin.sb.from("orders").select("discount_cents").eq("id", o1).single()).data.discount_cents === 300);
await markPaid(o1);
ok("use is counted when paid", (await admin.sb.from("promo_codes").select("uses").eq("code", CODE).single()).data.uses === 1);
const o2 = await newOrder(cust);
const p2 = await pay(cust, o2, { promo_code: CODE });
ok("max uses reached -> refused server-side", p2.status === 422 && p2.body.code === "promo", `${p2.status} ${p2.body.error}`);
await cancel(o1); await cancel(o2);

// referral
const myCode = (await cust.sb.rpc("my_referral_code")).data;
ok("customer gets a referral code", /^[A-Z0-9]{8}$/.test(myCode ?? ""), String(myCode));
ok("referral code is stable", (await cust.sb.rpc("my_referral_code")).data === myCode);
ok("own referral code is refused", /eigen/.test((await quote(cust, myCode)).data?.error ?? ""));
const freshPaid = ((await admin.sb.from("orders").select("id").eq("customer_id", fresh.id).not("paid_at", "is", null).limit(1)).data ?? []).length;
if (freshPaid === 0) {
  q = await quote(fresh, myCode);
  ok("new customer gets €5 off with a friend's code", q.data?.discount_cents === 500 && q.data.kind === "referral", JSON.stringify(q.data));
  const before = (await cust.sb.rpc("my_credit_cents")).data ?? 0;
  const o3 = await newOrder(fresh);
  const p3 = await pay(fresh, o3, { promo_code: myCode });
  ok("referral payment created", p3.status === 200, `${p3.status} ${p3.body.error ?? ""}`);
  await markPaid(o3);
  const after = (await cust.sb.rpc("my_credit_cents")).data ?? 0;
  ok("the friend who invited gets €5 credit", after - before === 500, `${before} -> ${after}`);
  await cancel(o3); await admin.sb.from("orders").update({ paid_at: null }).eq("id", o3); // keep this test customer "new" so the referral path stays repeatable
  // credit is spent on the next order
  const o4 = await newOrder(cust);
  q = await quote(cust, "", m.price_cents * 3, true);
  ok("credit can be applied at checkout", q.data?.credit_cents >= 500, JSON.stringify(q.data));
  const p4 = await pay(cust, o4, { use_credit: true });
  ok("payment with credit created", p4.status === 200, `${p4.status} ${p4.body.error ?? ""}`);
  await markPaid(o4);
  ok("used credit is deducted from the balance", ((await cust.sb.rpc("my_credit_cents")).data ?? 0) === after - (await admin.sb.from("orders").select("credit_cents").eq("id", o4).single()).data.credit_cents);
  await cancel(o4);
} else console.log("SKIP referral: OUTSIDER already has paid orders");
ok("others cannot read someone's credit", ((await fresh.sb.from("customer_credit").select("id").eq("customer_id", cust.id)).data ?? []).length === 0);

// scheduled orders
const o5 = await newOrder(cust);
ok("slot less than 30 min ahead is refused", (await pay(cust, o5, { scheduled_for: new Date(Date.now() + 10 * 60000).toISOString() })).body.code === "schedule");
ok("slot more than 7 days ahead is refused", (await pay(cust, o5, { scheduled_for: new Date(Date.now() + 8 * 864e5).toISOString() })).body.code === "schedule");
const slot = new Date(Date.now() + 3 * 3600e3);
const p5 = await pay(cust, o5, { scheduled_for: slot.toISOString() });
ok("scheduled payment created (3 h ahead)", p5.status === 200, `${p5.status} ${p5.body.error ?? ""}`);
const r5 = (await admin.sb.from("orders").select("scheduled_for, release_at").eq("id", o5).single()).data;
ok("release time is before the slot (prep + bidding + ride)", r5.scheduled_for && new Date(r5.release_at) < new Date(r5.scheduled_for) && new Date(r5.release_at) > new Date(), JSON.stringify(r5));
await markPaid(o5);
const early = await staff.sb.from("orders").update({ status: "accepted", prep_minutes: 15 }).eq("id", o5).select("status");
ok("restaurant cannot accept before the release time", !!err(early), err(early));
ok("customer cannot move the slot after paying", !!err(await cust.sb.from("orders").update({ scheduled_for: new Date().toISOString() }).eq("id", o5)) || (await admin.sb.from("orders").select("scheduled_for").eq("id", o5).single()).data.scheduled_for === r5.scheduled_for);
await cancel(o5);
await admin.sb.from("promo_codes").update({ active: false }).in("code", [CODE, `${CODE}OLD`]);
process.exit(summary() ? 1 : 0);
