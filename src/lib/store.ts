"use client";
// Data layer. With NEXT_PUBLIC_SUPABASE_* set it uses Supabase (auth, queries, realtime);
// otherwise it falls back to mock data in localStorage so the app always runs.
import { useSyncExternalStore } from "react";
import { DELIVERY_FEE_CENTS, menuItems as mockMenu, restaurants as mockRestaurants, seedEarnings } from "./mock-data";
import { getSupabase, hasSupabase } from "./supabase";
import type { Bid, Earning, MenuItem, Order, OrderLine, OrderStatus, Restaurant, Role } from "./types";

export interface Profile { id: string; email: string | null; role: Role; full_name: string | null; restaurant_id: string | null }
export interface State {
  mode: "mock" | "supabase";
  ready: boolean;
  signedIn: string | null;          // provider/email label, null = signed out
  profile: Profile | null;
  restaurants: Restaurant[];
  menuItems: MenuItem[];
  cart: { restaurant_id: string | null; qty: Record<string, number> };
  orders: Order[];
  earnings: Earning[];
}

const KEY = "foodporter-mock-v2";
const CART_KEY = "foodporter-cart-v1";
const initial: State = {
  mode: hasSupabase ? "supabase" : "mock", ready: !hasSupabase, signedIn: null, profile: null,
  restaurants: hasSupabase ? [] : mockRestaurants, menuItems: hasSupabase ? [] : mockMenu,
  cart: { restaurant_id: null, qty: {} }, orders: [], earnings: hasSupabase ? [] : seedEarnings,
};

let state: State = initial;
let started = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function persist() {
  try {
    if (state.mode === "mock") {
      const { signedIn, cart, orders, earnings } = state;
      localStorage.setItem(KEY, JSON.stringify({ signedIn, cart, orders, earnings }));
    } else localStorage.setItem(CART_KEY, JSON.stringify(state.cart));
  } catch { /* ignore */ }
}
function set(fn: (s: State) => State) { state = fn(state); persist(); emit(); }

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  try {
    if (state.mode === "mock") {
      const s = localStorage.getItem(KEY);
      if (s) state = { ...state, ...JSON.parse(s) };
      window.addEventListener("storage", (e) => {
        if (e.key === KEY && e.newValue) { state = { ...state, ...JSON.parse(e.newValue) }; emit(); }
      });
    } else {
      const c = localStorage.getItem(CART_KEY);
      if (c) state = { ...state, cart: JSON.parse(c) };
      void initSupabase();
    }
  } catch { /* ignore */ }
}

function subscribe(l: () => void) { start(); listeners.add(l); return () => { listeners.delete(l); }; }
export function useStore(): State {
  return useSyncExternalStore(subscribe, () => { start(); return state; }, () => initial);
}

// ---------------- Supabase ----------------
type Row = Record<string, unknown>;
function mapOrder(o: Row): Order {
  const bids = ((o.bids as Row[]) ?? []).map((b): Bid => ({
    id: b.id as string, rider_id: b.rider_id as string, rider_name: (b.rider_name as string) ?? "your rider",
    eta_minutes: b.eta_minutes as number, accepted: b.accepted as boolean, created_at: b.created_at as string,
  }));
  const lines = ((o.order_items as Row[]) ?? []).map((l): OrderLine => ({
    item_id: (l.menu_item_id as string) ?? "", name: l.name as string, qty: l.qty as number, price_cents: l.price_cents as number,
  }));
  return {
    id: String(o.id), restaurant_id: o.restaurant_id as string, customer_id: o.customer_id as string, status: o.status as OrderStatus,
    lines, subtotal_cents: o.subtotal_cents as number, delivery_fee_cents: o.delivery_fee_cents as number,
    address: o.address as string, phone: o.phone as string, prep_minutes: (o.prep_minutes as number) ?? null,
    ready_at: (o.ready_at as string) ?? null, bids, created_at: o.created_at as string, delivered_at: (o.delivered_at as string) ?? null,
    accepted_at: (o.accepted_at as string) ?? null,
  };
}

async function loadCatalog() {
  const sb = getSupabase()!;
  const [r, m] = await Promise.all([
    sb.from("restaurants").select("*").eq("active", true).order("name"),
    sb.from("menu_items").select("*").eq("available", true),
  ]);
  set((s) => ({ ...s, restaurants: (r.data as Restaurant[]) ?? [], menuItems: (m.data as MenuItem[]) ?? [] }));
}

