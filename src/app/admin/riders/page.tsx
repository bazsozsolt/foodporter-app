"use client";
import Link from "next/link";
import { useState } from "react";
import { ErrorNote, Field, inputCls, Kpi, Panel, SmallBtn, StatusBadge, Table, Td } from "@/components/admin";
import { toast } from "@/components/Toaster";
import { act } from "@/lib/act";
import { fmtDateTime, sb, useAdminQuery, type Row } from "@/lib/admin";
import { eur } from "@/lib/format";

async function setStatus(id: string, status: string, reason?: string) {
  const { error } = await sb().from("profiles").update({ status, status_reason: reason ?? null }).eq("id", id);
  if (error) throw new Error(error.message);
  return true;
}

export default function RidersAdmin() {
  const q = useAdminQuery<{ riders: Row[]; facts: Row[]; earn: Row[] }>(async () => {
    const c = sb();
    const [r, f, e] = await Promise.all([
      c.from("profiles").select("*").order("created_at"),
      c.from("order_facts").select("rider_id, status, on_time, fast_bid, bid_seconds, delivered_at").not("rider_id", "is", null),
      c.from("earnings").select("rider_id, amount_cents, payout_id"),
    ]);
    const ids = new Set((e.data ?? []).map((x) => x.rider_id));
    return { data: { riders: (r.data ?? []).filter((p) => p.role === "rider" || ids.has(p.id)), facts: f.data ?? [], earn: e.data ?? [] }, error: r.error ?? f.error ?? e.error };
  }, []);
  const [email, setEmail] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const riders = q.data?.riders ?? [];
  const stats = (id: string) => {
    const f = (q.data?.facts ?? []).filter((x) => x.rider_id === id);
    const del = f.filter((x) => x.status === "delivered");
    const earn = (q.data?.earn ?? []).filter((x) => x.rider_id === id);
    return {
      deliveries: del.length,
      onTime: del.length ? Math.round((100 * del.filter((x) => x.on_time).length) / del.length) : null,
      avgBid: f.length ? Math.round(f.reduce((a, x) => a + Number(x.bid_seconds ?? 0), 0) / f.length) : null,
      unpaid: earn.filter((x) => !x.payout_id).reduce((a, x) => a + Number(x.amount_cents), 0),
      total: earn.reduce((a, x) => a + Number(x.amount_cents), 0),
      last: del.map((x) => String(x.delivered_at)).sort().pop(),
    };
  };
  async function invite() {
    const e = email.trim().toLowerCase();
    if (!e) return toast("Enter the rider's email first");
    const { data, error } = await sb().from("profiles").select("id, role").ilike("email", e).maybeSingle();
    if (error || !data) return toast("No account with that email. Ask the rider to sign up first.");
    if (data.role === "admin") return toast("That account is an admin");
    const { error: e2 } = await sb().from("profiles").update({ role: "rider", status: "pending" }).eq("id", data.id);
    if (e2) return toast(e2.message);
    toast("Added as rider (pending approval)"); setEmail(""); q.reload();
  }
  const count = (s: string) => riders.filter((r) => r.status === s).length;
  return (
    <>
      <div className="mb-4 grid grid-cols-3 gap-2.5"><Kpi label="Active riders" value={String(count("active"))} /><Kpi label="Pending approval" value={String(count("pending"))} /><Kpi label="Suspended" value={String(count("suspended"))} /></div>
      <Panel title="Riders">
        <ErrorNote error={q.error} />
        <div className="no-print mb-3 flex flex-wrap items-end gap-2">
          <Field label="Add rider by account email (they sign up first)"><input className={`${inputCls} min-w-64`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="rider@example.com" /></Field>
          <SmallBtn tone="dark" onClick={invite}>+ Add as rider</SmallBtn>
        </div>
        <Table head={["Rider", "Status", "Deliveries", "On time", "Avg bid", ""]} empty={!q.loading && riders.length === 0}>
          {riders.map((r) => {
            const s = stats(String(r.id));
            return (
              <tr key={String(r.id)}>
                <Td><button className="text-left font-semibold text-brand" onClick={() => setOpen(open === r.id ? null : String(r.id))}>{String(r.full_name ?? "—")}</button><div className="text-xs text-muted">{String(r.email ?? "")}</div>
                  {open === r.id && <div className="mt-2 text-xs text-muted">Joined {fmtDateTime(r.created_at)} · phone {String(r.phone ?? "—")} · IBAN {r.iban ? "on file" : "missing"} · total earned {eur(s.total)} · last delivery {fmtDateTime(s.last)}{r.status_reason ? ` · note: ${r.status_reason}` : ""}</div>}
                </Td>
                <Td><StatusBadge s={String(r.status)} /></Td>
                <Td>{s.deliveries}</Td>
                <Td>{s.onTime == null ? "—" : `${s.onTime}%`}</Td>
                <Td>{s.avgBid == null ? "—" : `${s.avgBid}s`}</Td>
                <Td className="whitespace-nowrap text-right">
                  {r.status !== "active" && <SmallBtn tone="ok" onClick={async () => { if (await act(setStatus(String(r.id), "active"), r.status === "pending" ? "Rider approved" : "Rider reactivated") !== undefined) q.reload(); }}>{r.status === "pending" ? "Approve" : "Reactivate"}</SmallBtn>}{" "}
                  {r.status !== "suspended" && r.role !== "admin" && <SmallBtn tone="danger" onClick={async () => { const why = prompt("Reason for suspension?") ?? undefined; if (why === undefined) return; if (await act(setStatus(String(r.id), "suspended", why), "Rider suspended") !== undefined) q.reload(); }}>Suspend</SmallBtn>}
                </Td>
              </tr>
            );
          })}
        </Table>
        <p className="mt-2 text-xs text-muted">Pending and suspended riders cannot bid (enforced in the database). Earnings and payouts: <Link className="font-semibold text-brand" href="/admin/payouts">Finance → Rider payouts</Link>.</p>
      </Panel>
    </>
  );
}
