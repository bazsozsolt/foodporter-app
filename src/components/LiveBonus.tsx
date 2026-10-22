"use client";
import { eur } from "@/lib/format";
import { useStore } from "@/lib/store";
import { PLAN_DEFAULTS } from "@/lib/pricing";

/** v28: the current per-delivery rider bonus from settings (admin-editable), so static info pages never go stale. */
export function LiveBonus() {
  const { settings } = useStore();
  return <span data-testid="live-bonus">{eur(settings.rider_bonus_cents ?? 50)}</span>;
}

// v28b: other copy that quotes current numbers reads the live settings too (fee bands, service fee, zone, commission).
type S = ReturnType<typeof useStore>["settings"];
const money = (c: number, en: boolean) => "€" + (c / 100).toFixed(2).replace(".", en ? "." : ",");
export function liveValues(s: S, en: boolean) {
  const bands = s.delivery_fee_bands?.length ? s.delivery_fee_bands : PLAN_DEFAULTS.delivery_fee_bands;
  return {
    FEES: bands.map((b) => `${money(b.fee_cents, en)} ${en ? "up to" : "tot"} ${String(b.max_km).replace(".", en ? "." : ",")} km`).join(", "),
    SERVICE: money(s.service_fee_cents ?? PLAN_DEFAULTS.service_fee_cents, en),
    ZONE: String(s.zone_radius_km ?? PLAN_DEFAULTS.zone_radius_km).replace(".", en ? "." : ","),
    COMM_D: String(s.commission_delivery_pct ?? PLAN_DEFAULTS.commission_delivery_pct), COMM_I: String(s.commission_intro_pct ?? PLAN_DEFAULTS.commission_intro_pct),
    COMM_M: String(s.commission_intro_months ?? PLAN_DEFAULTS.commission_intro_months), COMM_P: String(s.commission_pickup_pct ?? PLAN_DEFAULTS.commission_pickup_pct),
  };
}
/** Replace {FEES} {SERVICE} {ZONE} {COMM_D} {COMM_I} {COMM_M} {COMM_P} in a copy string. */
export function fillLive(text: string, s: S, en: boolean) {
  const v = liveValues(s, en) as Record<string, string>;
  return text.replace(/\{(FEES|SERVICE|ZONE|COMM_[DIMP])\}/g, (_, k: string) => v[k]);
}
export function LiveText({ t, isEn = false }: { t: string; isEn?: boolean }) {
  const { settings } = useStore();
  return <span data-testid="live-text">{fillLive(t, settings, isEn)}</span>;
}
