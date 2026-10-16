"use client";
import Link from "next/link";
import { useEffect } from "react";
import { ErrorNote, Kpi, Panel, SmallBtn, StatusBadge, Table, Td } from "@/components/admin";
import { act } from "@/lib/act";
import { fmtDateTime, preset, sb, toIso, useAdminQuery, type Row } from "@/lib/admin";
import { eur } from "@/lib/format";

interface Overview { today: Row; month: Row; pay: { restaurants: Row[]; riders: Row[] }; incidents: number; pending: number; recent: Row[]; alerts: Row[]; todayRows: Row[] }

export default function AdminOverview() {
  const q = useAdminQuery<Overview>(async () => {
    const c = sb();
    const t = toIso(preset("today")), m = toIso(preset("30d"));
    const [today, month, pay, inc, pend, recent, alerts, todayRows] = await Promise.all([
      c.rpc("report_delivery", t), c.rpc("report_delivery", m), c.rpc("report_payments", m),
      c.from("incidents").select("id", { count: "exact", head: true }).eq("status", "open"),
      c.from("profiles").select("id", { count: "exact", head: true }).eq("role", "rider").eq("status", "pending"),
      c.from("order_facts").select("id, created_at, status, restaurant_name, subtotal_cents, is_test").order("id", { ascending: false }).limit(8),
      c.from("ops_alerts").select("*").is("resolved_at", null).order("created_at", { ascending: false }).limit(20),
      c.from("order_facts").select("id, status, on_time, minutes_late, created_at, delivered_at").gte("created_at", t.p_from).lt("created_at", t.p_to).limit(2000),
    ]);
    const error = today.error ?? month.error ?? pay.error ?? recent.error;
    return { data: error ? null : { today: today.data, month: month.data, pay: pay.data, incidents: inc.count ?? 0, pending: pend.count ?? 0, recent: recent.data ?? [], alerts: alerts.data ?? [], todayRows: todayRows.data ?? [] }, error };
  }, []);
  const d = q.data;
  const owedR = d?.pay.restaurants.reduce((a, r) => a + Number(r.owed_cents), 0) ?? 0;
  const owedD = d?.pay.riders.reduce((a, r) => a + Number(r.unpaid_cents), 0) ?? 0;
  const commission = d?.pay.restaurants.reduce((a, r) => a + Number(r.commission_cents), 0) ?? 0;
  const pct = (v: unknown) => (v == null ? "—" : `${v}%`);
  // Today's delivery health, straight from order_facts: late deliveries, cancellations and average door-to-door time.
  const tr = d?.todayRows ?? [];
  const deliv = tr.filter((o) => o.status === "delivered");
  const late = deliv.filter((o) => o.on_time === false);
  const cancelled = tr.filter((o) => o.status === "cancelled").length;
  const mins = deliv.filter((o) => o.delivered_at).map((o) => (new Date(String(o.delivered_at)).getTime() - new Date(String(o.created_at)).getTime()) / 60000);
  const avgMin = mins.length ? Math.round(mins.reduce((a, b) => a + b, 0) / mins.length) : null;
  const avgLate = late.length ? Math.round(late.reduce((a, o) => a + Number(o.minutes_late ?? 0), 0) / late.length) : null;
  useEffect(() => { const t = setInterval(q.reload, 30000); return () => clearInterval(t); }, [q.reload]);
  async function resolve(id: unknown) {
    const ok = await act((async () => { const { error } = await sb().from("ops_alerts").update({ resolved_at: new Date().toISOString() }).eq("id", Number(id)); if (error) throw new Error(error.message); return true; })(), "Alert resolved");
    if (ok) q.reload();
  }
  return (
    <>
      <ErrorNote error={q.error} />
      {(d?.alerts.length ?? 0) > 0 && (
        <Panel title={`Needs attention (${d!.alerts.length})`}>
          <ul className="divide-y divide-[#eee] text-sm">
            {d!.alerts.map((a) => (
              <li key={String(a.id)} className="flex items-center gap-2 py-2">
                <span className="flex-1"><b>{String(a.kind).replace(/_/g, " ")}</b>{a.order_id ? <> · <Link className="text-brand underline" href={`/admin/orders?id=${a.order_id}`}>#{String(a.order_id)}</Link></> : null} · {String(a.message)} <span className="text-xs text-muted">{fmtDateTime(a.created_at)}</span></span>
                <SmallBtn onClick={() => resolve(a.id)}>Resolve</SmallBtn>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <h2 className="mb-2 text-sm font-bold text-muted">Today</h2>
      <div className="mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <Kpi label="Paid orders" value={String(d?.today.orders ?? "…")} />
        <Kpi label="Delivered" value={String(d?.today.delivered ?? "…")} />
        <Kpi label="Key metric" value={pct(d?.today.pct_key_metric)} hint="bid ≤ 3 min AND on time" />
        <Kpi label="Avg time to bid" value={d?.today.avg_bid_seconds != null ? `${d.today.avg_bid_seconds}s` : "—"} />
      </div>
      <div className="mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-4" data-testid="today-health">
        <Kpi label="Late deliveries" value={d ? `${late.length}/${deliv.length}` : "…"} hint={avgLate != null ? `avg ${avgLate} min late` : "none late"} />
        <Kpi label="On time" value={pct(d?.today.pct_on_time)} />
        <Kpi label="Cancelled" value={d ? String(cancelled) : "…"} hint={tr.length ? `${Math.round((cancelled / tr.length) * 100)}% of ${tr.length} orders` : undefined} />
        <Kpi label="Avg order → door" value={avgMin != null ? `${avgMin} min` : "—"} />
      </div>
      <h2 className="mb-2 text-sm font-bold text-muted">Last 30 days</h2>
      <div className="mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <Kpi label="Key metric" value={pct(d?.month.pct_key_metric)} hint={`${d?.month.orders ?? 0} paid orders`} />
        <Kpi label="Bid within 3 min" value={pct(d?.month.pct_bid_3min)} />
        <Kpi label="On time" value={pct(d?.month.pct_on_time)} />
        <Kpi label="Commission earned" value={eur(commission)} />
        <Kpi label="Owed to restaurants" value={eur(owedR)} />
        <Kpi label="Owed to riders" value={eur(owedD)} />
        <Kpi label="Open incidents" value={String(d?.incidents ?? "…")} />
        <Kpi label="Riders awaiting approval" value={String(d?.pending ?? "…")} />
      </div>
      <Panel title="Latest orders" actions={<Link className="text-sm font-semibold text-brand" href="/admin/orders">All orders →</Link>}>
        <Table head={["#", "Created", "Restaurant", "Food", "Status"]} empty={d?.recent.length === 0}>
          {d?.recent.map((o) => (
            <tr key={String(o.id)}>
              <Td><Link className="font-semibold text-brand" href={`/admin/orders?id=${o.id}`}>#{String(o.id)}</Link>{o.is_test ? " 🧪" : ""}</Td>
              <Td>{fmtDateTime(o.created_at)}</Td><Td>{String(o.restaurant_name ?? "")}</Td><Td>{eur(Number(o.subtotal_cents))}</Td>
              <Td><StatusBadge s={String(o.status)} /></Td>
            </tr>
          ))}
        </Table>
      </Panel>
    </>
  );
}
