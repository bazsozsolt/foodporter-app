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
  useEffect(() => {
    if (!q.data) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setFee((Number(q.data.delivery_fee_cents) / 100).toFixed(2));
    setRadius(String(q.data.zone_radius_km));
    setWindowS(String(q.data.bid_window_seconds));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [q.data]);
  async function save() {
    const p = { delivery_fee_cents: Math.round(Number(fee.replace(",", ".")) * 100), zone_radius_km: Number(radius), bid_window_seconds: Number(windowS), updated_at: new Date().toISOString() };
    const ok = await act((async () => { const { error } = await sb().from("settings").update(p).eq("id", true); if (error) throw new Error(error.message); return true; })(), "Settings saved");
    if (ok !== undefined) { q.reload(); actions.reloadCatalog(); }
  }
  return (
    <Panel title="Platform settings">
      <ErrorNote error={q.error} />
      <div className="grid max-w-xl gap-3">
        <Field label="Flat delivery fee (€2.50–€3.50, riders keep 100%)"><input className={inputCls} inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} /></Field>
        <Field label="Delivery zone radius around Tilburg centre (km)"><input className={inputCls} type="number" step={0.5} min={0.5} max={20} value={radius} onChange={(e) => setRadius(e.target.value)} /></Field>
        <Field label="Bid window target (seconds) — the key metric uses 3 min"><input className={inputCls} type="number" min={30} max={900} step={30} value={windowS} onChange={(e) => setWindowS(e.target.value)} /></Field>
        <div><SmallBtn tone="brand" onClick={save}>Save settings</SmallBtn></div>
        <p className="text-xs text-muted">The fee applies to new orders (Mollie charges the fee stored on the order). The zone radius is informational until address geocoding is added. Last updated {q.data?.updated_at ? new Date(String(q.data.updated_at)).toLocaleString("en-GB") : "—"}.</p>
      </div>
    </Panel>
  );
}
