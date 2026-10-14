"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ErrorNote, Field, inputCls, Kpi, Panel, RangePicker, SmallBtn, StatusBadge, Table, Td } from "@/components/admin";
import { toast } from "@/components/Toaster";
import { act } from "@/lib/act";
import { downloadCsv, fmtDateTime, preset, sb, toIso, useAdminQuery, type Range, type Row } from "@/lib/admin";
import { eur } from "@/lib/format";

const TABS = [["delivery", "🚀 Delivery"], ["quality", "⭐ Quality"], ["safety", "🦺 Safety"], ["payments", "💶 Payments"]] as const;
type Tab = (typeof TABS)[number][0];
const pct = (v: unknown) => (v == null ? "—" : `${v}%`);

function useReport(name: string, range: Range) {
  return useAdminQuery<Row>(async () => sb().rpc(name, toIso(range)), [name, range.from, range.to]);
}

function Toolbar({ range, onCsv, title }: { range: Range; onCsv: () => void; title: string }) {
  return (
    <div className="flex gap-2">
      <SmallBtn onClick={onCsv}>⬇ CSV</SmallBtn>
      <SmallBtn onClick={() => { document.title = `Food Porter ${title} ${range.from}–${range.to}`; window.print(); }}>🖨 Print / PDF</SmallBtn>
    </div>
  );
}

