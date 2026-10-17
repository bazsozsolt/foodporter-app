"use client";
import { useEffect, useState } from "react";
import { Field, inputCls, Panel, SmallBtn } from "@/components/admin";
import { act } from "@/lib/act";
import { sb, type Row } from "@/lib/admin";
import { eur } from "@/lib/format";
import { PLAN_DEFAULTS, type FeeBand } from "@/lib/pricing";
import { actions } from "@/lib/store";

type Form = {
  commission_delivery_pct: string; commission_intro_pct: string; commission_intro_months: string; commission_pickup_pct: string;
  bands: { max_km: string; fee: string }[]; service_fee: string; service_fee_on_pickup: boolean; fee_distance_basis: string;
  zone_radius_km: string; rider_bonus: string; default_contract_kind: string; minmax_default_min_h: string; minmax_default_max_h: string;
};
const num = (v: string) => Number(String(v).replace(",", "."));
const toForm = (d: Record<string, unknown>): Form => ({
  commission_delivery_pct: String(d.commission_delivery_pct), commission_intro_pct: String(d.commission_intro_pct),
  commission_intro_months: String(d.commission_intro_months), commission_pickup_pct: String(d.commission_pickup_pct),
  bands: ((d.delivery_fee_bands ?? []) as FeeBand[]).map((b) => ({ max_km: String(b.max_km), fee: (b.fee_cents / 100).toFixed(2) })),
  service_fee: (Number(d.service_fee_cents ?? 0) / 100).toFixed(2), service_fee_on_pickup: Boolean(d.service_fee_on_pickup),
  fee_distance_basis: String(d.fee_distance_basis ?? "restaurant"), zone_radius_km: String(d.zone_radius_km),
  rider_bonus: (Number(d.rider_bonus_cents ?? 50) / 100).toFixed(2),
  default_contract_kind: String(d.default_contract_kind ?? "min_max"), minmax_default_min_h: String(d.minmax_default_min_h), minmax_default_max_h: String(d.minmax_default_max_h),
});

