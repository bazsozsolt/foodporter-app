// Support system: tickets, strict RLS, photos in a private bucket, admin flow, refunds, SOS, realtime, push, limits.
import { client, login, ok, sleep, summary, SB_URL, ANON } from "./common.mjs";
const anon = client();
const admin = await login("ADMIN"), c1 = await login("SIMC1"), c2 = await login("SIMC2"), staff = await login("STAFF"), rider = await login("SIMR1"), out = await login("OUTSIDER");
const err = (r) => r.error?.message ?? null;
const delivered = async (u) => (await admin.sb.from("orders").select("id, subtotal_cents, delivery_fee_cents, restaurant_id, rider_id").eq("customer_id", u.id).eq("status", "delivered").like("mollie_payment_id", "tr_sim_%").order("id", { ascending: false }).limit(1).single()).data;
const o1 = await delivered(c1), o2 = await delivered(c2);
ok("test orders found", !!o1 && !!o2, `${o1?.id} ${o2?.id}`);

// photo: own folder only, private
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const path = `${c1.id}/e2e_${Date.now()}.png`;
ok("customer uploads a photo to own folder", !err(await c1.sb.storage.from("support-photos").upload(path, png, { contentType: "image/png" })));
ok("upload into someone else's folder is blocked", !!err(await c2.sb.storage.from("support-photos").upload(`${c1.id}/x_${Date.now()}.png`, png, { contentType: "image/png" })));
ok("non-image upload is rejected", !!err(await c1.sb.storage.from("support-photos").upload(`${c1.id}/e2e_${Date.now()}.png`, Buffer.from("<svg onload=alert(1)>"), { contentType: "image/svg+xml" })));
ok("bucket is private (no public URL access)", (await fetch(`${SB_URL}/storage/v1/object/public/support-photos/${path}`)).status >= 400);

const t = await c1.sb.rpc("support_create", { p_category: "missing_item", p_body: "De friet ontbrak <script>alert(1)</script>", p_order: o1.id, p_refund_cents: 300, p_photo_path: path });
ok("customer opens a ticket on own order (with photo + refund request)", Number.isInteger(t.data), err(t));
const tid = t.data;
const { data: tk } = await c1.sb.from("support_tickets").select("*").eq("id", tid).single();
ok("ticket has priority, SLA and refund request", tk?.priority === "normal" && !!tk.sla_due_at && tk.refund_status === "requested" && tk.refund_requested_cents === 300, JSON.stringify({ p: tk?.priority, r: tk?.refund_status }));
ok("ticket for someone else's order is refused", !!err(await c1.sb.rpc("support_create", { p_category: "late", p_body: "waar blijft het", p_order: o2.id })));
ok("refund above the paid amount is refused", !!err(await c2.sb.rpc("support_create", { p_category: "refund", p_body: "alles terug x10", p_order: o2.id, p_refund_cents: 999999 })));
ok("category not allowed for the role is refused", !!err(await c1.sb.rpc("support_create", { p_category: "sos", p_body: "test", p_order: o1.id })));
ok("too long message refused", !!err(await c1.sb.rpc("support_reply", { p_ticket: tid, p_body: "x".repeat(2001) })));
ok("photo path from another user refused", !!err(await c2.sb.rpc("support_create", { p_category: "other", p_body: "kijk deze foto", p_photo_path: path })));
ok("direct insert into tickets blocked", !!err(await c1.sb.from("support_tickets").insert({ created_by: c1.id, role: "customer", category: "other", subject: "x", sla_due_at: new Date().toISOString() })));
for (const [who, u] of [["other customer", c2.sb], ["restaurant", staff.sb], ["anon", anon]]) {
  const a = await u.from("support_tickets").select("id").eq("id", tid); const b = await u.from("support_messages").select("id").eq("ticket_id", tid);
  ok(`${who} cannot see the ticket or its messages`, (a.data ?? []).length === 0 && (b.data ?? []).length === 0);
}
const signedOther = await c2.sb.storage.from("support-photos").createSignedUrl(path, 60);
ok("another user cannot get a signed URL for the photo", !!signedOther.error || !signedOther.data?.signedUrl);
const signedAdmin = await admin.sb.storage.from("support-photos").createSignedUrl(path, 60);
ok("admin gets a working signed URL", !!signedAdmin.data?.signedUrl && (await fetch(signedAdmin.data.signedUrl)).status === 200);

