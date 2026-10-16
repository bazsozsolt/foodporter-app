// Mollie calls this with form field id=tr_xxx. We never trust the body: we re-fetch the payment from Mollie.
// Idempotent. Handles: normal payment, refund status sync, payment arriving after the order was cancelled
// (-> automatic full refund), and a second/old payment for an order that is already paid (-> refund that payment).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const mollieKey = Deno.env.get("MOLLIE_API_KEY");
  if (!mollieKey) return new Response("not configured", { status: 503 });

  const form = await req.formData().catch(() => null);
  const id = String(form?.get("id") ?? "");
  if (!/^tr_[A-Za-z0-9]+$/.test(id)) return new Response("ok"); // ignore junk, don't leak info

  const h = { Authorization: `Bearer ${mollieKey}`, "Content-Type": "application/json" };
  const res = await fetch(`https://api.mollie.com/v2/payments/${id}`, { headers: h });
  if (!res.ok) return new Response("ok");
  const p = await res.json();
  const orderId = Number(p.metadata?.order_id);
  if (!Number.isInteger(orderId)) return new Response("ok");

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: order } = await admin.from("orders").select("id, status, mollie_payment_id, refund_id, paid_at, subtotal_cents, delivery_fee_cents, service_fee_cents, tip_cents, discount_cents, credit_cents").eq("id", orderId).maybeSingle();
  if (!order) return new Response("ok");
  const unpaid = order.status === "awaiting_payment" || order.status === "payment_failed";
  // Defence in depth (v25 audit): only accept a payment whose amount matches the order total we computed.
  const expected = (order.subtotal_cents ?? 0) + (order.delivery_fee_cents ?? 0) + (order.service_fee_cents ?? 0) + (order.tip_cents ?? 0) - (order.discount_cents ?? 0) - (order.credit_cents ?? 0);
  const paidCents = Math.round(Number(p.amount?.value ?? 0) * 100);
  const amountOk = p.amount?.currency === "EUR" && paidCents === expected;
  if (unpaid && p.status === "paid" && !amountOk) {
    await admin.from("orders").update({ payment_status: "paid_amount_mismatch" }).eq("id", order.id);
    await admin.from("ops_alerts").insert({ kind: "other", order_id: order.id, message: `Payment ${id} is ${paidCents / 100} ${p.amount?.currency}, order total is ${expected / 100} EUR. Not released to the restaurant: check and refund in the Mollie dashboard.` });
    return new Response("ok");
  }

  // A payment that is not the order's current one (customer retried, or paid twice)
  if (order.mollie_payment_id !== id) {
    if (p.status !== "paid") return new Response("ok");
    if (unpaid) {
      // adopt it: the order is paid with this payment
      await admin.from("orders").update({ mollie_payment_id: id, payment_status: "paid", status: "placed", paid_at: p.paidAt ?? new Date().toISOString() }).eq("id", order.id);
      return new Response("ok");
    }
    // order already paid with another payment, or cancelled: refund this duplicate in full (idempotent via Mollie amountRemaining)
    const remaining = p.amountRemaining ?? p.amount;
    if (Number(remaining?.value ?? 0) > 0) {
      const rr = await fetch(`https://api.mollie.com/v2/payments/${id}/refunds`, {
        method: "POST", headers: h,
        body: JSON.stringify({ amount: remaining, description: `Food Porter order #${order.id}: duplicate payment refunded`, metadata: { order_id: order.id } }),
      });
      await admin.from("ops_alerts").insert({ kind: "late_payment", order_id: order.id,
        message: rr.ok ? `Duplicate payment ${id} refunded automatically (${remaining.value} EUR).` : `Duplicate payment ${id} could not be refunded automatically: refund it in the Mollie dashboard.` });
    }
    return new Response("ok");
  }

  const patch: Record<string, unknown> = { payment_status: p.status };
  let refundLate = false;
  if (unpaid && p.status === "paid") { patch.status = "placed"; patch.paid_at = p.paidAt ?? new Date().toISOString(); }
  else if (unpaid && ["failed", "expired", "canceled"].includes(p.status)) patch.status = "payment_failed";
  else if (order.status === "cancelled" && p.status === "paid" && !order.paid_at) {
    // Paid after the order was cancelled: record the payment and refund it in full
    patch.paid_at = p.paidAt ?? new Date().toISOString();
    refundLate = true;
  }

  // Refund status sync (Mollie calls the payment webhook when a refund changes)
  if (order.refund_id) {
    const rr = await fetch(`https://api.mollie.com/v2/payments/${id}/refunds/${order.refund_id}`, { headers: h });
    if (rr.ok) patch.refund_status = (await rr.json()).status;
  }
  await admin.from("orders").update(patch).eq("id", order.id);

  if (refundLate) {
    await admin.from("ops_alerts").insert({ kind: "late_payment", order_id: order.id, message: "Payment arrived after the order was cancelled: refunding automatically." });
    await fetch(`${url}/functions/v1/order-refund`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order_id: order.id }) });
  }
  return new Response("ok");
});