/** v26: the business-model values from the financial plan (16 Oct 2026), grouped, with the plan defaults and a reset. */
export function BusinessModelSettings({ data, reload }: { data: Row | null; reload: () => void }) {
  const [f, setF] = useState<Form | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (data) setF(toForm(data)); }, [data]);
  if (!f) return null;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF({ ...f, [k]: v });
  const payload = (x: Form): Row => {
    const bands = x.bands.map((b) => ({ max_km: num(b.max_km), fee_cents: Math.round(num(b.fee) * 100) }));
    return {
      commission_delivery_pct: num(x.commission_delivery_pct), commission_intro_pct: num(x.commission_intro_pct),
      commission_intro_months: Math.round(num(x.commission_intro_months)), commission_pickup_pct: num(x.commission_pickup_pct),
      delivery_fee_bands: bands, delivery_fee_cents: bands[0]?.fee_cents ?? 249, // placeholder fee on new unpaid orders (server sets the real one)
      service_fee_cents: Math.round(num(x.service_fee) * 100), service_fee_on_pickup: x.service_fee_on_pickup, fee_distance_basis: x.fee_distance_basis,
      zone_radius_km: num(x.zone_radius_km), rider_bonus_cents: Math.round(num(x.rider_bonus) * 100), default_contract_kind: x.default_contract_kind,
      minmax_default_min_h: num(x.minmax_default_min_h), minmax_default_max_h: num(x.minmax_default_max_h), updated_at: new Date().toISOString(),
    };
  };
  async function save(x: Form, msg = "Business model saved") {
    const p = payload(x);
    if (Object.values(p).some((v) => typeof v === "number" && !Number.isFinite(v))) return act(Promise.reject(new Error("Fill in every field with a number")));
    const ok = await act((async () => {
      const { error } = await sb().from("settings").update(p).eq("id", true);
      if (error) throw new Error(/check/.test(error.message) ? "Out of range: commission 5–35% (pickup 0–35%), founding period 0–12 months, fee bands 1–6 rows with increasing km (0.5–20) and €1.00–€9.99, service fee €0–€3, rider bonus €0–€2, zone 5–10 km, min-max hours 0 < min ≤ max ≤ 40" : error.message);
      return true;
    })(), msg);
    if (ok !== undefined) { reload(); actions.reloadCatalog(); }
  }
  function reset() {
    if (!window.confirm("Reset the business model to the financial plan defaults (25% / 20% for 3 months / 10%, €2.49 / €3.49 / €4.99 by distance, €0.99 service fee, €0.50 rider bonus per delivery, 5 km zone, min-max 8–16 h)? This applies to new orders only.")) return;
    const x = toForm(PLAN_DEFAULTS as unknown as Record<string, unknown>);
    setF(x); void save(x, "Plan defaults restored");
  }
  const P = PLAN_DEFAULTS;
  const pct = (k: keyof Form, label: string, plan: number) => (
    <Field label={`${label} (plan: ${plan}${k === "commission_intro_months" ? " months" : "%"})`}><input data-testid={`bm-${k}`} className={inputCls} inputMode="decimal" value={String(f[k])} onChange={(e) => set(k, e.target.value as never)} /></Field>
  );
  return (
    <Panel title="Business model (financial plan, 16 Oct 2026)">
      <div data-testid="business-model" className="grid max-w-2xl gap-3">
        <p className="text-xs text-muted">All prices and commissions are computed on the server. Changes apply to new orders; paid orders keep the rate and fees stored on them.</p>
        <h3 className="text-sm font-bold">Restaurant commission</h3>
        <div className="grid gap-2 md:grid-cols-2">
          {pct("commission_delivery_pct", "Delivered orders %", P.commission_delivery_pct)}
          {pct("commission_intro_pct", "Founding-partner rate %", P.commission_intro_pct)}
          {pct("commission_intro_months", "Founding rate applies for (months from the partner date)", P.commission_intro_months)}
          {pct("commission_pickup_pct", "Pickup orders %", P.commission_pickup_pct)}
        </div>
        <p className="text-xs text-muted">A restaurant can have a custom delivered rate (Restaurants page); pickup always uses the pickup rate.</p>
        <h3 className="mt-1 text-sm font-bold">Customer fees</h3>
        <div data-testid="fee-bands" className="grid gap-2">
          {f.bands.map((b, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <Field label={`Band ${i + 1}: up to km`}><input data-testid={`band-km-${i}`} className={inputCls + " w-28"} inputMode="decimal" value={b.max_km} onChange={(e) => set("bands", f.bands.map((x, j) => j === i ? { ...x, max_km: e.target.value } : x))} /></Field>
              <Field label="Delivery fee €"><input data-testid={`band-fee-${i}`} className={inputCls + " w-28"} inputMode="decimal" value={b.fee} onChange={(e) => set("bands", f.bands.map((x, j) => j === i ? { ...x, fee: e.target.value } : x))} /></Field>
              {f.bands.length > 1 && <SmallBtn onClick={() => set("bands", f.bands.filter((_, j) => j !== i))}>Remove band</SmallBtn>}
            </div>))}
          {f.bands.length < 6 && <div><SmallBtn onClick={() => set("bands", [...f.bands, { max_km: "", fee: "" }])}>Add band</SmallBtn></div>}
          <p className="text-xs text-muted">Plan: {P.delivery_fee_bands.map((b, i, a) => `${i ? `${a[i - 1].max_km}–` : "≤"}${b.max_km} km ${eur(b.fee_cents)}`).join(" · ")}. Beyond the last band the last fee applies. The rider gets the fixed bonus below per delivery; the rest of the delivery fee and the service fee are Food Porter revenue. Tips go 100% to the rider.</p>
          <Field label="Distance used for the fee band"><select data-testid="bm-basis" className={inputCls} value={f.fee_distance_basis} onChange={(e) => set("fee_distance_basis", e.target.value)}>
            <option value="restaurant">Restaurant → customer (trip length, default)</option><option value="centre">Zone centre → customer</option></select></Field>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          <Field label={`Service fee € (plan: ${eur(P.service_fee_cents)}, kept by the platform)`}><input data-testid="service-fee" className={inputCls} inputMode="decimal" value={f.service_fee} onChange={(e) => set("service_fee", e.target.value)} /></Field>
          <label className="flex min-h-11 items-center gap-2 self-end text-sm"><input data-testid="bm-service-pickup" type="checkbox" className="h-5 w-5" checked={f.service_fee_on_pickup} onChange={(e) => set("service_fee_on_pickup", e.target.checked)} />Also charge the service fee on pickup orders (plan: no)</label>
        </div>
        <Field label={`Rider bonus per delivery € (0–2; plan: ${eur(P.rider_bonus_cents)}; stored on each order at payment)`}><input data-testid="bm-rider-bonus" className={inputCls} inputMode="decimal" value={f.rider_bonus} onChange={(e) => set("rider_bonus", e.target.value)} /></Field>
        <h3 className="mt-1 text-sm font-bold">Delivery zone</h3>
        <Field label={`Radius around Tilburg centre, km (5–10; plan: ${P.zone_radius_km} km core, 5–10 km in Stage 2)`}><input data-testid="bm-zone" className={inputCls} type="number" min={5} max={10} step={0.5} value={f.zone_radius_km} onChange={(e) => set("zone_radius_km", e.target.value)} /></Field>
        <h3 className="mt-1 text-sm font-bold">Rider contracts (defaults for new riders)</h3>
        <div className="grid gap-2 md:grid-cols-3">
          <Field label="Default contract kind"><select data-testid="bm-contract" className={inputCls} value={f.default_contract_kind} onChange={(e) => set("default_contract_kind", e.target.value)}>
            <option value="min_max">Min-max (plan)</option><option value="on_call">0-hours on-call (banned from 1 Jan 2028)</option></select></Field>
          <Field label={`Min h/week (plan: ${P.minmax_default_min_h})`}><input data-testid="bm-min-h" className={inputCls} inputMode="decimal" value={f.minmax_default_min_h} onChange={(e) => set("minmax_default_min_h", e.target.value)} /></Field>
          <Field label={`Max h/week (plan: ${P.minmax_default_max_h})`}><input data-testid="bm-max-h" className={inputCls} inputMode="decimal" value={f.minmax_default_max_h} onChange={(e) => set("minmax_default_max_h", e.target.value)} /></Field>
        </div>
        <div className="flex flex-wrap gap-2"><SmallBtn tone="brand" onClick={() => void save(f)}>Save business model</SmallBtn><SmallBtn onClick={reset}>Reset to plan defaults</SmallBtn></div>
      </div>
    </Panel>
  );
}
