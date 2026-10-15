// Sends customer SMS for: rider assigned, on the way, delivered; pickup orders: ready to collect (v17 P5).
// Called by a DB trigger (pg_net) with { order_id, status }. The body is only a hint:
// we re-read the order with the service role, require the status to match, and dedupe via orders.sms_sent.
// Provider is pluggable (SMS_PROVIDER = "twilio" | "bird"); without secrets it logs and does nothing.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type Status = "assigned" | "picked_up" | "delivered" | "ready";
const env = (k: string) => Deno.env.get(k)?.trim() || undefined;

function message(status: Status, id: number, eta?: number, rider?: string, pickup = false, rest = "the restaurant") {
  if (status === "ready") return `Food Porter: order #${id} is ready for pickup at ${rest}. Show your order number at the counter.`;
  if (status === "delivered" && pickup) return `Food Porter: order #${id} collected. Enjoy your meal!`;
  if (status === "assigned") return `Food Porter: ${rider ?? "A rider"} is on your order #${id}. Estimated delivery in ~${eta ?? "?"} min.`;
  if (status === "picked_up") return `Food Porter: your order #${id} is on the way! 🛵`;
  return `Food Porter: order #${id} delivered. Enjoy your meal!`;
}

/** E.164 for Dutch numbers: 06... -> +316... */
function normalizePhone(raw: string) {
  const p = raw.replace(/[\s()-]/g, "");
  if (p.startsWith("+")) return p;
  if (p.startsWith("00")) return "+" + p.slice(2);
  if (p.startsWith("0")) return "+31" + p.slice(1);
  return p;
}

async function sendTwilio(to: string, body: string) {
  const sid = env("TWILIO_ACCOUNT_SID"), token = env("TWILIO_AUTH_TOKEN"), from = env("TWILIO_FROM");
  if (!sid || !token || !from) return { skipped: "twilio secrets missing" };
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: "Basic " + btoa(`${sid}:${token}`), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  });
  return res.ok ? { ok: true } : { error: `twilio ${res.status}: ${(await res.text()).slice(0, 200)}` };
}

async function sendBird(to: string, body: string) {
  const key = env("BIRD_ACCESS_KEY"), ws = env("BIRD_WORKSPACE_ID"), ch = env("BIRD_CHANNEL_ID");
  if (!key || !ws || !ch) return { skipped: "bird secrets missing" };
  const res = await fetch(`https://api.bird.com/workspaces/${ws}/channels/${ch}/messages`, {
    method: "POST",
    headers: { Authorization: `AccessKey ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ receiver: { contacts: [{ identifierValue: to }] }, body: { type: "text", text: { text: body } } }),
  });
  return res.ok ? { ok: true } : { error: `bird ${res.status}: ${(await res.text()).slice(0, 200)}` };
}

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  let orderId: number, status: Status;
  try { const b = await req.json(); orderId = Number(b.order_id); status = b.status; } catch { return json({ error: "bad request" }, 400); }
  if (!Number.isInteger(orderId) || !["assigned", "picked_up", "delivered", "ready"].includes(status)) return json({ ignored: true });

  const provider = env("SMS_PROVIDER");
  if (!provider) { console.log(`order-sms disabled (no SMS_PROVIDER); order ${orderId} ${status}`); return json({ disabled: true }); }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: o } = await admin.from("orders").select("id, status, phone, sms_sent, fulfilment, restaurants(name), bids(eta_minutes, rider_name, accepted)").eq("id", orderId).maybeSingle();
  if (!o || o.status !== status) return json({ ignored: "status mismatch" });
  if ((o.sms_sent ?? []).includes(status)) return json({ ignored: "already sent" });
  const pickup = o.fulfilment === "pickup";
  if (status === "ready" && !pickup) return json({ ignored: "ready SMS is for pickup orders only" });

  // Claim this notification first (dedupe even if two calls race)
  const { data: claimed } = await admin.from("orders").update({ sms_sent: [...(o.sms_sent ?? []), status] })
    .eq("id", orderId).eq("sms_sent", `{${(o.sms_sent ?? []).join(",")}}`).select("id");
  if (!claimed?.length) return json({ ignored: "raced" });

  const bid = (o.bids as { eta_minutes: number; rider_name: string | null; accepted: boolean }[] ?? []).find((b) => b.accepted);
  const to = normalizePhone(o.phone);
  const text = message(status, o.id, bid?.eta_minutes, bid?.rider_name ?? undefined, pickup, (o.restaurants as unknown as { name?: string } | null)?.name ?? undefined);
  const result = provider === "twilio" ? await sendTwilio(to, text) : provider === "bird" ? await sendBird(to, text) : { skipped: `unknown provider ${provider}` };
  console.log(`order-sms order ${orderId} ${status}:`, JSON.stringify(result));
  if (!("ok" in result)) {
    // Release the claim so a later retry can send it
    await admin.from("orders").update({ sms_sent: o.sms_sent ?? [] }).eq("id", orderId);
  }
  return json(result);
});
