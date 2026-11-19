/** Default platform minimum for delivery: food subtotal, before fees and discounts. Pickup is exempt. */
export const DEFAULT_MIN_DELIVERY_ORDER_CENTS = 1500;

export function platformDeliveryMinCents(settings?: { min_delivery_order_cents?: number } | null): number {
  const n = Number(settings?.min_delivery_order_cents);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : DEFAULT_MIN_DELIVERY_ORDER_CENTS;
}

/** Effective minimum the customer must reach. Pickup uses only the restaurant minimum. */
export function effectiveMinOrderCents(opts: {
  pickup: boolean;
  restaurantMinCents?: number | null;
  platformDeliveryMinCents?: number | null;
}): number {
  const restaurant = Math.max(0, Math.trunc(Number(opts.restaurantMinCents ?? 0) || 0));
  const platform = opts.pickup ? 0 : Math.max(0, Math.trunc(Number(opts.platformDeliveryMinCents ?? 0) || 0));
  return Math.max(restaurant, platform);
}

export function minOrderShortfall(subtotalCents: number, minCents: number): number {
  return Math.max(0, minCents - subtotalCents);
}

/** NL/EN copy for cart and checkout. Pass amounts already formatted with eur(). */
export function minOrderMessage(opts: {
  lang: "nl" | "en";
  pickup: boolean;
  min: string;
  need: string;
  restaurantMinCents?: number;
  platformMinCents?: number;
}): { text: string; testId: string } {
  const platform = opts.platformMinCents ?? 0;
  const restaurant = opts.restaurantMinCents ?? 0;
  const platformBinds = !opts.pickup && platform > 0 && platform >= restaurant;
  if (opts.lang === "en") {
    if (opts.pickup) {
      return { testId: "min-order-warning", text: `This restaurant's minimum order is ${opts.min}. Add ${opts.need} more.` };
    }
    if (platformBinds) {
      return {
        testId: "min-delivery-order-warning",
        text: `Delivery orders need a food subtotal of ${opts.min} (before delivery and service fees, and before discounts). Add ${opts.need} more. Pickup is not subject to this platform minimum.`,
      };
    }
    return { testId: "min-order-warning", text: `This restaurant's minimum order is ${opts.min}. Add ${opts.need} more.` };
  }
  if (opts.pickup) {
    return { testId: "min-order-warning", text: `Minimale bestelling bij dit restaurant is ${opts.min}. Voeg nog ${opts.need} toe.` };
  }
  if (platformBinds) {
    return {
      testId: "min-delivery-order-warning",
      text: `Voor bezorgen is de minimale bestelling ${opts.min} aan gerechten (excl. bezorg- en servicekosten, vóór korting). Voeg nog ${opts.need} toe. Voor afhalen geldt dit platformminimum niet.`,
    };
  }
  return { testId: "min-order-warning", text: `Minimale bestelling bij dit restaurant is ${opts.min}. Voeg nog ${opts.need} toe.` };
}