async function loadUserData() {
  const sb = getSupabase()!;
  const { data: { user } } = await sb.auth.getUser();
  if (!user) { set((s) => ({ ...s, signedIn: null, profile: null, orders: [], earnings: [], ready: true })); return; }
  const { data: p } = await sb.from("profiles").select("id, role, full_name, restaurant_id").eq("id", user.id).maybeSingle();
  const profile: Profile = { id: user.id, email: user.email ?? null, role: (p?.role as Role) ?? "customer", full_name: p?.full_name ?? null, restaurant_id: p?.restaurant_id ?? null };
  const [o, e] = await Promise.all([
    sb.from("orders").select("*, order_items(*), bids(*)").order("id", { ascending: true }).limit(200),
    sb.from("earnings").select("*, orders(restaurant_id)").order("earned_at", { ascending: true }),
  ]);
  const names = new Map(state.restaurants.map((r) => [r.id, r.name.replace(" (example)", "")]));
  const earnings: Earning[] = ((e.data as Row[]) ?? []).map((x) => ({
    id: x.id as string, rider_id: x.rider_id as string, order_id: String(x.order_id), amount_cents: x.amount_cents as number,
    earned_at: x.earned_at as string, payout_id: (x.payout_id as string) ?? null,
    restaurant_name: names.get((x.orders as Row | null)?.restaurant_id as string) ?? "Order #" + x.order_id,
  }));
  set((s) => ({ ...s, signedIn: user.email ?? "account", profile, orders: ((o.data as Row[]) ?? []).map(mapOrder), earnings, ready: true }));
}

let refetchTimer: ReturnType<typeof setTimeout> | undefined;
const refetchSoon = () => { clearTimeout(refetchTimer); refetchTimer = setTimeout(() => void loadUserData(), 250); };

