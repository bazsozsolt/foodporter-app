import type { Order } from "./types";

export const orderHref = (id: string | number) => `/order?id=${id}`;
export const isPaid = (o: Order) => !["awaiting_payment", "payment_failed", "cancelled"].includes(o.status);
/** Orders created by our end-to-end tests are labelled in the address. */
export const isTestOrder = (o: Order) => o.address.startsWith("FP TEST");

/** Every orders column except phone (phone is not API-readable; use the order_phone RPC). */
export const ORDER_COLS = "id, customer_id, restaurant_id, rider_id, status, subtotal_cents, delivery_fee_cents, commission_cents, address, prep_minutes, ready_at, mollie_payment_id, created_at, accepted_at, assigned_at, picked_up_at, delivered_at, paid_at, payment_status, sms_sent, restaurant_payout_id, lat, lng, distance_km, cancel_reason, cancelled_at, renotified_at, bid_alerted_at, refund_id, refund_status, refund_cents, refunded_at, bid_window_closes_at, is_test, stacked, group_order_id";
