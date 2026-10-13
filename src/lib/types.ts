export type Role = "customer" | "rider" | "restaurant" | "admin";
export type OrderStatus = "placed" | "accepted" | "assigned" | "ready" | "picked_up" | "delivered" | "cancelled";

export interface MenuItem { id: string; restaurant_id: string; name: string; price_cents: number }
export interface Restaurant {
  id: string; name: string; cuisine: string; area: string; emoji: string; color: string;
  avg_prep_minutes: number; commission_pct: number; active: boolean;
}
export interface OrderLine { item_id: string; name: string; qty: number; price_cents: number }
export interface Bid { id: string; rider_id: string; rider_name: string; eta_minutes: number; accepted: boolean; created_at: string }
export interface Order {
  id: string; restaurant_id: string; customer_id: string; status: OrderStatus;
  lines: OrderLine[]; subtotal_cents: number; delivery_fee_cents: number;
  address: string; phone: string; prep_minutes: number | null; ready_at: string | null;
  bids: Bid[]; created_at: string; delivered_at: string | null; accepted_at?: string | null;
}
export interface Earning { id: string; rider_id: string; order_id: string; restaurant_name: string; amount_cents: number; earned_at: string; payout_id: string | null }

export const STATUS_STEPS: OrderStatus[] = ["placed", "accepted", "assigned", "ready", "picked_up", "delivered"];
export const STATUS_LABEL: Record<OrderStatus, string> = {
  placed: "Order placed & paid", accepted: "Restaurant accepted", assigned: "Rider assigned",
  ready: "Ready for pickup", picked_up: "On the way", delivered: "Delivered", cancelled: "Cancelled",
};
