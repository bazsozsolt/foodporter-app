// Mollie calls this with form field id=tr_xxx. We never trust the body: we re-fetch the payment from Mollie.
// Idempotent: only moves orders out of the unpaid states.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const mollieKey = Deno.env.get("MOLLIE_API_KEY");
  if (!mollieKey) return new Response("not configured", { status: 503 });

  const form = await req.formData().catch(() => null);
  const id = String(form?.get("id") ?? "");
  if (!/^tr_[A-Za-z0-9]+$/.test(id)) return new Response("ok"); // ignore junk, don't leak info

  const res = await fetch(`https://api.mollie.com/v2/payments/${id}`, { headers: { Authorization: `Bearer ${mollieKey}` } });
  if (!res.ok) return new Response("ok");
  const p = await res.json();

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: order } = await admin.from("orders").select("id, status, mollie_payment_id")
    .eq("mollie_payment_id", id).maybeSingle();
  if (!order || String(p.metadata?.order_id) !== String(order.id)) return new Response("ok");

  const unpaid = order.status === "awaiting_payment" || order.status === "payment_failed";
  const patch: Record<string, unknown> = { payment_status: p.status };
  if (unpaid && p.status === "paid") { patch.status = "placed"; patch.paid_at = p.paidAt ?? new Date().toISOString(); }
  else if (unpaid && ["failed", "expired", "canceled"].includes(p.status)) patch.status = "payment_failed";

  await admin.from("orders").update(patch).eq("id", order.id);
  return new Response("ok");
});