async function initSupabase() {
  const sb = getSupabase()!;
  await loadCatalog();
  await loadUserData();
  sb.auth.onAuthStateChange(() => refetchSoon());
  sb.channel("fp-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, refetchSoon)
    .on("postgres_changes", { event: "*", schema: "public", table: "bids" }, refetchSoon)
    .subscribe();
}

async function run(p: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await p;
  if (error) throw new Error(error.message);
  refetchSoon();
}

const authRedirect = () => window.location.origin + (process.env.NEXT_PUBLIC_BASE_PATH ?? "") + "/";

// ---------------- Actions (async in both modes) ----------------
export const actions = {
  // --- auth ---
  async signInWithPassword(email: string, password: string) {
    const sb = getSupabase();
    if (!sb) { set((s) => ({ ...s, signedIn: email || "email" })); return "Signed in (mock)"; }
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    await loadUserData();
    return "Signed in";
  },
  async signUp(email: string, password: string) {
    const sb = getSupabase();
    if (!sb) { set((s) => ({ ...s, signedIn: email || "email" })); return "Account created (mock)"; }
    const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: authRedirect() } });
    if (error) throw new Error(error.message);
    if (!data.session) return "Check your email to confirm your account";
    await loadUserData();
    return "Account created";
  },
  async magicLink(email: string) {
    const sb = getSupabase();
    if (!sb) { set((s) => ({ ...s, signedIn: email || "email" })); return "Signed in (mock)"; }
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: authRedirect() } });
    if (error) throw new Error(error.message);
    return "Check your email for a login link";
  },
  async oauth(provider: "google" | "apple") {
    const sb = getSupabase();
    if (!sb) { set((s) => ({ ...s, signedIn: provider })); return `Signed in with ${provider} (mock)`; }
    const { error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo: authRedirect() } });
    if (error) throw new Error(error.message);
    return "Redirecting…";
  },
  async signOut() {
    const sb = getSupabase();
    if (sb) await sb.auth.signOut();
    set((s) => ({ ...s, signedIn: null, profile: null, orders: sb ? [] : s.orders }));
  },

  // --- cart (local in both modes) ---
  setQty(restaurant_id: string, item_id: string, qty: number) {
    set((s) => {
      const base = s.cart.restaurant_id === restaurant_id ? { ...s.cart.qty } : {};
      if (qty <= 0) delete base[item_id]; else base[item_id] = qty;
      return { ...s, cart: { restaurant_id, qty: base } };
    });
  },

  // --- customer ---
  async placeOrder(address: string, phone: string): Promise<string> {
    const { restaurant_id, qty } = state.cart;
    const lines: OrderLine[] = Object.entries(qty).map(([item_id, q]) => {
      const it = state.menuItems.find((m) => m.id === item_id)!;
      return { item_id, name: it.name, qty: q, price_cents: it.price_cents };
    });
    const subtotal = lines.reduce((a, l) => a + l.qty * l.price_cents, 0);
    const sb = getSupabase();
    if (sb) {
      const uid = state.profile?.id;
      if (!uid) throw new Error("Please sign in first");
      // TODO(Mollie): create the payment server-side and only mark paid from the webhook.
      const { data, error } = await sb.from("orders").insert({
        customer_id: uid, restaurant_id, subtotal_cents: subtotal, delivery_fee_cents: DELIVERY_FEE_CENTS, address, phone,
      }).select("id").single();
      if (error) throw new Error(error.message);
      const { error: e2 } = await sb.from("order_items").insert(lines.map((l) => ({ order_id: data.id, menu_item_id: l.item_id, name: l.name, qty: l.qty, price_cents: l.price_cents })));
      if (e2) throw new Error(e2.message);
      set((s) => ({ ...s, cart: { restaurant_id: null, qty: {} } }));
      await loadUserData();
      return String(data.id);
    }
    const id = String(1040 + state.orders.length);
    const order: Order = {
      id, restaurant_id: restaurant_id!, customer_id: "customer-demo", status: "placed", lines, subtotal_cents: subtotal,
      delivery_fee_cents: DELIVERY_FEE_CENTS, address, phone, prep_minutes: null, ready_at: null, bids: [],
      created_at: new Date().toISOString(), delivered_at: null, accepted_at: null,
    };
    set((s) => ({ ...s, orders: [...s.orders, order], cart: { restaurant_id: null, qty: {} } }));
    return id;
  },

  // --- restaurant ---
  async acceptOrder(id: string, prep: number) {
    const now = new Date();
    const p = { status: "accepted" as OrderStatus, prep_minutes: prep, accepted_at: now.toISOString(), ready_at: new Date(now.getTime() + prep * 60000).toISOString() };
    const sb = getSupabase();
    if (sb) return run(sb.from("orders").update(p).eq("id", Number(id)));
    patch(id, p);
  },
  async markReady(id: string) {
    const p = { status: "ready" as OrderStatus, ready_at: new Date().toISOString() };
    const sb = getSupabase();
    if (sb) return run(sb.from("orders").update(p).eq("id", Number(id)));
    patch(id, p);
  },

  // --- rider ---
  async placeBid(id: string, eta: number) {
    const sb = getSupabase();
    if (sb) {
      const uid = state.profile?.id;
      if (!uid) throw new Error("Please sign in as a rider");
      const { data, error } = await sb.from("bids").insert({ order_id: Number(id), rider_id: uid, eta_minutes: eta, rider_name: state.profile?.full_name ?? "Rider" }).select("id").single();
      if (error) throw new Error(error.message);
      // Pilot rule: first valid bid wins immediately.
      return run(sb.rpc("accept_bid", { p_bid: data.id }));
    }
    set((s) => ({
      ...s,
      orders: s.orders.map((o) => o.id !== id ? o : {
        ...o, status: "assigned" as OrderStatus,
        bids: [...o.bids, { id: `b-${Date.now()}`, rider_id: "rider-demo", rider_name: "Sanne", eta_minutes: eta, accepted: true, created_at: new Date().toISOString() }],
      }),
    }));
  },
  async pickUp(id: string) {
    const p = { status: "picked_up" as OrderStatus, picked_up_at: new Date().toISOString() };
    const sb = getSupabase();
    if (sb) return run(sb.from("orders").update(p).eq("id", Number(id)));
    patch(id, { status: "picked_up" });
  },
  async deliver(id: string) {
    const sb = getSupabase();
    // Earnings are credited by a DB trigger in Supabase mode.
    if (sb) return run(sb.from("orders").update({ status: "delivered", delivered_at: new Date().toISOString() }).eq("id", Number(id)));
    set((s) => {
      const o = s.orders.find((x) => x.id === id)!;
      const r = s.restaurants.find((x) => x.id === o.restaurant_id);
      return {
        ...s,
        orders: s.orders.map((x) => x.id === id ? { ...x, status: "delivered" as OrderStatus, delivered_at: new Date().toISOString() } : x),
        earnings: [...s.earnings, { id: `e-${id}`, rider_id: "rider-demo", order_id: id, restaurant_name: (r?.name ?? "").replace(" (example)", ""), amount_cents: o.delivery_fee_cents, earned_at: new Date().toISOString(), payout_id: null }],
      };
    });
  },

  reset() {
    if (state.mode === "mock") set(() => ({ ...initial }));
    else refetchSoon();
  },
};

function patch(id: string, p: Partial<Order>) {
  set((s) => ({ ...s, orders: s.orders.map((o) => (o.id === id ? { ...o, ...p } : o)) }));
}

export const acceptedBid = (o: Order) => o.bids.find((b) => b.accepted) ?? null;

/** In Supabase mode, which roles may use a screen (admin can use all). */
export function canUse(s: State, role: Role) {
  if (s.mode === "mock") return true;
  return s.profile?.role === role || s.profile?.role === "admin";
}

