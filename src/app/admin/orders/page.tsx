"use client";
import { AdminOrderContact } from "@/components/OrderChat";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ErrorNote, Field, inputCls, Panel, RangePicker, SmallBtn, StatusBadge, Table, Td } from "@/components/admin";
import { downloadCsv, fmtDateTime, preset, sb, toIso, useAdminQuery, type Range, type Row } from "@/lib/admin";
import { eur } from "@/lib/format";
import { act } from "@/lib/act";
import { ORDER_COLS } from "@/lib/orders";
import { STATUS_LABEL, type OrderStatus } from "@/lib/types";

const STATUSES: OrderStatus[] = ["awaiting_payment", "payment_failed", "placed", "accepted", "assigned", "ready", "picked_up", "delivered", "cancelled"];

function OrderDetail({ id }: { id: string }) {
  const router = useRouter();
  const q = useAdminQuery<{ o: Row; events: Row[]; incidents: Row[] }>(async () => {
    const c = sb();
    const [o, ph, f, ev, inc] = await Promise.all([
      c.from("orders").select(`${ORDER_COLS}, order_items(*), bids(*), restaurants(name)`).eq("id", Number(id)).maybeSingle(),
      c.rpc("order_phone", { p_order: Number(id) }),
      c.from("order_facts").select("*").eq("id", Number(id)).maybeSingle(),
      c.from("audit_events").select("*").eq("order_id", Number(id)).order("created_at"),
      c.from("incidents").select("*").eq("order_id", Number(id)),
    ]);
    if (!o.data) return { data: null, error: o.error ?? { message: `Order #${id} not found` } };
    const cust = await c.from("profiles").select("email, full_name, status").eq("id", String(o.data.customer_id)).maybeSingle();
    return { data: { o: { ...o.data, ...(f.data ?? {}), phone: ph.data ?? "", customer: cust.data }, events: ev.data ?? [], incidents: inc.data ?? [] }, error: null };
  }, [id]);
  const o = q.data?.o;
  async function cancelOrder(oid: string, paid: boolean) {
    if (!confirm(`Cancel order #${oid}?${paid ? " The customer is refunded in full via Mollie." : ""}`)) return;
    const ok = await act((async () => { const { error } = await sb().from("orders").update({ status: "cancelled", cancel_reason: "admin_cancelled" }).eq("id", Number(oid)); if (error) throw new Error(error.message); return true; })(), paid ? "Cancelled · refund started" : "Cancelled");
    if (ok) setTimeout(q.reload, 2500);
  }
  async function retryRefund(oid: string) {
    if (!confirm(`Retry the refund for order #${oid} via Mollie?`)) return;
    const ok = await act((async () => {
      const { error } = await sb().from("orders").update({ refund_status: null }).eq("id", Number(oid));
      if (error) throw new Error(error.message);
      const r = await sb().functions.invoke("order-refund", { body: { order_id: Number(oid) } });
      if (r.error) throw new Error(r.error.message);
      return true;
    })(), "Refund retried");
    if (ok) q.reload();
  }
  return (
    <>
      <button className="no-print mb-3 text-sm text-muted" onClick={() => router.push("/admin/orders")}>← All orders</button>
      <ErrorNote error={q.error} />
      {o && (
        <div className="grid gap-4 md:grid-cols-2">
          <Panel title={<>Order #{String(o.id)} <StatusBadge s={String(o.status)} /></>} actions={<>
            {!["delivered", "cancelled"].includes(String(o.status)) && <SmallBtn tone="danger" onClick={() => cancelOrder(String(o.id), Boolean(o.paid_at))}>Cancel{o.paid_at ? " & refund" : ""}</SmallBtn>}
            {o.refund_status === "failed" && <SmallBtn tone="brand" onClick={() => retryRefund(String(o.id))}>Retry refund</SmallBtn>}
            <SmallBtn onClick={() => window.print()}>Print</SmallBtn></>}>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted">Restaurant</dt><dd>{String((o.restaurants as Row)?.name ?? "")}</dd>
              <dt className="text-muted">Customer</dt><dd>{String((o.customer as Row)?.email ?? o.customer_id)}</dd>
              <dt className="text-muted">Address</dt><dd>{String(o.address)}</dd>
              <dt className="text-muted">Phone</dt><dd>{String(o.phone)}</dd>
              <dt className="text-muted">Food / fee</dt><dd>{eur(Number(o.subtotal_cents))} + {eur(Number(o.delivery_fee_cents))}</dd>
              <dt className="text-muted">Commission</dt><dd>{eur(Number(o.commission_cents ?? 0))} ({String(o.commission_pct ?? "")}%)</dd>
              <dt className="text-muted">Payment</dt><dd>{String(o.payment_status ?? "—")} {o.mollie_payment_id ? `· ${o.mollie_payment_id}` : ""}</dd>
              <dt className="text-muted">Prep</dt><dd>{o.prep_minutes ? `${o.prep_minutes} min planned` : "—"}{o.actual_prep_minutes != null ? ` · ${o.actual_prep_minutes} min actual` : ""}{Number(o.prep_extensions) ? ` · extended ${o.prep_extensions}×` : ""}</dd>
              <dt className="text-muted">Rider bid</dt><dd>{o.bid_at ? `${o.rider_name ?? "rider"} · ETA ${o.eta_minutes} min · after ${o.bid_seconds}s` : "—"}</dd>
              <dt className="text-muted">Distance</dt><dd>{o.distance_km != null ? `${Number(o.distance_km).toFixed(1)} km from centre` : "—"}</dd>
              {o.status === "cancelled" && <><dt className="text-muted">Cancelled</dt><dd>{String(o.cancel_reason ?? "")} · {fmtDateTime(o.cancelled_at)}</dd>
                <dt className="text-muted">Refund</dt><dd data-testid="admin-refund">{o.refund_status === "simulated" ? "🧪 simulated test payment, nothing charged (auto-closed)" : o.refund_status ? `${o.refund_status}${o.refund_cents ? ` · ${eur(Number(o.refund_cents))}` : ""}${o.refund_id ? ` · ${o.refund_id}` : ""}` : o.paid_at ? "starting…" : "not paid, nothing to refund"}</dd></>}
              {o.food_stars != null && <><dt className="text-muted">Rating</dt><dd>food {"★".repeat(Number(o.food_stars))}{o.rider_stars ? ` · delivery ${"★".repeat(Number(o.rider_stars))}` : ""}</dd></>}
              <dt className="text-muted">Result</dt><dd>{o.delivered_at ? (o.on_time ? "on time" : `⏰ ${o.minutes_late} min late`) : "—"}{o.fast_bid ? " · fast bid" : ""}</dd>
            </dl>
            <h3 className="mt-3 text-sm font-bold">Items</h3>
            <ul className="text-sm">{((o.order_items as Row[]) ?? []).map((l) => <li key={String(l.id)}>{String(l.qty)}× {String(l.name)} · {eur(Number(l.price_cents) * Number(l.qty))}</li>)}</ul>
          </Panel>
          <Panel title="Customer contact"><AdminOrderContact orderId={Number(o.id)} /></Panel>
          <Panel title="Timeline">
            <ol className="relative ml-2 border-l-2 border-[#eee] pl-4 text-sm">
              {q.data!.events.map((e) => (
                <li key={String(e.id)} className="mb-2">
                  <span className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full bg-brand" />
                  <b>{e.type === "status_change" ? STATUS_LABEL[e.to_value as OrderStatus] ?? String(e.to_value) : e.type === "prep_set" ? `Prep set to ${e.to_value} min` : `Prep ${e.from_value} → ${e.to_value} min`}</b>
                  <div className="text-xs text-muted">{fmtDateTime(e.created_at)}</div>
                </li>
              ))}
            </ol>
            {q.data!.incidents.length > 0 && <p className="mt-2 text-sm">{q.data!.incidents.length} incident(s) linked</p>}
            <Link className="no-print mt-2 inline-block text-sm font-semibold text-brand" href={`/admin/reports?tab=safety&order=${o.id}`}>+ Log incident for this order</Link>
          </Panel>
        </div>
      )}
    </>
  );
}

