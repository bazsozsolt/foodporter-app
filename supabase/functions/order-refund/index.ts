// Refunds a cancelled, paid order in full via the Mollie Refunds API.
// Called by a DB trigger (pg_net) with { order_id }. The body is only a hint: we atomically claim the refund
// (status must be 'cancelled', paid, not yet refunded), so spoofed or repeated calls cannot refund anything else.
// Support refunds: POST { ticket_id, amount_cents } with an ADMIN's JWT refunds part (or all) of a paid order.
// The ticket's refund is claimed atomically, the amount is capped at what is still refundable at Mollie, and
// simulated test payments (tr_sim_*) are closed as 'simulated' without calling Mollie.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ORIGINS = ["https://bazsozsolt.github.io", "http://localhost:3000", "http://localhost:8787"];
const corsFor = (req: Request) => {
  const o = req.headers.get("Origin") ?? "";
  return { "Access-Control-Allow-Origin": ORIGINS.includes(o) ? o : ORIGINS[0], "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", Vary: "Origin" };
};
let CORS: Record<string, string> = {};
const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });

// deno-lint-ignore no-explicit-any
async function supportRefund(req: Request, db: any, mollieKey: string, ticketId: number, amount: number) {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u } = await db.auth.getUser(token);
  const { data: me } = u?.user ? await db.from("profiles").select("id, role").eq("id", u.user.id).single() : { data: null };
  if (me?.role !== "admin") return ok({ error: "admin only" }, 403);
  if (!Number.isInteger(ticketId) || !Number.isInteger(amount) || amount <= 0) return ok({ error: "ticket_id and amount_cents required" }, 400);
  const { data: t } = await db.from("support_tickets").update({ refund_status: "processing" }).eq("id", ticketId)
    .or("refund_status.is.null,refund_status.eq.requested,refund_status.eq.failed").select("id, order_id").maybeSingle();
  if (!t?.order_id) return ok({ error: "ticket has no order or a refund is already in progress/done" }, 409);
  const { data: o } = await db.from("orders").select("id, mollie_payment_id, paid_at, is_test, subtotal_cents, delivery_fee_cents, service_fee_cents, tip_cents, discount_cents, credit_cents").eq("id", t.order_id).single();
  const note = async (status: string, cents: number | null, refundId: string | null, msg: string) => {
    await db.from("support_tickets").update({ refund_status: status, refund_cents: cents, refund_id: refundId }).eq("id", ticketId);
    await db.from("support_messages").insert({ ticket_id: ticketId, author_role: "system", body: msg });
    await db.from("audit_events").insert({ order_id: o.id, type: "support_refund", from_value: String(ticketId), to_value: `${status} ${cents ?? 0}`, actor: me.id });
  };
  if (!o?.paid_at || !o.mollie_payment_id) { await note("failed", null, null, "Terugbetaling niet mogelijk: deze bestelling is niet betaald."); return ok({ error: "order not paid" }, 400); }
  const eur = (c: number) => `€${(c / 100).toFixed(2).replace(".", ",")}`;
  if (o.is_test && String(o.mollie_payment_id).startsWith("tr_sim_")) {
    // cap at what the customer actually paid (incl. service fee + tip, minus discount/credit) minus earlier refunds
    const paid = (o.subtotal_cents ?? 0) + (o.delivery_fee_cents ?? 0) + (o.service_fee_cents ?? 0) + (o.tip_cents ?? 0) - (o.discount_cents ?? 0) - (o.credit_cents ?? 0);
    const { data: prev } = await db.from("support_tickets").select("refund_cents").eq("order_id", o.id).neq("id", ticketId).in("refund_status", ["simulated", "pending", "processing", "refunded"]);
    const c = Math.max(0, Math.min(amount, paid - (prev ?? []).reduce((a: number, x: { refund_cents: number | null }) => a + (x.refund_cents ?? 0), 0)));
    if (c <= 0) { await note("none", 0, null, "Er valt niets meer terug te betalen voor deze bestelling."); return ok({ skipped: "nothing remaining" }); }
    await note("simulated", c, null, `Terugbetaling van ${eur(c)} goedgekeurd (testbestelling, er is niets afgeschreven).`);
    return ok({ status: "simulated", cents: c });
  }
  const h = { Authorization: `Bearer ${mollieKey}`, "Content-Type": "application/json" };
  const pr = await fetch(`https://api.mollie.com/v2/payments/${o.mollie_payment_id}`, { headers: h });
  if (!pr.ok) { await note("failed", null, null, "Terugbetaling mislukt, ons team pakt dit handmatig op."); return ok({ error: `could not load payment (${pr.status})` }, 502); }
  const p = await pr.json();
  const remaining = Math.round(Number((p.amountRemaining ?? p.amount)?.value ?? 0) * 100);
  const cents = Math.min(amount, remaining);
  if (cents <= 0) { await note("none", 0, null, "Er valt niets meer terug te betalen voor deze bestelling."); return ok({ skipped: "nothing remaining" }); }
  const rr = await fetch(`https://api.mollie.com/v2/payments/${o.mollie_payment_id}/refunds`, {
    method: "POST", headers: h,
    body: JSON.stringify({ amount: { currency: "EUR", value: (cents / 100).toFixed(2) }, description: `Food Porter support ticket #${ticketId} (order #${o.id})`, metadata: { order_id: o.id, ticket_id: ticketId } }),
  });
  const r = await rr.json();
  if (!rr.ok) { await note("failed", null, null, "Terugbetaling mislukt, ons team pakt dit handmatig op."); return ok({ error: `Mollie said ${r?.detail ?? rr.status}` }, 502); }
  await note(r.status, cents, r.id, `Terugbetaling van ${eur(cents)} is gestart. Je ziet het bedrag binnen 1–3 werkdagen terug.`);
  return ok({ refund: r.id, status: r.status, cents });
}

Deno.serve(async (req) => {
  CORS = corsFor(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const mollieKey = Deno.env.get("MOLLIE_API_KEY");
  if (!mollieKey) return new Response("not configured", { status: 503 });
  const body = await req.json().catch(() => ({}));
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  if (body?.ticket_id) return supportRefund(req, admin, mollieKey, Number(body.ticket_id), Number(body.amount_cents));
  const id = Number(body?.order_id);
  if (!Number.isInteger(id)) return ok({ skipped: "bad request" });

  const { data: o } = await admin.from("orders").update({ refund_status: "processing" })
    .eq("id", id).eq("status", "cancelled").not("paid_at", "is", null).not("mollie_payment_id", "is", null).is("refund_status", null)
    .select("id, mollie_payment_id, cancel_reason, is_test, subtotal_cents, delivery_fee_cents, service_fee_cents, tip_cents, discount_cents, credit_cents").maybeSingle();
  if (!o) return ok({ skipped: "nothing to refund" });
  if (o.is_test && String(o.mollie_payment_id).startsWith("tr_sim_")) {
    // simulated test payment: record the full paid amount as refunded without calling Mollie
    const cents = (o.subtotal_cents ?? 0) + (o.delivery_fee_cents ?? 0) + (o.service_fee_cents ?? 0) + (o.tip_cents ?? 0) - (o.discount_cents ?? 0) - (o.credit_cents ?? 0);
    await admin.from("orders").update({ refund_status: "simulated", refund_cents: cents, refunded_at: new Date().toISOString() }).eq("id", id);
    return ok({ status: "simulated", cents });
  }

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
