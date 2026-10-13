"use client";
// Mock data layer (localStorage) used until Supabase keys are configured.
// Every function here maps 1:1 to a future Supabase query/RPC.
import { useSyncExternalStore } from "react";
import { DELIVERY_FEE_CENTS, menuItems, restaurants, seedEarnings } from "./mock-data";
import type { Earning, Order, OrderLine, OrderStatus } from "./types";

interface State { signedIn: string | null; cart: { restaurant_id: string | null; qty: Record<string, number> }; orders: Order[]; earnings: Earning[] }
const KEY = "foodporter-mock-v1";
const initial: State = { signedIn: null, cart: { restaurant_id: null, qty: {} }, orders: [], earnings: seedEarnings };

let state: State = initial;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try { const s = localStorage.getItem(KEY); if (s) state = { ...initial, ...JSON.parse(s) }; } catch { /* ignore */ }
}
function set(fn: (s: State) => State) {
  state = fn(state);
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  load();
  listeners.add(l);
  const onStorage = (e: StorageEvent) => { if (e.key === KEY && e.newValue) { state = JSON.parse(e.newValue); l(); } };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(l); window.removeEventListener("storage", onStorage); };
}

export function useStore(): State {
  return useSyncExternalStore(subscribe, () => { load(); return state; }, () => initial);
}

export const actions = {
  signIn: (provider: string) => set((s) => ({ ...s, signedIn: provider })),
  signOut: () => set((s) => ({ ...s, signedIn: null })),
  setQty: (restaurant_id: string, item_id: string, qty: number) =>
    set((s) => {
      const base = s.cart.restaurant_id === restaurant_id ? { ...s.cart.qty } : {};
      if (qty <= 0) delete base[item_id]; else base[item_id] = qty;
      return { ...s, cart: { restaurant_id, qty: base } };
    }),
  placeOrder: (address: string, phone: string): string => {
    const { restaurant_id, qty } = state.cart;
    const lines: OrderLine[] = Object.entries(qty).map(([item_id, q]) => {
      const it = menuItems.find((m) => m.id === item_id)!;
      return { item_id, name: it.name, qty: q, price_cents: it.price_cents };
    });
    const id = String(1040 + state.orders.length);
    const order: Order = {
      id, restaurant_id: restaurant_id!, customer_id: "customer-demo", status: "placed", lines,
      subtotal_cents: lines.reduce((a, l) => a + l.qty * l.price_cents, 0), delivery_fee_cents: DELIVERY_FEE_CENTS,
      address, phone, prep_minutes: null, ready_at: null, bids: [], created_at: new Date().toISOString(), delivered_at: null,
    };
    set((s) => ({ ...s, orders: [...s.orders, order], cart: { restaurant_id: null, qty: {} } }));
    return id;
  },
  acceptOrder: (id: string, prep: number) =>
    patch(id, { status: "accepted", prep_minutes: prep, ready_at: new Date(Date.now() + prep * 60000).toISOString() }),
  placeBid: (id: string, eta: number) =>
    set((s) => ({
      ...s,
      orders: s.orders.map((o) => o.id !== id ? o : {
        ...o, status: "assigned" as OrderStatus,
        bids: [...o.bids, { id: `b-${Date.now()}`, rider_id: "rider-demo", rider_name: "Sanne", eta_minutes: eta, accepted: true, created_at: new Date().toISOString() }],
      }),
    })),
  markReady: (id: string) => patch(id, { status: "ready", ready_at: new Date().toISOString() }),
  pickUp: (id: string) => patch(id, { status: "picked_up" }),
  deliver: (id: string) =>
    set((s) => {
      const o = s.orders.find((x) => x.id === id)!;
      const r = restaurants.find((x) => x.id === o.restaurant_id)!;
      return {
        ...s,
        orders: s.orders.map((x) => x.id === id ? { ...x, status: "delivered" as OrderStatus, delivered_at: new Date().toISOString() } : x),
        earnings: [...s.earnings, { id: `e-${id}`, rider_id: "rider-demo", order_id: id, restaurant_name: r.name.replace(" (example)", ""), amount_cents: o.delivery_fee_cents, earned_at: new Date().toISOString(), payout_id: null }],
      };
    }),
  reset: () => set(() => initial),
};

function patch(id: string, p: Partial<Order>) {
  set((s) => ({ ...s, orders: s.orders.map((o) => (o.id === id ? { ...o, ...p } : o)) }));
}

export const acceptedBid = (o: Order) => o.bids.find((b) => b.accepted) ?? null;