function OrderList() {
  const [range, setRange] = useState<Range>(preset("30d"));
  const [status, setStatus] = useState("");
  const [restaurant, setRestaurant] = useState("");
  const [rider, setRider] = useState("");
  const [search, setSearch] = useState("");
  const [hideTest, setHideTest] = useState(false);
  const rest = useAdminQuery<Row[]>(async () => sb().from("restaurants").select("id, name").order("name"), []);
  const riders = useAdminQuery<Row[]>(async () => sb().from("profiles").select("id, full_name, email").in("role", ["rider", "admin"]), []);
  const q = useAdminQuery<Row[]>(async () => {
    const { p_from, p_to } = toIso(range);
    let x = sb().from("order_facts").select("*").gte("created_at", p_from).lt("created_at", p_to).order("id", { ascending: false }).limit(500);
    if (status) x = x.eq("status", status);
    if (restaurant) x = x.eq("restaurant_id", restaurant);
    if (rider) x = x.eq("rider_id", rider);
    if (hideTest) x = x.eq("is_test", false);
    if (/^\d+$/.test(search.trim())) x = x.eq("id", Number(search.trim()));
    return x;
  }, [range.from, range.to, status, restaurant, rider, hideTest, search]);
  const rows = q.data ?? [];
  return (
    <Panel title={`Orders (${rows.length})`} actions={<>
      <SmallBtn onClick={() => downloadCsv(`orders_${range.from}_${range.to}.csv`, rows, ["id", "created_at", "status", "restaurant_name", "rider_name", "subtotal_cents", "delivery_fee_cents", "commission_cents", "prep_minutes", "actual_prep_minutes", "prep_extensions", "bid_seconds", "eta_minutes", "fast_bid", "on_time", "minutes_late", "delivered_at", "is_test"])}>⬇ CSV</SmallBtn>
      <SmallBtn onClick={() => window.print()}>Print</SmallBtn></>}>
      <div className="no-print mb-3 grid gap-2 md:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
        <RangePicker value={range} onChange={setRange} />
        <Field label="Status"><select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option>{STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select></Field>
        <Field label="Restaurant"><select className={inputCls} value={restaurant} onChange={(e) => setRestaurant(e.target.value)}><option value="">All</option>{(rest.data ?? []).map((r) => <option key={String(r.id)} value={String(r.id)}>{String(r.name)}</option>)}</select></Field>
        <Field label="Rider"><select className={inputCls} value={rider} onChange={(e) => setRider(e.target.value)}><option value="">All</option>{(riders.data ?? []).map((r) => <option key={String(r.id)} value={String(r.id)}>{String(r.full_name ?? r.email)}</option>)}</select></Field>
        <Field label="Order #"><input className={inputCls} inputMode="numeric" placeholder="e.g. 1046" value={search} onChange={(e) => setSearch(e.target.value)} /></Field>
      </div>
      <label className="no-print mb-2 flex items-center gap-2 text-sm text-muted"><input type="checkbox" data-testid="include-test" checked={!hideTest} onChange={(e) => setHideTest(!e.target.checked)} /> Include test orders 🧪</label>
      <ErrorNote error={q.error} />
      <Table head={["#", "Created", "Restaurant", "Rider", "Food", "Prep", "Bid", "Result", "Status"]} empty={!q.loading && rows.length === 0}>
        {rows.map((o) => (
          <tr key={String(o.id)}>
            <Td><Link className="font-semibold text-brand" href={`/admin/orders?id=${o.id}`}>#{String(o.id)}</Link>{o.is_test ? " 🧪" : ""}</Td>
            <Td>{fmtDateTime(o.created_at)}</Td>
            <Td>{String(o.restaurant_name ?? "")}</Td>
            <Td>{String(o.rider_name ?? "—")}</Td>
            <Td>{eur(Number(o.subtotal_cents))}</Td>
            <Td>{o.prep_minutes ? `${o.prep_minutes}′${Number(o.prep_extensions) ? ` (+${o.prep_extensions})` : ""}` : "—"}</Td>
            <Td>{o.bid_seconds != null ? `${o.bid_seconds}s${o.fast_bid ? " · fast" : ""}` : "—"}</Td>
            <Td>{o.delivered_at ? (o.on_time ? <span className="font-semibold text-ok">On time</span> : <span className="font-semibold text-danger">+{String(o.minutes_late)} min</span>) : "—"}</Td>
            <Td><StatusBadge s={String(o.status)} /></Td>
          </tr>
        ))}
      </Table>
    </Panel>
  );
}

function Orders() {
  const id = useSearchParams().get("id");
  return id ? <OrderDetail id={id} /> : <OrderList />;
}

export default function OrdersPage() {
  return <Suspense fallback={<p className="text-muted">Loading…</p>}><Orders /></Suspense>;
}
