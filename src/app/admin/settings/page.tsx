"use client";
import { useEffect, useState } from "react";
import { ErrorNote, Field, inputCls, Panel, SmallBtn } from "@/components/admin";
import { act } from "@/lib/act";
import { sb, useAdminQuery, type Row } from "@/lib/admin";
import { actions } from "@/lib/store";

export default function SettingsAdmin() {
  const q = useAdminQuery<Row>(async () => sb().from("settings").select("*").maybeSingle(), []);
  const [fee, setFee] = useState("2.95");
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
    const p = { delivery_fee_cents: Math.round(Number(fee.replace(",", ".")) * 100), zone_radius_km: Number(radius), bid_window_seconds: Number(windowS), restaurant_accept_minutes: Number(acceptMin), auction_seconds: Number(auction), max_active_orders: Number(maxActive), no_bid_alert_minutes: Number(noBidMin), unpaid_expiry_minutes: Number(expiryMin), updated_at: new Date().toISOString() };
    const ok = await act((async () => { const { error } = await sb().from("settings").update(p).eq("id", true); if (error) throw new Error(error.message); return true; })(), "Settings saved");
    if (ok !== undefined) { q.reload(); actions.reloadCatalog(); }
  }
  return (
    <Panel title="Platform settings">
      <ErrorNote error={q.error} />
      <div className="grid max-w-xl gap-3">
        <Field label="Flat delivery fee (€2.50–€3.50, riders keep 100%)"><input className={inputCls} inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} /></Field>
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
  );
}
