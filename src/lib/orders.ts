import type { Order } from "./types";

export const orderHref = (id: string | number) => `/order?id=${id}`;
export const isPaid = (o: Order) => !["awaiting_payment", "payment_failed", "cancelled"].includes(o.status);
/** Orders created by our end-to-end tests are labelled in the address. */
export const isTestOrder = (o: Order) => o.address.startsWith("FP TEST");

/** Every orders column except phone (phone is not API-readable; use the order_phone RPC). */
export const ORDER_COLS = "id, customer_id, restaurant_id, rider_id, status, subtotal_cents, delivery_fee_cents, tip_cents, leave_at_door, delivery_photo_path, commission_cents, address, prep_minutes, ready_at, mollie_payment_id, created_at, accepted_at, assigned_at, picked_up_at, delivered_at, paid_at, payment_status, sms_sent, restaurant_payout_id, lat, lng, distance_km, cancel_reason, cancelled_at, renotified_at, bid_alerted_at, refund_id, refund_status, refund_cents, refunded_at, bid_window_closes_at, is_test, stacked, group_order_id";

import { useEffect, useState } from "react";
import { getSupabase } from "./supabase";
export interface RiderInfo { rider_name: string; eta_minutes: number; estimated: boolean; since: string }
/** Assigned rider (name + ETA) whenever rider_id is set: from the accepted bid, or via order_rider_info for manual assignments. */
export function useRiderInfo(o: Pick<Order, "id" | "rider_id" | "assigned_at" | "bids"> | null | undefined): RiderInfo | null {
  const bid = o?.bids.find((b) => b.accepted && (!o.rider_id || b.rider_id === o.rider_id)) ?? null;
  const [fetched, setFetched] = useState<{ key: string; v: RiderInfo | null } | null>(null);
  const key = o && o.rider_id && !bid ? `${o.id}:${o.rider_id}` : "";
  useEffect(() => {
    const sb = getSupabase();
    if (!key || !sb) return;
    let alive = true;
    void sb.rpc("order_rider_info", { p_order: Number(key.split(":")[0]) }).then(({ data }) => { if (alive) setFetched({ key, v: (data as RiderInfo | null) ?? null }); });
    return () => { alive = false; };
  }, [key]);
  if (bid) return { rider_name: bid.rider_name, eta_minutes: bid.eta_minutes, estimated: false, since: o?.assigned_at ?? bid.created_at };
  return key && fetched?.key === key ? fetched.v : null;
}
