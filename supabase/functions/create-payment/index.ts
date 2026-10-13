// POST { order_id } with the customer's Supabase JWT -> { checkoutUrl }
// The amount is computed server-side from menu_items prices + the order's delivery fee.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const APP_URL = Deno.env.get("APP_URL") ?? "https://bazsozsolt.github.io/foodporter-app";

Deno.serve(async (req) => {
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
    .select("id, customer_id, status, delivery_fee_cents, mollie_payment_id, order_items(qty, menu_item_id)")
    .eq("id", orderId).maybeSingle();
  if (!order || order.customer_id !== user.id) return json({ error: "order not found" }, 404);
  if (order.status !== "awaiting_payment" && order.status !== "payment_failed") return json({ error: "order already paid" }, 409);

  // Recompute the amount from current menu prices (never trust client-sent prices)
  const items = (order.order_items ?? []) as { qty: number; menu_item_id: string }[];
  if (items.length === 0) return json({ error: "order has no items" }, 400);
  const { data: menu } = await admin.from("menu_items").select("id, price_cents, available").in("id", items.map((i) => i.menu_item_id));
  const price = new Map((menu ?? []).filter((m) => m.available).map((m) => [m.id, m.price_cents as number]));
  if (items.some((i) => !price.has(i.menu_item_id))) return json({ error: "an item is no longer available" }, 409);
  const subtotal = items.reduce((a, i) => a + i.qty * price.get(i.menu_item_id)!, 0);
  const fee = Math.min(350, Math.max(250, order.delivery_fee_cents));
  const total = subtotal + fee;

  const res = await fetch("https://api.mollie.com/v2/payments", {
    method: "POST",
    headers: { Authorization: `Bearer ${mollieKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: { currency: "EUR", value: (total / 100).toFixed(2) },
      description: `Food Porter order #${order.id}`,
      method: ["ideal", "creditcard"],
      redirectUrl: `${APP_URL}/orders/${order.id}/`,
      webhookUrl: `${url}/functions/v1/mollie-webhook`,
      metadata: { order_id: order.id },
    }),
  });
  const payment = await res.json();
  if (!res.ok) return json({ error: "Mollie error: " + (payment?.detail ?? res.status) }, 502);

  await admin.from("orders").update({
    mollie_payment_id: payment.id, payment_status: payment.status, subtotal_cents: subtotal,
    delivery_fee_cents: fee, status: "awaiting_payment",
  }).eq("id", order.id);

  return json({ checkoutUrl: payment._links?.checkout?.href, paymentId: payment.id, testmode: payment.mode === "test" });
});
