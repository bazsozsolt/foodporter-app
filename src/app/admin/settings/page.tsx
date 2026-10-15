"use client";
import { useEffect, useState } from "react";
import { ErrorNote, Field, inputCls, Panel, SmallBtn } from "@/components/admin";
import { act } from "@/lib/act";
import { sb, useAdminQuery, type Row } from "@/lib/admin";
import { actions } from "@/lib/store";

const AGES = ["16", "17", "18", "19", "20", "21"];
const NUMS: [string, string][] = [["holiday_pay_pct", "Holiday pay % (min 8)"], ["holiday_hours_pct", "Holiday hours accrued per hour worked, % (4 weeks/yr = 7.69)"],
  ["atw_max_shift_h", "Max shift, hours (ATW 12)"], ["atw_max_shift_youth_h", "Max shift under 18, hours (ATW 9)"], ["atw_break_after_h", "Break required after, hours (ATW 5.5)"],
  ["atw_week_max_h", "Max per week, hours (ATW 60)"], ["atw_week_max_youth_h", "Max per week under 18, hours (ATW 45)"]];

/** Age-based statutory minimum wage (WML) table + Working Hours Act limits used for the indicative pay summary and clock-in checks. */
function PaySettings({ data, reload }: { data: Row | null; reload: () => void }) {
  const [wml, setWml] = useState<Record<string, string>>({});
  const [nums, setNums] = useState<Record<string, string>>({});
  const [eff, setEff] = useState("");
  useEffect(() => {
    if (!data) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    const w = (data.wml_cents ?? {}) as Record<string, number>;
    setWml(Object.fromEntries(AGES.map((a) => [a, w[a] != null ? (w[a] / 100).toFixed(2) : ""])));
    setNums(Object.fromEntries(NUMS.map(([k]) => [k, String(data[k] ?? "")])));
    setEff(String(data.wml_effective ?? ""));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [data]);
  async function save() {
    const p: Row = { wml_cents: Object.fromEntries(AGES.filter((a) => wml[a]).map((a) => [a, Math.round(Number(wml[a].replace(",", ".")) * 100)])), wml_effective: eff || null, updated_at: new Date().toISOString() };
    for (const [k] of NUMS) p[k] = Number(nums[k].replace(",", "."));
    const ok = await act((async () => { const { error } = await sb().from("settings").update(p).eq("id", true); if (error) throw new Error(/check/.test(error.message) ? "Out of the legal range (WML €1–€100/h incl. a 21+ rate, holiday pay ≥ 8%, ATW maxima)" : error.message); return true; })(), "Pay & working-time settings saved");
    if (ok !== undefined) reload();
  }
  return (
    <Panel title="Rider pay & working time (direct employment)">
      <p className="mb-2 text-xs text-muted">Statutory minimum hourly wage by age (WML, gross). Riders are paid at least this for every clocked-in hour; the per-delivery fee and tips come on top as a bonus. The weekly summary is indicative: payroll runs at the payroll provider.</p>
      <div className="grid max-w-xl grid-cols-3 gap-2 md:grid-cols-6" data-testid="wml-table">
        {AGES.map((a) => <Field key={a} label={a === "21" ? "21+ (€/h)" : `${a} (€/h)`}><input data-testid={`wml-${a}`} className={inputCls} inputMode="decimal" value={wml[a] ?? ""} onChange={(e) => setWml({ ...wml, [a]: e.target.value })} /></Field>)}
      </div>
      <div className="mt-2 grid max-w-xl gap-2 md:grid-cols-2">
        <Field label="WML effective from"><input type="date" className={inputCls} value={eff} onChange={(e) => setEff(e.target.value)} /></Field>
        {NUMS.map(([k, l]) => <Field key={k} label={l}><input data-testid={`set-${k}`} className={inputCls} inputMode="decimal" value={nums[k] ?? ""} onChange={(e) => setNums({ ...nums, [k]: e.target.value })} /></Field>)}
      </div>
      <div className="mt-3"><SmallBtn tone="brand" onClick={save}>Save pay settings</SmallBtn></div>
    </Panel>
  );
}

export default function SettingsAdmin() {
  const q = useAdminQuery<Row>(async () => sb().from("settings").select("*").maybeSingle(), []);
  const [fee, setFee] = useState("2.95");
  const [service, setService] = useState("0.00");
  const [radius, setRadius] = useState("3");
  const [windowS, setWindowS] = useState("180");
  const [acceptMin, setAcceptMin] = useState("5");
  const [maxActive, setMaxActive] = useState("2");
  const [auction, setAuction] = useState("60");
  const [noBidMin, setNoBidMin] = useState("10");
  const [expiryMin, setExpiryMin] = useState("30");
  useEffect(() => {
    if (!q.data) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setFee((Number(q.data.delivery_fee_cents) / 100).toFixed(2));
    setService((Number(q.data.service_fee_cents ?? 0) / 100).toFixed(2));
    setRadius(String(q.data.zone_radius_km));
    setWindowS(String(q.data.bid_window_seconds));
    setAcceptMin(String(q.data.restaurant_accept_minutes));
    setAuction(String(q.data.auction_seconds));
    setMaxActive(String(q.data.max_active_orders ?? 2));
    setNoBidMin(String(q.data.no_bid_alert_minutes));
    setExpiryMin(String(q.data.unpaid_expiry_minutes));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [q.data]);
  async function save() {
    const p = { delivery_fee_cents: Math.round(Number(fee.replace(",", ".")) * 100), service_fee_cents: Math.round(Number(service.replace(",", ".")) * 100), zone_radius_km: Number(radius), bid_window_seconds: Number(windowS), restaurant_accept_minutes: Number(acceptMin), auction_seconds: Number(auction), max_active_orders: Number(maxActive), no_bid_alert_minutes: Number(noBidMin), unpaid_expiry_minutes: Number(expiryMin), updated_at: new Date().toISOString() };
    const ok = await act((async () => { const { error } = await sb().from("settings").update(p).eq("id", true); if (error) throw new Error(error.message); return true; })(), "Settings saved");
    if (ok !== undefined) { q.reload(); actions.reloadCatalog(); }
  }
  return (<>
    <Panel title="Platform settings">
      <ErrorNote error={q.error} />
      <div className="grid max-w-xl gap-3">
        <Field label="Flat delivery fee (€2.50–€3.50, paid to the rider as a per-delivery bonus on top of the hourly wage)"><input className={inputCls} inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} /></Field>
        <Field label="Service fee (€0–€3, shown in the price breakdown, kept by the platform)"><input data-testid="service-fee" className={inputCls} inputMode="decimal" value={service} onChange={(e) => setService(e.target.value)} /></Field>
        <Field label="Delivery zone radius around Tilburg centre (10–20 km)"><input className={inputCls} type="number" step={1} min={10} max={20} value={radius} onChange={(e) => setRadius(e.target.value)} /></Field>
        <Field label="Bid window (seconds): riders are re-notified if nobody bid by then — the key metric uses 3 min"><input className={inputCls} type="number" min={30} max={900} step={30} value={windowS} onChange={(e) => setWindowS(e.target.value)} /></Field>
        <Field label="Max active orders per rider (stacked orders: 1 = no stacking, up to 3; a second order is only allowed when its pickup is within ~1 km and the drop-off goes the same way)"><select data-testid="max-active" className={inputCls} value={maxActive} onChange={(e) => setMaxActive(e.target.value)}>{["1", "2", "3"].map((n) => <option key={n}>{n}</option>)}</select></Field>
        <Field label="Bid auction window (seconds after the first bid; lowest ETA wins, ties → earliest bid)"><input className={inputCls} type="number" min={15} max={300} step={5} value={auction} onChange={(e) => setAuction(e.target.value)} /></Field>
        <h3 className="mt-2 text-sm font-bold">Timeouts (checked every minute)</h3>
        <Field label="Restaurant must accept within (min) — else auto-cancel + full refund"><input className={inputCls} type="number" min={1} max={30} value={acceptMin} onChange={(e) => setAcceptMin(e.target.value)} /></Field>
        <Field label="No rider bid after the bid window → riders re-notified; after (min) → alert admin"><input className={inputCls} type="number" min={1} max={60} value={noBidMin} onChange={(e) => setNoBidMin(e.target.value)} /></Field>
        <Field label="Unpaid orders expire after (min)"><input className={inputCls} type="number" min={10} max={240} value={expiryMin} onChange={(e) => setExpiryMin(e.target.value)} /></Field>
        <div><SmallBtn tone="brand" onClick={save}>Save settings</SmallBtn></div>
        <p className="text-xs text-muted">The fee applies to new orders (Mollie charges the fee stored on the order). Addresses are geocoded with PDOK and orders outside the radius (from {Number(q.data?.zone_center_lat ?? 51.5576).toFixed(4)}, {Number(q.data?.zone_center_lng ?? 5.0913).toFixed(4)}, Heuvel) are refused at payment. Last updated {q.data?.updated_at ? new Date(String(q.data.updated_at)).toLocaleString("en-GB") : "—"}.</p>
      </div>
    </Panel>
    <PaySettings data={q.data} reload={() => void q.reload()} />
  </>);
}
