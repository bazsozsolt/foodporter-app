// v13: + order chat messages ({ chat_message_id }) -> push to the other party.
// Web push for Food Porter. Called by a DB trigger (pg_net) with { order_id }. The body is only a hint: we re-read
// the order with the service role, derive the event from its current state, and dedupe through push_log, so spoofed
// or repeated calls can't send extra pushes. Events:
//   placed                     -> restaurant staff ("new order")
//   accepted, no rider yet     -> online riders in the zone (same test/real flag as the order)  ("bid now")
//   accepted/assigned/picked_up/delivered/cancelled -> the customer (status update)
// The VAPID key pair is generated here on first use and stored in push_vapid (no client role can read it).
// Dead subscriptions (404/410, or 5 failures in a row) are pruned.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const SUBJECT = "https://bazsozsolt.github.io/foodporter-app/";
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

let vapidReady = false;
async function vapid() {
  if (vapidReady) return;
  let { data } = await db.from("push_vapid").select("public_key, private_key").eq("id", 1).maybeSingle();
  if (!data) {
    const k = webpush.generateVAPIDKeys();
    await db.from("push_vapid").upsert({ id: 1, public_key: k.publicKey, private_key: k.privateKey }, { onConflict: "id", ignoreDuplicates: true });
    ({ data } = await db.from("push_vapid").select("public_key, private_key").eq("id", 1).single());
  }
  webpush.setVapidDetails(SUBJECT, data!.public_key, data!.private_key);
  vapidReady = true;
}

