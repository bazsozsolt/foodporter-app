/** v26 business model (financial plan 16 Oct 2026). Display helpers only: the server (create-payment + DB) is authoritative. */
import { distanceKm } from "@/lib/geo";

export type FeeBand = { max_km: number; fee_cents: number };
export const PLAN_DEFAULTS = {
  commission_delivery_pct: 25, commission_intro_pct: 20, commission_intro_months: 3, commission_pickup_pct: 10,
  delivery_fee_bands: [{ max_km: 3, fee_cents: 249 }, { max_km: 5, fee_cents: 349 }, { max_km: 10, fee_cents: 499 }] as FeeBand[],
  service_fee_cents: 99, service_fee_on_pickup: false, zone_radius_km: 5, fee_distance_basis: "restaurant" as "restaurant" | "centre",
  default_contract_kind: "min_max" as "min_max" | "on_call", minmax_default_min_h: 8, minmax_default_max_h: 16,
  rider_bonus_cents: 50, // v27: fixed per-delivery rider bonus; the rest of the delivery fee + service fee is Food Porter revenue
};

/** Same rule as fp_delivery_fee: first band with max_km >= km, else the last band. */
export function feeForKm(bands: FeeBand[] | null | undefined, km: number): number {
  const b = bands?.length ? bands : PLAN_DEFAULTS.delivery_fee_bands;
  return (b.find((x) => x.max_km >= Math.max(0, km)) ?? b[b.length - 1]).fee_cents;
}
export const feeRange = (bands: FeeBand[] | null | undefined) => {
  const b = bands?.length ? bands : PLAN_DEFAULTS.delivery_fee_bands;
  return { min: Math.min(...b.map((x) => x.fee_cents)), max: Math.max(...b.map((x) => x.fee_cents)) };
};

/** Distance used for the fee band, rounded like the server (2 decimals). */
export function feeKm(geo: { lat: number; lng: number; distance_km: number }, rest: { lat?: number | null; lng?: number | null } | undefined, basis: string | undefined) {
  const km = basis !== "centre" && rest?.lat != null && rest?.lng != null ? distanceKm({ lat: rest.lat, lng: rest.lng }, geo) : geo.distance_km;
  return Math.round(km * 100) / 100;
}

/** Commission rate as the database computes it (fp_commission_rate). */
export function commissionRate(s: Partial<typeof PLAN_DEFAULTS>, r: { commission_pct?: number | null; partner_since?: string | null; created_at?: string | null }, pickup = false, at = new Date()) {
  const d = { ...PLAN_DEFAULTS, ...s };
  if (pickup) return Number(d.commission_pickup_pct);
  if (r.commission_pct != null) return Number(r.commission_pct);
  const until = introUntil(d.commission_intro_months, r);
  return until && at < until ? Number(d.commission_intro_pct) : Number(d.commission_delivery_pct);
}
export function introUntil(months: number, r: { partner_since?: string | null; created_at?: string | null }) {
  const since = r.partner_since ?? r.created_at?.slice(0, 10);
  if (!since) return null;
  const [y, m, day] = since.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + Number(months), day));
}
