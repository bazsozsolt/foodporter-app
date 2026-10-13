import type { Order } from "./types";

export const orderHref = (id: string | number) => `/order?id=${id}`;
export const isPaid = (o: Order) => !["awaiting_payment", "payment_failed", "cancelled"].includes(o.status);
/** Orders created by our end-to-end tests are labelled in the address. */
export const isTestOrder = (o: Order) => o.address.startsWith("FP TEST");
