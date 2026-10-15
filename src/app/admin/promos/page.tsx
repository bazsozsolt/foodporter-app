"use client";
// v17 P6: promo codes (admin only). Validation happens in the database (fp_quote_discount) and again in create-payment.
import { useState } from "react";
import { ErrorNote, Field, inputCls, Panel, SmallBtn, StatusBadge, Table, Td } from "@/components/admin";
import { act } from "@/lib/act";
import { sb, useAdminQuery, type Row } from "@/lib/admin";
import { eur } from "@/lib/format";

async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>) { const r = await p; if (r.error) throw new Error(r.error.message); return r.data; }

export default function PromosAdmin() {
  const q = useAdminQuery<Row[]>(async () => sb().from("promo_codes").select("*").order("created_at", { ascending: false }), []);
  const ref = useAdminQuery<Row[]>(async () => sb().from("customer_credit").select("reason, cents").in("reason", ["referral_friend", "used"]), []);
  const [f, setF] = useState({ code: "", kind: "percent", value: "10", min: "0", first: false, max: "", expires: "" });
  const set = (k: string, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  async function create() {
    const value = f.kind === "percent" ? Math.round(Number(f.value)) : Math.round(Number(f.value.replace(",", ".")) * 100);
    const payload = { code: f.code.trim().toUpperCase(), kind: f.kind, value, min_order_cents: Math.round(Number(f.min.replace(",", ".")) * 100) || 0,
      first_order_only: f.first, max_uses: f.max ? Number(f.max) : null, expires_at: f.expires ? new Date(`${f.expires}T23:59:00`).toISOString() : null };
    if (await act(must(sb().from("promo_codes").insert(payload)), `Code ${payload.code} created`) !== undefined) { setF({ ...f, code: "" }); q.reload(); }
  }
  const credits = (ref.data ?? []) as Row[];
  return (
    <>
      <Panel title="Promo codes">
        <ErrorNote error={q.error} />
        <p className="mb-3 text-xs text-muted">Discounts are funded by Food Porter: restaurant payouts and rider pay are not reduced. Percent 1–50%, fixed €0.50–€25. Codes are case-insensitive (A–Z, 0–9).</p>
        <div className="mb-4 grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-4" data-testid="promo-form">
          <Field label="Code"><input data-testid="promo-code" className={inputCls} value={f.code} onChange={(e) => set("code", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} placeholder="WELKOM" /></Field>
          <Field label="Type"><select className={inputCls} value={f.kind} onChange={(e) => set("kind", e.target.value)}><option value="percent">Percentage</option><option value="fixed">Fixed amount</option></select></Field>
          <Field label={f.kind === "percent" ? "Percent off" : "Amount off (€)"}><input data-testid="promo-value" className={inputCls} inputMode="decimal" value={f.value} onChange={(e) => set("value", e.target.value)} /></Field>
          <Field label="Minimum order (€, food)"><input className={inputCls} inputMode="decimal" value={f.min} onChange={(e) => set("min", e.target.value)} /></Field>
          <Field label="Max uses (empty = unlimited)"><input className={inputCls} inputMode="numeric" value={f.max} onChange={(e) => set("max", e.target.value)} /></Field>
          <Field label="Expires (last day)"><input type="date" className={inputCls} value={f.expires} onChange={(e) => set("expires", e.target.value)} /></Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={f.first} onChange={(e) => set("first", e.target.checked)} />First order only</label>
          <div className="self-end"><SmallBtn tone="brand" disabled={f.code.length < 3} onClick={create}>Create code</SmallBtn></div>
        </div>
        <Table head={["Code", "Discount", "Min order", "Rules", "Uses", "Expires", "Status", ""]} empty={(q.data ?? []).length === 0}>
          {(q.data ?? []).map((p) => (
            <tr key={String(p.code)} data-testid="promo-row">
              <Td className="font-mono font-bold">{String(p.code)}{p.is_test ? <span className="ml-1 text-[10px] font-normal text-muted">test</span> : null}</Td>
              <Td>{p.kind === "percent" ? `${p.value}%` : eur(Number(p.value))}</Td>
              <Td>{eur(Number(p.min_order_cents))}</Td>
              <Td>{p.first_order_only ? "first order" : "any order"}</Td>
              <Td>{String(p.uses)}{p.max_uses ? ` / ${p.max_uses}` : ""}</Td>
              <Td>{p.expires_at ? new Date(String(p.expires_at)).toLocaleDateString("en-GB") : "—"}</Td>
              <Td><StatusBadge s={p.active && !(p.expires_at && new Date(String(p.expires_at)) < new Date()) ? "active" : "suspended"} /></Td>
              <Td><SmallBtn onClick={async () => { if (await act(must(sb().from("promo_codes").update({ active: !p.active }).eq("code", String(p.code))), p.active ? "Code disabled" : "Code enabled") !== undefined) q.reload(); }}>{p.active ? "Disable" : "Enable"}</SmallBtn></Td>
            </tr>
          ))}
        </Table>
      </Panel>
      <Panel title="Referral programme">
        <p className="text-sm">Every customer has an invite code (shown on their Orders page). A new customer gets €5 off their first order; the friend who invited them gets €5 credit when that order is paid.</p>
        <p className="mt-2 text-sm" data-testid="referral-stats">Credit granted: <b>{eur(credits.filter((c) => c.reason === "referral_friend").reduce((a, c) => a + Number(c.cents), 0))}</b> · credit used: <b>{eur(-credits.filter((c) => c.reason === "used").reduce((a, c) => a + Number(c.cents), 0))}</b></p>
      </Panel>
    </>
  );
}
