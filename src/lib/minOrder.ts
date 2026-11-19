/** Platform minimum for delivery orders. Pickup is exempt. Amount is admin-editable. */
export const DEFAULT_MIN_DELIVERY_ORDER_CENTS = 1500;

export function platformDeliveryMinCents(settings?: { min_delivery_order_cents?: number | null } | null): number {
  const v = settings?.min_delivery_order_cents;
  if (v == null || Number.isNaN(Number(v))) return DEFAULT_MIN_DELIVERY_ORDER_CENTS;
  return Math.max(0, Math.trunc(Number(v)));
}

/** Food total for the platform delivery minimum: item subtotal minus promo discount minus credit. Fees and tip are excluded. Never negative. */
export function foodTotalAfterDiscountCents(subtotalCents: number, discountCents = 0, creditCents = 0): number {
  const sub = Math.max(0, Math.trunc(Number(subtotalCents) || 0));
  const disc = Math.max(0, Math.trunc(Number(discountCents) || 0));
  const cred = Math.max(0, Math.trunc(Number(creditCents) || 0));
  return Math.max(0, sub - disc - cred);
}

/** Combined min when discounts are zero: restaurant min, plus the platform min for delivery only. Prefer evaluateMinOrder when a promo or credit applies, because the two minima use different bases. */
export function effectiveMinOrderCents(opts: { pickup: boolean; restaurantMinCents?: number; platformDeliveryMinCents?: number }): number {
  const restaurant = Math.max(0, Math.trunc(Number(opts.restaurantMinCents ?? 0) || 0));
  const platform = opts.pickup ? 0 : Math.max(0, Math.trunc(Number(opts.platformDeliveryMinCents ?? 0) || 0));
  return Math.max(restaurant, platform);
}

export function minOrderShortfall(foodCents: number, minCents: number): number {
  return Math.max(0, minCents - foodCents);
}

export type MinOrderEvaluation = {
  belowMin: boolean;
  restaurantBelow: boolean;
  platformBelow: boolean;
  foodAfterCents: number;
  bind: "restaurant" | "platform" | null;
  minCents: number;
  needCents: number;
};

/**
 * Restaurant min stays on the item subtotal (existing basis, before discounts).
 * Platform delivery min is the food total after promo discount and credit.
 */
export function evaluateMinOrder(opts: {
  pickup: boolean;
  subtotalCents: number;
  discountCents?: number;
  creditCents?: number;
  restaurantMinCents?: number;
  platformDeliveryMinCents?: number;
}): MinOrderEvaluation {
  const restaurantMin = Math.max(0, Math.trunc(Number(opts.restaurantMinCents ?? 0) || 0));
  const platformMin = opts.pickup ? 0 : Math.max(0, Math.trunc(Number(opts.platformDeliveryMinCents ?? 0) || 0));
  const sub = Math.max(0, Math.trunc(Number(opts.subtotalCents) || 0));
  const foodAfter = foodTotalAfterDiscountCents(sub, opts.discountCents, opts.creditCents);
  const restaurantBelow = sub < restaurantMin;
  const platformBelow = foodAfter < platformMin;
  if (restaurantBelow) {
    return { belowMin: true, restaurantBelow, platformBelow, foodAfterCents: foodAfter, bind: "restaurant", minCents: restaurantMin, needCents: minOrderShortfall(sub, restaurantMin) };
  }
  if (platformBelow) {
    return { belowMin: true, restaurantBelow, platformBelow, foodAfterCents: foodAfter, bind: "platform", minCents: platformMin, needCents: minOrderShortfall(foodAfter, platformMin) };
  }
  return { belowMin: false, restaurantBelow, platformBelow, foodAfterCents: foodAfter, bind: null, minCents: 0, needCents: 0 };
}

/** NL/EN copy for cart and checkout. Pass amounts already formatted with eur(). */
export function minOrderMessage(opts: {
  lang: "nl" | "en";
  pickup: boolean;
  min: string;
  need: string;
  restaurantMinCents?: number;
  platformMinCents?: number;
  bind?: "restaurant" | "platform" | null;
}): { text: string; testId: string } {
  const platform = opts.platformMinCents ?? 0;
  const restaurant = opts.restaurantMinCents ?? 0;
  const platformBinds = opts.bind ? opts.bind === "platform" : !opts.pickup && platform > 0 && platform >= restaurant;
  if (opts.lang === "en") {
    if (opts.pickup || !platformBinds) {
      return { testId: "min-order-warning", text: `This restaurant's minimum order is ${opts.min}. Add ${opts.need} more.` };
    }
    return {
      testId: "min-delivery-order-warning",
      text: `Delivery orders need a food total of ${opts.min} after discount and credit (before delivery and service fees). Add ${opts.need} more. Pickup is not subject to this platform minimum.`,
    };
  }
  if (opts.pickup || !platformBinds) {
    return { testId: "min-order-warning", text: `Minimale bestelling bij dit restaurant is ${opts.min}. Voeg nog ${opts.need} toe.` };
  }
  return {
    testId: "min-delivery-order-warning",
    text: `Voor bezorgen is de minimale bestelling ${opts.min} aan gerechten na korting en tegoed (excl. bezorg- en servicekosten). Voeg nog ${opts.need} toe. Voor afhalen geldt dit platformminimum niet.`,
  };
}
