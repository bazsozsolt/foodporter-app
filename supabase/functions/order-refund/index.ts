// Refunds a cancelled, paid order in full via the Mollie Refunds API.
// Called by a DB trigger (pg_net) with { order_id }. The body is only a hint: we atomically claim the refund
// (status must be 'cancelled', paid, not yet refunded), so spoofed or repeated calls cannot refund anything else.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ok = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const mollieKey = Deno.env.get("MOLLIE_API_KEY");
  if (!mollieKey) return new Response("not configured", { status: 503 });
  const id = Number((await req.json().catch(() => ({})))?.order_id);
  if (!Number.isInteger(id)) return ok({ skipped: "bad request" });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: o } = await admin.from("orders").update({ refund_status: "processing" })
    .eq("id", id).eq("status", "cancelled").not("paid_at", "is", null).not("mollie_payment_id", "is", null).is("refund_status", null)
    .select("id, mollie_payment_id, cancel_reason").maybeSingle();
  if (!o) return ok({ skipped: "nothing to refund" });

  const fail = async (detail: string) => {
    await admin.from("orders").update({ refund_status: "failed" }).eq("id", id);
    await admin.from("ops_alerts").insert({ kind: "refund_failed", order_id: id, message: `Automatic refund failed: ${detail}. Refund manually in the Mollie dashboard.` });
    return ok({ error: detail });
  };

  const h = { Authorization: `Bearer ${mollieKey}`, "Content-Type": "application/json" };
  const pr = await fetch(`https://api.mollie.com/v2/payments/${o.mollie_payment_id}`, { headers: h });
  if (!pr.ok) return fail(`could not load payment (${pr.status})`);
  const p = await pr.json();
  const remaining = p.amountRemaining ?? p.amount;
  if (!remaining || Number(remaining.value) <= 0) {
    await admin.from("orders").update({ refund_status: "none" }).eq("id", id);
    return ok({ skipped: "nothing remaining" });
  }
  const rr = await fetch(`https://api.mollie.com/v2/payments/${o.mollie_payment_id}/refunds`, {
    method: "POST", headers: h,
    body: JSON.stringify({ amount: remaining, description: `Food Porter order #${id} cancelled (${o.cancel_reason ?? "cancelled"})`, metadata: { order_id: id } }),
  });
  const r = await rr.json();
  if (!rr.ok) return fail(`Mollie said ${r?.detail ?? rr.status}`);
  await admin.from("orders").update({
    refund_id: r.id, refund_status: r.status, refund_cents: Math.round(Number(r.amount.value) * 100), refunded_at: new Date().toISOString(),
  }).eq("id", id);
  return ok({ refund: r.id, status: r.status });
});
