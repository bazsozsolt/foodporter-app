// POST { order_id } with the customer's Supabase JWT -> { checkoutUrl }
// The amount is computed server-side from menu_items prices + delivery fee + service fee; the minimum order is enforced here.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Only the app (and local test servers) may call this from a browser.
const ORIGINS = ["https://bazsozsolt.github.io", "http://localhost:3000", "http://localhost:8787"];
let cors: Record<string, string> = {
  "Access-Control-Allow-Origin": ORIGINS[0], Vary: "Origin",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function geocode(address: string) {
  const q = address.replace(/^FP TEST\s*[:\-–]?\s*/i, "").trim();
  if (q.length < 4) return null;
  const u = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?q=${encodeURIComponent(q)}&fq=type:adres&rows=1&fl=weergavenaam,centroide_ll`;
  try {
    const r = await fetch(u);
    if (!r.ok) return null;
    const d = (await r.json())?.response?.docs?.[0];
    const m = /POINT\(([\d.]+) ([\d.]+)\)/.exec(d?.centroide_ll ?? "");
    return m ? { lng: Number(m[1]), lat: Number(m[2]), label: String(d.weergavenaam) } : null;
  } catch { return null; }
}
function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const r = (x: number) => (x * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

const APP_URL = Deno.env.get("APP_URL") ?? "https://bazsozsolt.github.io/foodporter-app";

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin") ?? "";
  cors = { ...cors, "Access-Control-Allow-Origin": ORIGINS.includes(origin) ? origin : ORIGINS[0] };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const mollieKey = Deno.env.get("MOLLIE_API_KEY");
  if (!mollieKey) return json({ error: "Payments are not configured yet (MOLLIE_API_KEY secret missing)" }, 503);

  const url = Deno.env.get("SUPABASE_URL")!;
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "not signed in" }, 401);

  let orderId: number;
  try { orderId = Number((await req.json()).order_id); } catch { return json({ error: "bad request" }, 400); }
  if (!Number.isInteger(orderId)) return json({ error: "order_id required" }, 400);

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: order } = await admin.from("orders")
    .select("id, customer_id, restaurant_id, status, address, delivery_fee_cents, mollie_payment_id, order_items(qty, menu_item_id)")
    .eq("id", orderId).maybeSingle();
  if (!order || order.customer_id !== user.id) return json({ error: "order not found" }, 404);
  if (order.status !== "awaiting_payment" && order.status !== "payment_failed") return json({ error: "order already paid" }, 409);

  // Recompute the amount from current menu prices (never trust client-sent prices)
  const items = (order.order_items ?? []) as { qty: number; menu_item_id: string }[];
  if (items.length === 0) return json({ error: "order has no items" }, 400);
  if (items.some((i) => !Number.isInteger(i.qty) || i.qty < 1 || i.qty > 50) || items.length > 50) return json({ error: "invalid quantities" }, 400);
  const { data: menu } = await admin.from("menu_items").select("id, price_cents, available, restaurant_id").in("id", items.map((i) => i.menu_item_id));
  const price = new Map((menu ?? []).filter((m) => m.available && m.restaurant_id === order.restaurant_id).map((m) => [m.id, m.price_cents as number]));
  if (items.some((i) => !price.has(i.menu_item_id))) return json({ error: "an item is no longer available" }, 409);
  const subtotal = items.reduce((a, i) => a + i.qty * price.get(i.menu_item_id)!, 0);
  // Minimum order per restaurant (food subtotal, before fees)
  const { data: rest } = await admin.from("restaurants").select("min_order_cents").eq("id", order.restaurant_id).maybeSingle();
  const minOrder = Number(rest?.min_order_cents ?? 0);
  if (subtotal < minOrder) return json({ error: `Minimum order at this restaurant is €${(minOrder / 100).toFixed(2)} (food only).`, code: "min_order" }, 422);

  // Delivery zone: geocode the address server-side (PDOK Locatieserver, free NL geocoder) and check the radius.
  const { data: s } = await admin.from("settings").select("zone_radius_km, zone_center_lat, zone_center_lng, delivery_fee_cents, service_fee_cents").maybeSingle();
  const fee = Math.min(500, Math.max(0, Number(s?.delivery_fee_cents ?? order.delivery_fee_cents)));
  const geo = await geocode(String(order.address ?? ""));
  if (!geo) return json({ error: "We couldn't find that address. Please pick it from the suggestions (street + number, Tilburg)." }, 422);
  const radius = Number(s?.zone_radius_km ?? 3);
  const dist = distanceKm(Number(s?.zone_center_lat ?? 51.5576), Number(s?.zone_center_lng ?? 5.0913), geo.lat, geo.lng);
  await admin.from("orders").update({ lat: geo.lat, lng: geo.lng, distance_km: Math.round(dist * 100) / 100 }).eq("id", order.id);
  if (dist > radius) return json({ error: `Sorry, ${geo.label} is ${dist.toFixed(1)} km from the centre. During the pilot we deliver within ${radius} km of central Tilburg.` }, 422);
  const service = Math.min(300, Math.max(0, Number(s?.service_fee_cents ?? 0)));
  const total = subtotal + fee + service;
  if (total < 100 || total > 50000) return json({ error: "order total out of range" }, 400);

  const res = await fetch("https://api.mollie.com/v2/payments", {
    method: "POST",
    headers: { Authorization: `Bearer ${mollieKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: { currency: "EUR", value: (total / 100).toFixed(2) },
      description: `Food Porter order #${order.id}`,
      method: ["ideal", "creditcard"],
      redirectUrl: `${APP_URL}/order/?id=${order.id}`,
      webhookUrl: `${url}/functions/v1/mollie-webhook`,
      metadata: { order_id: order.id },
    }),
  });
  const payment = await res.json();
  if (!res.ok) return json({ error: "Mollie error: " + (payment?.detail ?? res.status) }, 502);

  await admin.from("orders").update({
    mollie_payment_id: payment.id, payment_status: payment.status, subtotal_cents: subtotal,
    delivery_fee_cents: fee, service_fee_cents: service, status: "awaiting_payment",
  }).eq("id", order.id);

  return json({ checkoutUrl: payment._links?.checkout?.href, paymentId: payment.id, testmode: payment.mode === "test" });
});