// realtime: customer listens for replies
const got = [];
const ch = c1.sb.channel(`sup-${tid}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages", filter: `ticket_id=eq.${tid}` }, (p) => got.push(p.new)).subscribe();
await sleep(2500);
ok("admin internal note", !err(await admin.sb.rpc("support_reply", { p_ticket: tid, p_body: "Intern: klant is vaste klant", p_internal: true })));
const rep = await admin.sb.rpc("support_reply", { p_ticket: tid, p_body: "Sorry! We betalen de friet terug." });
ok("admin replies", Number.isInteger(rep.data), err(rep));
await sleep(3000);
ok("customer gets the reply in realtime (not the internal note)", got.some((m) => m.body.startsWith("Sorry")) && !got.some((m) => m.internal), `${got.length} events`);
c1.sb.removeChannel(ch);
const msgs = (await c1.sb.from("support_messages").select("body, internal, author_role").eq("ticket_id", tid)).data ?? [];
ok("customer never sees internal notes", msgs.length === 2 && !msgs.some((m) => m.internal), msgs.map((m) => m.author_role).join(","));
const after = (await c1.sb.from("support_tickets").select("status, first_response_at").eq("id", tid).single()).data;
ok("status → waiting_user and first response recorded", after.status === "waiting_user" && !!after.first_response_at);
let pl = [];
for (let k = 0; k < 10; k++) { pl = (await admin.sb.rpc("push_log_by_key", { p_key: `sup:${rep.data}` })).data ?? []; if (pl.length) break; await sleep(1500); }
ok("reply triggers a push to the ticket owner", pl.length === 1, JSON.stringify(pl[0] ?? {}));
ok("customer replies → open again", !err(await c1.sb.rpc("support_reply", { p_ticket: tid, p_body: "Dank je!" })) && (await c1.sb.from("support_tickets").select("status").eq("id", tid).single()).data.status === "open");

// refunds through order-refund (admin only)
const call = (u, body) => fetch(`${SB_URL}/functions/v1/order-refund`, { method: "POST", headers: { "Content-Type": "application/json", apikey: ANON, Authorization: `Bearer ${u.session.access_token}` }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const asCust = await call(c1, { ticket_id: tid, amount_cents: 300 });
ok("customer cannot trigger a refund", asCust.status === 403, JSON.stringify(asCust));
const asAdmin = await call(admin, { ticket_id: tid, amount_cents: 300 });
ok("admin partial refund (simulated test payment)", asAdmin.status === 200 && asAdmin.body.status === "simulated" && asAdmin.body.cents === 300, JSON.stringify(asAdmin));
ok("second refund on the same ticket is refused", (await call(admin, { ticket_id: tid, amount_cents: 300 })).status === 409);
ok("customer sees the refund message", ((await c1.sb.from("support_messages").select("body").eq("ticket_id", tid)).data ?? []).some((m) => /Terugbetaling van €3,00/.test(m.body)));

// admin controls
ok("non-admin cannot resolve/assign", !!err(await c1.sb.rpc("support_admin_update", { p_ticket: tid, p_status: "resolved" })));
ok("admin assigns + resolves", !err(await admin.sb.rpc("support_admin_update", { p_ticket: tid, p_assign: admin.id, p_status: "resolved" })) && (await c1.sb.from("support_tickets").select("status").eq("id", tid).single()).data.status === "resolved");

// restaurant: item unavailable
const { data: ko } = await admin.sb.from("orders").select("id, order_items(id, menu_item_id, name, price_cents, qty)").eq("restaurant_id", staff.restaurantId ?? "187f751c-bebb-4a34-9d4b-9b1a9e8851db").eq("is_test", true).not("paid_at", "is", null).order("id", { ascending: false }).limit(1).single();
const item = ko.order_items[0];
const iu = await staff.sb.rpc("support_item_unavailable", { p_order: ko.id, p_order_item: item.id, p_sold_out: true, p_note: "op" });
const st = iu.data ? (await staff.sb.from("support_tickets").select("category, refund_requested_cents").eq("id", iu.data).single()).data : null;
ok("restaurant reports an unavailable item (refund suggestion = item value)", st?.category === "item_unavailable" && st.refund_requested_cents === item.price_cents * item.qty, err(iu) ?? JSON.stringify(st));
const mi = (await admin.sb.from("menu_items").select("available").eq("id", item.menu_item_id).single()).data;
ok("item marked sold out on the menu", mi?.available === false);
await staff.sb.from("menu_items").update({ available: true }).eq("id", item.menu_item_id);
ok("restaurant can't report on another restaurant's order", !!err(await staff.sb.rpc("support_item_unavailable", { p_order: o2.restaurant_id === ko.restaurant_id ? -1 : o2.id, p_order_item: item.id })));

// rider SOS
const sos = await rider.sb.rpc("support_create", { p_category: "sos", p_body: "SOS: hulp nodig", p_lat: 51.5555, p_lng: 5.0913 });
const sosT = sos.data ? (await rider.sb.from("support_tickets").select("priority, sla_due_at, created_at").eq("id", sos.data).single()).data : null;
ok("rider SOS → urgent ticket with 10-minute SLA", sosT?.priority === "urgent" && Date.parse(sosT.sla_due_at) - Date.parse(sosT.created_at) <= 10 * 60000 + 1000, err(sos));
const al = (await admin.sb.from("ops_alerts").select("kind, message").eq("kind", "sos").order("id", { ascending: false }).limit(1)).data?.[0];
ok("SOS raises an ops alert with location", !!al && al.message.includes(`#${sos.data}`) && al.message.includes("51.5555"), al?.message);
ok("rider payout question", Number.isInteger((await rider.sb.rpc("support_create", { p_category: "payout", p_body: "Wanneer word ik uitbetaald?" })).data));

// rate limit
let limited = false;
for (let k = 0; k < 8 && !limited; k++) { const r = await out.sb.rpc("support_create", { p_category: "other", p_body: `test ${k}` }); if (/rate limit/.test(err(r) ?? "")) limited = true; }
ok("ticket creation is rate limited", limited);

const rep2 = await admin.sb.rpc("report_support", { p_from: new Date(Date.now() - 86400000).toISOString(), p_to: new Date(Date.now() + 60000).toISOString(), p_include_test: true });
ok("support metrics report", rep2.data?.tickets >= 4 && rep2.data.sos >= 1 && rep2.data.refunded_cents >= 300, JSON.stringify(rep2.data ?? err(rep2)).slice(0, 250));
ok("report is admin-only", !!err(await c1.sb.rpc("report_support", { p_from: new Date(0).toISOString(), p_to: new Date().toISOString() })));
process.exit(summary() ? 1 : 0);
