/** Pure order money helpers (no Supabase). */
export const paidTotalCents = (o: { subtotal_cents: number; delivery_fee_cents: number; service_fee_cents?: number | null; tip_cents?: number | null; discount_cents?: number | null; credit_cents?: number | null }) =>
  o.subtotal_cents + o.delivery_fee_cents + (o.service_fee_cents ?? 0) + (o.tip_cents ?? 0) - (o.discount_cents ?? 0) - (o.credit_cents ?? 0);

/** Rider earning credited on deliver: the stored (or default) bonus plus the tip. Not the delivery fee. Pickup earns only the tip (bonus is 0). */
export function riderEarningsCents(
  o: { fulfilment?: string | null; rider_bonus_cents?: number | null; delivery_fee_cents?: number | null; tip_cents?: number | null },
  settings?: { rider_bonus_cents?: number | null },
): number {
  const tip = o.tip_cents ?? 0;
  if (o.fulfilment === "pickup") return tip;
  const bonus = o.rider_bonus_cents ?? settings?.rider_bonus_cents ?? 50;
  return bonus + tip;
}

export type OrderMoneyBreakdown = {
  food_cents: number;
  delivery_cents: number;
  service_cents: number;
  tip_cents: number;
  discount_cents: number;
  credit_cents: number;
  total_cents: number;
};

/** Full customer-facing money breakdown for admin order detail. */
export function orderMoneyBreakdown(o: {
  subtotal_cents: number; delivery_fee_cents: number; service_fee_cents?: number | null; tip_cents?: number | null;
  discount_cents?: number | null; credit_cents?: number | null;
}): OrderMoneyBreakdown {
  const food_cents = o.subtotal_cents;
  const delivery_cents = o.delivery_fee_cents;
  const service_cents = o.service_fee_cents ?? 0;
  const tip_cents = o.tip_cents ?? 0;
  const discount_cents = o.discount_cents ?? 0;
  const credit_cents = o.credit_cents ?? 0;
  return { food_cents, delivery_cents, service_cents, tip_cents, discount_cents, credit_cents, total_cents: paidTotalCents(o) };
}