function Delivery({ range }: { range: Range }) {
  const q = useReport("report_delivery", range);
  const d = q.data;
  const late = (d?.late as Row[]) ?? [];
  const summary = d ? [{ metric: "Paid orders", value: d.orders }, { metric: "Delivered", value: d.delivered }, { metric: "Orders with accepted bid", value: d.with_bid },
    { metric: "Avg time to accepted bid (s)", value: d.avg_bid_seconds }, { metric: "% bid within 3 min", value: d.pct_bid_3min }, { metric: "% on time", value: d.pct_on_time },
    { metric: "Key metric % (bid ≤3 min AND on time)", value: d.pct_key_metric }, { metric: "Avg prep planned (min)", value: d.avg_prep_planned }, { metric: "Avg prep actual (min)", value: d.avg_prep_actual }] : [];
  return (
    <Panel title={`Delivery report · ${range.from} → ${range.to}`} actions={<Toolbar range={range} title="delivery report" onCsv={() => downloadCsv(`delivery_${range.from}_${range.to}.csv`, [...summary, ...late.map((l) => ({ metric: `late #${l.id}`, value: l.minutes_late, restaurant: l.restaurant, rider: l.rider, eta: l.eta, delivered_at: l.delivered_at }))])} />}>
      <ErrorNote error={q.error} />
      <div className="mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <Kpi label="Paid orders" value={String(d?.orders ?? "…")} hint={`${d?.delivered ?? 0} delivered`} />
        <Kpi label="Avg time to accepted bid" value={d?.avg_bid_seconds != null ? `${d.avg_bid_seconds}s` : "—"} />
        <Kpi label="Bid within 3 min" value={pct(d?.pct_bid_3min)} />
        <Kpi label="On time" value={pct(d?.pct_on_time)} />
        <Kpi label="On time: stacked vs single" value={<span data-testid="stacked-ontime" className="text-base">{pct((d?.stacked as Row | undefined)?.stacked_pct_on_time)} vs {pct((d?.stacked as Row | undefined)?.single_pct_on_time)}</span>}
          hint={`${String((d?.stacked as Row | undefined)?.stacked_delivered ?? 0)} stacked / ${String((d?.stacked as Row | undefined)?.single_delivered ?? 0)} single · avg late ${String((d?.stacked as Row | undefined)?.stacked_avg_minutes_late ?? "—")} vs ${String((d?.stacked as Row | undefined)?.single_avg_minutes_late ?? "—")} min`} />
        <Kpi label="Key metric" value={pct(d?.pct_key_metric)} hint="bid ≤ 3 min AND on time" />
        <Kpi label="Prep planned vs actual" value={`${d?.avg_prep_planned ?? "—"} / ${d?.avg_prep_actual ?? "—"} min`} />
      </div>
      <h3 className="mb-2 text-sm font-bold">Late deliveries ({late.length})</h3>
      <Table head={["Order", "Restaurant", "Rider", "ETA", "Late by", "Delivered"]} empty={late.length === 0}>
        {late.map((l) => <tr key={String(l.id)}><Td><Link className="text-brand" href={`/admin/orders?id=${l.id}`}>#{String(l.id)}</Link></Td><Td>{String(l.restaurant ?? "")}</Td><Td>{String(l.rider ?? "")}</Td><Td>{String(l.eta)} min</Td><Td>{String(l.minutes_late)} min{l.stacked ? " 🧩" : ""}</Td><Td>{fmtDateTime(l.delivered_at)}</Td></tr>)}
      </Table>
    </Panel>
  );
}

function Quality({ range }: { range: Range }) {
  const q = useReport("report_quality", range);
  const d = q.data;
  const byR = ((d?.by_restaurant as Row[]) ?? []).filter((r) => Number(r.orders) > 0 || Number(r.cancelled ?? 0) > 0 || Number(r.incidents) > 0);
  const inc = (d?.incidents_by_type as Record<string, number>) ?? {};
  return (
    <Panel title={`Quality report · ${range.from} → ${range.to}`} actions={<Toolbar range={range} title="quality report" onCsv={() => downloadCsv(`quality_${range.from}_${range.to}.csv`, [
      { restaurant: "ALL", orders: d?.orders, cancelled: d?.cancelled, payment_failed: d?.payment_failed, awaiting_payment: d?.awaiting_payment, prep_extensions: d?.prep_extensions, extension_minutes: d?.extension_minutes, refunds: d?.refunds, refund_cents: d?.refund_cents, ratings: d?.ratings, rating: d?.avg_food_rating, rider_rating: d?.avg_rider_rating },
      ...byR])} />}>
      <ErrorNote error={q.error} />
      <div className="mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <Kpi label="Orders created" value={String(d?.orders ?? "…")} />
        <Kpi label="Cancelled" value={String(d?.cancelled ?? "…")} />
        <Kpi label="Payment failed" value={String(d?.payment_failed ?? "…")} hint={`${d?.awaiting_payment ?? 0} still unpaid`} />
        <Kpi label="Prep extensions" value={String(d?.prep_extensions ?? "…")} hint={`${d?.orders_extended ?? 0} orders · +${d?.extension_minutes ?? 0} min total`} />
        <Kpi label="Avg food rating" value={d?.avg_food_rating != null ? `★ ${Number(d.avg_food_rating).toFixed(1)}` : "—"} hint={`${d?.ratings ?? 0} ratings`} />
        <Kpi label="Rating: stacked vs single" value={<span data-testid="stacked-rating" className="text-base">★ {String((d?.stacked as Row | undefined)?.stacked_avg_food ?? "—")} vs {String((d?.stacked as Row | undefined)?.single_avg_food ?? "—")}</span>}
          hint={`food · rider ★ ${String((d?.stacked as Row | undefined)?.stacked_avg_rider ?? "—")} vs ${String((d?.stacked as Row | undefined)?.single_avg_rider ?? "—")} · ${String((d?.stacked as Row | undefined)?.stacked_ratings ?? 0)} / ${String((d?.stacked as Row | undefined)?.single_ratings ?? 0)} ratings`} />
        <Kpi label="Avg delivery rating" value={d?.avg_rider_rating != null ? `★ ${Number(d.avg_rider_rating).toFixed(1)}` : "—"} />
        <Kpi label="Refunds" value={String(d?.refunds ?? "…")} hint={`${eur(Number(d?.refund_cents ?? 0))}${Number(d?.refunds_failed) ? ` · ${d?.refunds_failed} failed` : ""}`} />
        <Kpi label="No-bid alerts" value={String(d?.no_bid_alerts ?? "…")} />
      </div>
      <p className="mb-3 text-sm"><b>Cancellation reasons:</b> {Object.keys((d?.cancel_reasons as Record<string, number>) ?? {}).length ? Object.entries(d!.cancel_reasons as Record<string, number>).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join(" · ") : "none"}</p>
      <h3 className="mb-2 text-sm font-bold">Incidents / complaints by type</h3>
      <p className="mb-3 text-sm">{Object.keys(inc).length ? Object.entries(inc).map(([k, v]) => `${k.replace("_", " ")}: ${v}`).join(" · ") : "None logged."}</p>
      <Table head={["Restaurant", "Paid orders", "Cancelled", "Prep extensions", "Incidents", "Food rating"]} empty={byR.length === 0}>
        {byR.map((r) => <tr key={String(r.restaurant)}><Td>{String(r.restaurant)}</Td><Td>{String(r.orders)}</Td><Td>{String(r.cancelled ?? 0)}</Td><Td>{String(r.extensions)}</Td><Td>{String(r.incidents)}</Td><Td>{r.rating != null ? `★ ${Number(r.rating).toFixed(1)} (${r.ratings})` : <span className="text-muted">no ratings</span>}</Td></tr>)}
      </Table>
    </Panel>
  );
}

const TYPES = ["accident", "harassment", "food_safety", "damaged_goods", "late_delivery", "complaint", "other"];

function Safety({ range }: { range: Range }) {
  const params = useSearchParams();
  const q = useReport("report_safety", range);
  const list = useAdminQuery<Row[]>(async () => {
    const { p_from, p_to } = toIso(range);
    return sb().from("incidents").select("*, restaurants(name), rider:profiles!incidents_rider_id_fkey(full_name, email)").gte("occurred_at", p_from).lt("occurred_at", p_to).order("occurred_at", { ascending: false });
  }, [range.from, range.to]);
  const people = useAdminQuery<Row[]>(async () => sb().from("profiles").select("id, full_name, email, role").in("role", ["rider", "admin"]), []);
  const rest = useAdminQuery<Row[]>(async () => sb().from("restaurants").select("id, name").order("name"), []);
  const [form, setForm] = useState({ type: "complaint", severity: "medium", order_id: params.get("order") ?? "", rider_id: "", restaurant_id: "", description: "" });
  const [show, setShow] = useState(Boolean(params.get("order")));
  async function save() {
    const p = { type: form.type, severity: form.severity, description: form.description || null, order_id: form.order_id ? Number(form.order_id) : null, rider_id: form.rider_id || null, restaurant_id: form.restaurant_id || null };
    const ok = await act((async () => { const { error } = await sb().from("incidents").insert(p); if (error) throw new Error(error.message); return true; })(), "Incident logged");
    if (ok !== undefined) { setShow(false); setForm({ ...form, description: "", order_id: "" }); list.reload(); q.reload(); }
  }
  async function resolve(id: string, status: string) {
    const ok = await act((async () => { const { error } = await sb().from("incidents").update({ status, resolved_at: status === "resolved" ? new Date().toISOString() : null }).eq("id", Number(id)); if (error) throw new Error(error.message); return true; })(), status === "resolved" ? "Resolved" : "Reopened");
    if (ok !== undefined) { list.reload(); q.reload(); }
  }
  const d = q.data;
  const rows = list.data ?? [];
  const sev = (d?.by_severity as Record<string, number>) ?? {};
  return (
    <Panel title={`Safety report · ${range.from} → ${range.to}`} actions={<>
      <SmallBtn tone="brand" onClick={() => setShow(!show)}>+ Log incident</SmallBtn>
      <Toolbar range={range} title="safety report" onCsv={() => downloadCsv(`incidents_${range.from}_${range.to}.csv`, rows.map((r) => ({ id: r.id, occurred_at: r.occurred_at, type: r.type, severity: r.severity, status: r.status, order_id: r.order_id, rider: (r.rider as Row)?.full_name ?? (r.rider as Row)?.email, restaurant: (r.restaurants as Row)?.name, description: r.description, resolved_at: r.resolved_at })))} /></>}>
      <ErrorNote error={q.error ?? list.error} />
      <div className="mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <Kpi label="Incidents" value={String(d?.incidents_total ?? "…")} hint={`${d?.incidents_open ?? 0} open`} />
        <Kpi label="By severity" value={<span className="text-base">{Object.keys(sev).length ? Object.entries(sev).map(([k, v]) => `${k} ${v}`).join(" · ") : "—"}</span>} />
        <Kpi label="Rider suspensions" value={String(d?.suspensions ?? "…")} hint={`${d?.currently_suspended_riders ?? 0} currently suspended`} />
        <Kpi label="Late-night deliveries" value={String(d?.late_night_deliveries ?? "…")} hint="22:00–06:00 NL time" />
      </div>
      {show && (
        <div className="no-print mb-4 grid gap-2 rounded-xl border-[1.5px] border-[#e2ded8] p-3 md:grid-cols-3">
          <Field label="Type"><select className={inputCls} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}</select></Field>
          <Field label="Severity"><select className={inputCls} value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>{["low", "medium", "high", "critical"].map((t) => <option key={t}>{t}</option>)}</select></Field>
          <Field label="Order # (optional)"><input className={inputCls} inputMode="numeric" value={form.order_id} onChange={(e) => setForm({ ...form, order_id: e.target.value })} /></Field>
          <Field label="Rider (optional)"><select className={inputCls} value={form.rider_id} onChange={(e) => setForm({ ...form, rider_id: e.target.value })}><option value="">—</option>{(people.data ?? []).map((p) => <option key={String(p.id)} value={String(p.id)}>{String(p.full_name ?? p.email)}</option>)}</select></Field>
          <Field label="Restaurant (optional)"><select className={inputCls} value={form.restaurant_id} onChange={(e) => setForm({ ...form, restaurant_id: e.target.value })}><option value="">—</option>{(rest.data ?? []).map((r) => <option key={String(r.id)} value={String(r.id)}>{String(r.name)}</option>)}</select></Field>
          <Field label="What happened?"><textarea className={inputCls} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <div className="md:col-span-3"><SmallBtn tone="brand" onClick={save}>Save incident</SmallBtn></div>
        </div>
      )}
      <Table head={["When", "Type", "Severity", "Links", "Description", "Status", ""]} empty={!list.loading && rows.length === 0}>
        {rows.map((r) => (
          <tr key={String(r.id)}>
            <Td>{fmtDateTime(r.occurred_at)}</Td><Td>{String(r.type).replace("_", " ")}</Td><Td><StatusBadge s={String(r.severity)} /></Td>
            <Td className="text-xs">{r.order_id ? <Link className="text-brand" href={`/admin/orders?id=${r.order_id}`}>#{String(r.order_id)}</Link> : null} {String((r.rider as Row)?.full_name ?? (r.rider as Row)?.email ?? "")} {String((r.restaurants as Row)?.name ?? "")}</Td>
            <Td className="max-w-xs">{String(r.description ?? "")}</Td><Td><StatusBadge s={String(r.status)} /></Td>
            <Td><SmallBtn onClick={() => resolve(String(r.id), r.status === "open" ? "resolved" : "open")}>{r.status === "open" ? "Resolve" : "Reopen"}</SmallBtn></Td>
          </tr>
        ))}
      </Table>
    </Panel>
  );
}

function Payments({ range }: { range: Range }) {
  const q = useReport("report_payments", range);
  const rs = ((q.data?.restaurants as Row[]) ?? []).filter((r) => Number(r.orders) > 0 || Number(r.owed_cents) > 0);
  const rd = (q.data?.riders as Row[]) ?? [];
  async function mark(kind: "rider" | "restaurant", id: string, name: string, owed: number) {
    const ref = prompt(`Mark ${eur(owed)} as paid to ${name} for ${range.from} → ${range.to}?\nOptional bank reference:`);
    if (ref === null) return;
    const fn = kind === "rider" ? "mark_rider_payout" : "mark_restaurant_payout";
    const args = { ...(kind === "rider" ? { p_rider: id } : { p_restaurant: id }), ...toIso(range), p_reference: ref || null };
    const ok = await act((async () => { const { error } = await sb().rpc(fn, args); if (error) throw new Error(error.message); return true; })(), `Recorded payout to ${name}`);
    if (ok !== undefined) q.reload();
  }
  const tot = (rows: Row[], k: string) => rows.reduce((a, r) => a + Number(r[k] ?? 0), 0);
  return (
    <>
      <Panel title={`Restaurant payouts · ${range.from} → ${range.to}`} actions={<Toolbar range={range} title="restaurant payouts" onCsv={() => downloadCsv(`restaurant_payouts_${range.from}_${range.to}.csv`, rs, ["restaurant", "commission_pct", "orders", "gross_cents", "commission_cents", "net_cents", "paid_cents", "owed_cents"])} />}>
        <ErrorNote error={q.error} />
        <Table head={["Restaurant", "Delivered orders", "Gross food sales", "Commission", "Net payout", "Paid", "Owed", ""]} empty={rs.length === 0}>
          {rs.map((r) => (
            <tr key={String(r.restaurant_id)}>
              <Td>{String(r.restaurant)} <span className="text-xs text-muted">({Number(r.commission_pct)}%)</span></Td><Td>{String(r.orders)}</Td>
              <Td>{eur(Number(r.gross_cents))}</Td><Td>{eur(Number(r.commission_cents))}</Td><Td>{eur(Number(r.net_cents))}</Td>
              <Td>{eur(Number(r.paid_cents))}</Td><Td className="font-bold">{eur(Number(r.owed_cents))}</Td>
              <Td>{Number(r.owed_cents) > 0 && <SmallBtn tone="ok" onClick={() => mark("restaurant", String(r.restaurant_id), String(r.restaurant), Number(r.owed_cents))}>Mark paid</SmallBtn>}</Td>
            </tr>
          ))}
          {rs.length > 0 && <tr className="font-bold"><Td>Total</Td><Td>{tot(rs, "orders")}</Td><Td>{eur(tot(rs, "gross_cents"))}</Td><Td>{eur(tot(rs, "commission_cents"))}</Td><Td>{eur(tot(rs, "net_cents"))}</Td><Td>{eur(tot(rs, "paid_cents"))}</Td><Td>{eur(tot(rs, "owed_cents"))}</Td><Td>{""}</Td></tr>}
        </Table>
      </Panel>
      <Panel title={`Rider payouts · ${range.from} → ${range.to}`} actions={<Toolbar range={range} title="rider payouts" onCsv={() => downloadCsv(`rider_payouts_${range.from}_${range.to}.csv`, rd, ["rider", "status", "deliveries", "earned_cents", "paid_cents", "unpaid_cents"])} />}>
        <p className="mb-2 text-xs text-muted">Riders are paid weekly for the previous week: choose “Last week”, then mark each rider paid after the bank transfer.</p>
        <Table head={["Rider", "Status", "Deliveries", "Earned", "Paid", "Unpaid", ""]} empty={rd.length === 0}>
          {rd.map((r) => (
            <tr key={String(r.rider_id)}>
              <Td>{String(r.rider)}</Td><Td><StatusBadge s={String(r.status)} /></Td><Td>{String(r.deliveries)}</Td>
              <Td>{eur(Number(r.earned_cents))}</Td><Td>{eur(Number(r.paid_cents))}</Td><Td className="font-bold">{eur(Number(r.unpaid_cents))}</Td>
              <Td>{Number(r.unpaid_cents) > 0 && <SmallBtn tone="ok" onClick={() => mark("rider", String(r.rider_id), String(r.rider), Number(r.unpaid_cents))}>Mark paid</SmallBtn>}</Td>
            </tr>
          ))}
        </Table>
      </Panel>
    </>
  );
}

function Reports() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = (params.get("tab") as Tab) || "delivery";
  const [range, setRange] = useState<Range>(preset("30d"));
  return (
    <>
      <div className="no-print mb-3 flex flex-wrap gap-1.5">
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => router.replace(`/admin/reports?tab=${k}`)}
            className={`rounded-xl px-3 py-1.5 text-sm font-semibold ${tab === k ? "bg-brand text-white" : "bg-white text-muted"}`}>{l}</button>
        ))}
      </div>
      <div className="mb-3"><RangePicker value={range} onChange={(r) => { if (r.from > r.to) return toast("⚠️ From must be before To"); setRange(r); }} /></div>
      <p className="mb-3 hidden text-sm print:block">Food Porter · {tab} report · {range.from} → {range.to} · printed {new Date().toLocaleString("en-GB")}</p>
      {tab === "delivery" && <Delivery range={range} />}
      {tab === "quality" && <Quality range={range} />}
      {tab === "safety" && <Safety range={range} />}
      {tab === "payments" && <Payments range={range} />}
    </>
  );
}

export default function ReportsPage() {
  return <Suspense fallback={<p className="text-muted">Loading…</p>}><Reports /></Suspense>;
}