const km = (a: number, b: number, c: number, d: number) => {
  const r = (x: number) => (x * Math.PI) / 180, R = 6371;
  const h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

type Push = { key: string; to: string[]; title: string; body: string; url: string; tag: string; ttl: number; urgency: "high" | "normal" };

const CUSTOMER: Record<string, string> = {
  accepted: "Het restaurant is met je bestelling bezig 👨‍🍳",
  assigned: "Er is een bezorger gekoppeld aan je bestelling 🛵",
  picked_up: "Je bestelling is onderweg! 🛵💨",
  delivered: "Bezorgd! Eet smakelijk 😋",
  cancelled: "Je bestelling is geannuleerd. Een eventuele terugbetaling volgt automatisch.",
};

async function events(orderId: number, hint?: string): Promise<Push[]> {
  const { data: o } = await db.from("orders").select("id, status, paid_at, rider_id, restaurant_id, customer_id, is_test, renotified_at, restaurants(name)").eq("id", orderId).maybeSingle();
  if (!o) return [];
  const rname = (o.restaurants as unknown as { name?: string } | null)?.name ?? "het restaurant";
  const out: Push[] = [];
  // "placed" may already have moved on when we run (fast kitchens); the paid order + dedupe make the hint safe.
  if (o.status === "placed" || (hint === "placed" && o.paid_at && Date.now() - Date.parse(o.paid_at) < 30 * 60000)) {
    const { data: staff } = await db.from("profiles").select("id").eq("restaurant_id", o.restaurant_id).in("role", ["restaurant", "admin"]);
    out.push({ key: `rest:${o.id}`, to: (staff ?? []).map((s) => s.id), title: `Beep-beep! Nieuwe bestelling #${o.id}`, body: "Accepteer de bestelling en kies een bereidingstijd.", url: "/restaurant/", tag: `fp-rest-${o.id}`, ttl: 600, urgency: "high" });
  }
  if (o.status === "accepted" && !o.rider_id) {
    const { data: st } = await db.from("settings").select("zone_radius_km, zone_center_lat, zone_center_lng").limit(1).single();
    const { data: riders } = await db.from("profiles").select("id").eq("role", "rider").eq("online", true).eq("status", "active").eq("is_test", o.is_test);
    const ids = (riders ?? []).map((r) => r.id);
    const since = new Date(Date.now() - 30 * 60000).toISOString();
    const { data: locs } = ids.length ? await db.from("rider_locations").select("rider_id, lat, lng, created_at").in("rider_id", ids).gte("created_at", since).order("created_at", { ascending: false }) : { data: [] };
    const last = new Map<string, { lat: number; lng: number }>();
    for (const l of locs ?? []) if (!last.has(l.rider_id)) last.set(l.rider_id, l);
    // riders without a recent position count as in the zone (being online already requires it in the app)
    const inZone = ids.filter((id) => { const l = last.get(id); return !l || !st || km(l.lat, l.lng, st.zone_center_lat, st.zone_center_lng) <= st.zone_radius_km; });
    out.push({ key: `bid:${o.id}:${o.renotified_at ?? "0"}`, to: inZone, title: "Beep-beep! Nieuwe bestelling om op te bieden", body: `#${o.id} bij ${rname}: bied nu je bezorgtijd.`, url: "/rider/", tag: "fp-bid", ttl: 180, urgency: "high" });
  }
  if (CUSTOMER[o.status]) {
    out.push({ key: `cust:${o.id}:${o.status}`, to: [o.customer_id], title: `Food Porter · bestelling #${o.id}`, body: CUSTOMER[o.status], url: `/order/?id=${o.id}`, tag: `fp-order-${o.id}`, ttl: 3600, urgency: o.status === "picked_up" ? "high" : "normal" });
  }
  return out;
}

// Support: a new message in a ticket. Staff replies go to the ticket owner; user messages go to admins
// (test tickets only reach test admins, so real admins aren't paged by test data).
async function supportEvents(messageId: number): Promise<Push[]> {
  const { data: m } = await db.from("support_messages").select("id, ticket_id, author_role, body, internal").eq("id", messageId).maybeSingle();
  if (!m || m.internal) return [];
  const { data: t } = await db.from("support_tickets").select("id, created_by, subject, priority, category, is_test, order_id").eq("id", m.ticket_id).single();
  const short = m.body.length > 120 ? m.body.slice(0, 117) + "…" : m.body;
  if (m.author_role === "admin" || m.author_role === "system") {
    return [{ key: `sup:${m.id}`, to: [t.created_by], title: "Food Porter support", body: short, url: `/support/?id=${t.id}`, tag: `fp-sup-${t.id}`, ttl: 86400, urgency: "normal" }];
  }
  const { data: admins } = await db.from("profiles").select("id").eq("role", "admin").eq("is_test", t.is_test);
  const sos = t.priority === "urgent";
  return [{ key: `sup:${m.id}`, to: (admins ?? []).map((a) => a.id), title: `${sos ? "🚨 " : ""}[${t.priority}] ${t.subject}`, body: short, url: `/admin/support/?id=${t.id}`, tag: `fp-sup-${t.id}`, ttl: sos ? 600 : 3600, urgency: sos ? "high" : "normal" }];
}

// Order chat: push the new message to the other party of that channel (never to the author).
async function chatEvents(messageId: number): Promise<Push[]> {
  const { data: m } = await db.from("order_messages").select("id, order_id, channel, author_id, author_role, body").eq("id", messageId).maybeSingle();
  if (!m) return [];
  const { data: o } = await db.from("orders").select("id, customer_id, rider_id, restaurant_id, restaurants(name)").eq("id", m.order_id).single();
  const short = m.body.length > 120 ? m.body.slice(0, 117) + "…" : m.body;
  let to: string[] = [], url = `/order/?id=${o.id}`, who = "";
  if (m.author_role === "customer") {
    if (m.channel === "rider") { to = o.rider_id ? [o.rider_id] : []; url = "/rider/"; }
    else { const { data: staff } = await db.from("profiles").select("id").eq("restaurant_id", o.restaurant_id).eq("role", "restaurant"); to = (staff ?? []).map((s) => s.id); url = "/restaurant/"; }
    who = "Klant";
  } else {
    to = [o.customer_id];
    who = m.author_role === "rider" ? "Je bezorger" : ((o.restaurants as unknown as { name?: string } | null)?.name ?? "Het restaurant");
  }
  to = to.filter((id) => id && id !== m.author_id);
  return [{ key: `chat:${o.id}:${m.id}`, to, title: `💬 ${who} · #${o.id}`, body: short, url, tag: `fp-chat-${o.id}-${m.channel}`, ttl: 900, urgency: "high" }];
}

async function send(p: Push) {
  const oid = p.key.startsWith("sup:") ? null : Number(p.key.split(":")[1]) || null;
  const { error: dup } = await db.from("push_log").insert({ event_key: p.key, order_id: oid });
  if (dup) return { key: p.key, skipped: "already sent" };
  if (p.to.length === 0) return { key: p.key, recipients: 0 };
  const { data: subs } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth, fail_count").in("profile_id", p.to);
  let sent = 0, pruned = 0;
  const payload = JSON.stringify({ title: p.title, body: p.body, url: p.url, tag: p.tag, beep: true });
  await Promise.all((subs ?? []).map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: p.ttl, urgency: p.urgency, timeout: 8000 });
      sent++; await db.from("push_subscriptions").update({ last_ok_at: new Date().toISOString(), fail_count: 0 }).eq("id", s.id);
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode ?? 0;
      if (code === 404 || code === 410 || s.fail_count >= 4) { pruned++; await db.from("push_subscriptions").delete().eq("id", s.id); }
      else await db.from("push_subscriptions").update({ fail_count: s.fail_count + 1 }).eq("id", s.id);
    }
  }));
  await db.from("push_log").update({ recipients: (subs ?? []).length, sent, pruned }).eq("event_key", p.key);
  return { key: p.key, recipients: (subs ?? []).length, sent, pruned };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  let id = 0, hint: string | undefined, sup = 0, chat = 0;
  try { const b = await req.json(); id = Number(b.order_id); sup = Number(b.support_message_id); chat = Number(b.chat_message_id); hint = typeof b.status === "string" ? b.status : undefined; } catch { /* ignore */ }
  if (Number.isInteger(sup) && sup > 0) {
    await vapid();
    const results = [];
    for (const p of await supportEvents(sup)) results.push(await send(p));
    return json({ ok: true, results });
  }
  if (Number.isInteger(chat) && chat > 0) {
    await vapid();
    const results = [];
    for (const p of await chatEvents(chat)) results.push(await send(p));
    return json({ ok: true, results });
  }
  if (!Number.isInteger(id) || id <= 0) return json({ error: "order_id required" }, 400);
  await vapid();
  const results = [];
  for (const p of await events(id, hint)) results.push(await send(p));
  return json({ ok: true, results });
});
