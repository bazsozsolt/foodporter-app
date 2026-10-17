export type Role = "customer" | "rider" | "restaurant" | "admin";
export type OrderStatus = "awaiting_payment" | "payment_failed" | "placed" | "accepted" | "assigned" | "ready" | "picked_up" | "delivered" | "cancelled";

export interface MenuItem { id: string; restaurant_id: string; name: string; price_cents: number; image_url?: string | null; image_credit?: string | null; description?: string | null; allergens?: string[] | null; allergens_test?: boolean }
export interface Restaurant {
  id: string; name: string; cuisine: string; area: string; emoji: string; color: string;
  avg_prep_minutes: number; commission_pct: number | null; partner_since?: string | null; created_at?: string | null; active: boolean; lat?: number | null; lng?: number | null; rating_avg?: number | null; rating_count?: number;
  is_test?: boolean; min_order_cents?: number; description?: string | null; address?: string | null; image_url?: string | null; logo_url?: string | null; image_credit?: string | null;
  opening_hours?: Record<string, [string, string][]> | null; closed_dates?: string[]; paused_until?: string | null; busy_extra_minutes?: number; hours_test?: boolean;
}
export interface OrderLine { item_id: string; name: string; qty: number; price_cents: number; guest_name?: string | null; line_id?: string }
export interface Bid { id: string; rider_id: string; rider_name: string; eta_minutes: number; accepted: boolean; created_at: string }
export interface Order {
  id: string; restaurant_id: string; customer_id: string; status: OrderStatus;
  lines: OrderLine[]; subtotal_cents: number; delivery_fee_cents: number; service_fee_cents?: number; tip_cents?: number; leave_at_door?: boolean; fulfilment?: "delivery" | "pickup"; scheduled_for?: string | null; release_at?: string | null; discount_cents?: number; credit_cents?: number; delivery_photo_path?: string | null;
  address: string; phone: string; prep_minutes: number | null; ready_at: string | null;
  group_order_id?: string | null;
  bids: Bid[]; created_at: string; delivered_at: string | null; accepted_at?: string | null;
  paid_at?: string | null; lat?: number | null; lng?: number | null; distance_km?: number | null; commission_cents?: number | null; commission_pct?: number | null; fee_km?: number | null;
  cancel_reason?: string | null; refund_status?: string | null; refund_cents?: number | null; renotified_at?: string | null;
  assigned_at?: string | null; bid_window_closes_at?: string | null; rider_id?: string | null;
  stacked?: boolean;
}
export interface Earning { id: string; rider_id: string; order_id: string; restaurant_name: string; amount_cents: number; tip_cents?: number; earned_at: string; payout_id: string | null }

export const STATUS_STEPS: OrderStatus[] = ["placed", "accepted", "assigned", "ready", "picked_up", "delivered"];
/** Pickup (afhalen): no rider steps; "delivered" = collected. */
export const PICKUP_STEPS: OrderStatus[] = ["placed", "accepted", "ready", "delivered"];
export const STATUS_LABEL: Record<OrderStatus, string> = {
  awaiting_payment: "Waiting for payment", payment_failed: "Payment failed", placed: "Order placed & paid", accepted: "Restaurant accepted", assigned: "Rider assigned",
  ready: "Ready for pickup", picked_up: "On the way", delivered: "Delivered", cancelled: "Cancelled",
};

export const STATUS_LABEL_NL: Record<OrderStatus, string> = {
  awaiting_payment: "Wacht op betaling", payment_failed: "Betaling mislukt", placed: "Besteld & betaald", accepted: "Restaurant heeft geaccepteerd", assigned: "Rider toegewezen",
  ready: "Klaar voor ophalen", picked_up: "Onderweg", delivered: "Bezorgd", cancelled: "Geannuleerd",
};

import { tx } from "./i18n";
export const statusLabel = (s: OrderStatus) => tx(STATUS_LABEL_NL[s], STATUS_LABEL[s]);
const CANCEL_REASON_NL: Record<string, string> = {
  restaurant_rejected: "Het restaurant kon je bestelling niet aannemen", restaurant_timeout: "Het restaurant heeft niet op tijd bevestigd",
  admin_cancelled: "Geannuleerd door Food Porter support", system: "Geannuleerd",
};
export const cancelReason = (r: string | null | undefined) => tx(CANCEL_REASON_NL[r ?? "system"] ?? "Geannuleerd", CANCEL_REASON[r ?? "system"] ?? "Cancelled");
export const CANCEL_REASON: Record<string, string> = {
  restaurant_rejected: "The restaurant couldn't take your order", restaurant_timeout: "The restaurant didn't confirm in time",
  admin_cancelled: "Cancelled by Food Porter support", system: "Cancelled",
};
