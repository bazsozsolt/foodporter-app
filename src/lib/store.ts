"use client";
import { tx } from "@/lib/i18n";
import { ORDER_COLS } from "./orders";
// Data layer. With NEXT_PUBLIC_SUPABASE_* set it uses Supabase (auth, queries, realtime);
// otherwise it falls back to mock data in localStorage so the app always runs.
import { useSyncExternalStore } from "react";
import { PLAN_DEFAULTS, type FeeBand } from "./pricing";
import { eur } from "./format";
import { DELIVERY_FEE_CENTS, menuItems as mockMenu, restaurants as mockRestaurants, seedEarnings } from "./mock-data";
import { getSupabase, hasSupabase } from "./supabase";
import type { Bid, Earning, MenuItem, Order, OrderLine, OrderStatus, Restaurant, Role } from "./types";

export interface Profile { id: string; email: string | null; role: Role; full_name: string | null; restaurant_id: string | null; online?: boolean; location_consent_at?: string | null }
export interface Settings {
  delivery_fee_cents: number; zone_radius_km: number; bid_window_seconds: number;
  restaurant_accept_minutes: number; zone_center_lat: number; zone_center_lng: number; auction_seconds: number; max_active_orders: number; service_fee_cents?: number;
  // v26 business model (financial plan): display only, the server recomputes everything
  delivery_fee_bands?: FeeBand[]; service_fee_on_pickup?: boolean; fee_distance_basis?: "restaurant" | "centre";
  commission_delivery_pct?: number; commission_intro_pct?: number; commission_intro_months?: number; commission_pickup_pct?: number;
  default_contract_kind?: "min_max" | "on_call"; minmax_default_min_h?: number; minmax_default_max_h?: number; rider_bonus_cents?: number;
}
export type PriceBreakdown = { subtotal_cents: number; delivery_fee_cents: number; fee_km: number | null; service_fee_cents: number; tip_cents: number; discount_cents: number; credit_cents: number; total_cents: number };
/** The server total differs from what the customer saw: no payment was created; show the new breakdown and ask again. */
export class PriceChangedError extends Error {
  constructor(public breakdown: PriceBreakdown) { super(tx(`De prijs is bijgewerkt: het totaal is nu ${eur(breakdown.total_cents)}. Controleer het overzicht en betaal opnieuw.`, `The price was updated: the total is now ${eur(breakdown.total_cents)}. Check the breakdown and pay again.`)); }
}
export interface Geo { lat: number; lng: number; label: string; distance_km: number }
export interface State {
  settings: Settings;
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
  settings: { delivery_fee_cents: DELIVERY_FEE_CENTS, zone_radius_km: PLAN_DEFAULTS.zone_radius_km, delivery_fee_bands: PLAN_DEFAULTS.delivery_fee_bands, fee_distance_basis: PLAN_DEFAULTS.fee_distance_basis, service_fee_on_pickup: false, bid_window_seconds: 180, auction_seconds: 60, max_active_orders: 2, restaurant_accept_minutes: 5, zone_center_lat: 51.5576, zone_center_lng: 5.0913, service_fee_cents: PLAN_DEFAULTS.service_fee_cents },
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
    guest_name: (l.guest_name as string) ?? null, line_id: (l.id as string) ?? undefined,
  }));
  return {
    id: String(o.id), restaurant_id: o.restaurant_id as string, customer_id: o.customer_id as string, status: o.status as OrderStatus,
    lines, group_order_id: (o.group_order_id as string) ?? null, subtotal_cents: o.subtotal_cents as number, delivery_fee_cents: o.delivery_fee_cents as number, service_fee_cents: Number(o.service_fee_cents ?? 0), tip_cents: Number(o.tip_cents ?? 0), leave_at_door: Boolean(o.leave_at_door), fulfilment: (o.fulfilment as "delivery" | "pickup") ?? "delivery", scheduled_for: (o.scheduled_for as string) ?? null, release_at: (o.release_at as string) ?? null, discount_cents: Number(o.discount_cents ?? 0), credit_cents: Number(o.credit_cents ?? 0), delivery_photo_path: (o.delivery_photo_path as string) ?? null,
    address: o.address as string, phone: (o.phone as string) ?? "", prep_minutes: (o.prep_minutes as number) ?? null,
    ready_at: (o.ready_at as string) ?? null, bids, created_at: o.created_at as string, delivered_at: (o.delivered_at as string) ?? null,
    accepted_at: (o.accepted_at as string) ?? null, paid_at: (o.paid_at as string) ?? null,
    lat: (o.lat as number) ?? null, lng: (o.lng as number) ?? null, distance_km: o.distance_km == null ? null : Number(o.distance_km), commission_cents: o.commission_cents == null ? null : Number(o.commission_cents), commission_pct: o.commission_pct == null ? null : Number(o.commission_pct), fee_km: o.fee_km == null ? null : Number(o.fee_km), rider_bonus_cents: o.rider_bonus_cents == null ? null : Number(o.rider_bonus_cents),
    cancel_reason: (o.cancel_reason as string) ?? null, refund_status: (o.refund_status as string) ?? null,
    refund_cents: (o.refund_cents as number) ?? null, renotified_at: (o.renotified_at as string) ?? null,
    assigned_at: (o.assigned_at as string) ?? null, bid_window_closes_at: (o.bid_window_closes_at as string) ?? null,
    rider_id: (o.rider_id as string) ?? null, stacked: Boolean(o.stacked),
  };
}

async function loadCatalog() {
  const sb = getSupabase()!;
  const [r, m, st] = await Promise.all([
    sb.from("restaurants").select("*").eq("active", true).order("is_test").order("name").range(0, 1999),
    (async () => {
      const all: MenuItem[] = [];
      for (let from = 0; from < 20000; from += 1000) {
        const { data, error } = await sb.from("menu_items").select("*").eq("available", true).order("id").range(from, from + 999);
        if (error) return { data: all.length ? all : null };
        all.push(...((data as MenuItem[]) ?? []));
        if (!data || data.length < 1000) break;
      }
      return { data: all };
    })(),
    sb.from("settings").select("delivery_fee_cents, zone_radius_km, bid_window_seconds, restaurant_accept_minutes, zone_center_lat, zone_center_lng, auction_seconds, max_active_orders, service_fee_cents, delivery_fee_bands, service_fee_on_pickup, fee_distance_basis, commission_delivery_pct, commission_intro_pct, commission_intro_months, commission_pickup_pct, default_contract_kind, minmax_default_min_h, minmax_default_max_h, rider_bonus_cents").maybeSingle(),
  ]);
  set((s) => ({
    ...s, restaurants: (r.data as Restaurant[]) ?? [], menuItems: (m.data as MenuItem[]) ?? [],
    settings: st.data ? { ...st.data, zone_radius_km: Number(st.data.zone_radius_km) } as Settings : s.settings,
  }));
}

async function loadUserData() {
  const sb = getSupabase()!;
  const { data: { user } } = await sb.auth.getUser();
  if (!user) { set((s) => ({ ...s, signedIn: null, profile: null, orders: [], earnings: [], ready: true })); return; }
  const { data: p } = await sb.from("profiles").select("id, role, full_name, restaurant_id, online, location_consent_at").eq("id", user.id).maybeSingle();
  const profile: Profile = { id: user.id, email: user.email ?? null, role: (p?.role as Role) ?? "customer", full_name: p?.full_name ?? null, restaurant_id: p?.restaurant_id ?? null, online: Boolean(p?.online), location_consent_at: p?.location_consent_at ?? null };
  const [o, e] = await Promise.all([
    sb.from("orders").select(`${ORDER_COLS}, order_items(*), bids(*)`).order("id", { ascending: false }).limit(200),
    sb.from("earnings").select("*, orders(restaurant_id)").order("earned_at", { ascending: true }),
  ]);
  const names = new Map(state.restaurants.map((r) => [r.id, r.name.replace(" (example)", "")]));
  const earnings: Earning[] = ((e.data as Row[]) ?? []).map((x) => ({
    id: x.id as string, rider_id: x.rider_id as string, order_id: String(x.order_id), amount_cents: x.amount_cents as number, tip_cents: Number(x.tip_cents ?? 0),
    earned_at: x.earned_at as string, payout_id: (x.payout_id as string) ?? null,
    restaurant_name: names.get((x.orders as Row | null)?.restaurant_id as string) ?? "Order #" + x.order_id,
  }));
  set((s) => ({ ...s, signedIn: user.email ?? "account", profile, orders: ((o.data as Row[]) ?? []).map(mapOrder).reverse(), earnings, ready: true }));
}

let refetchTimer: ReturnType<typeof setTimeout> | undefined;
const refetchSoon = () => { clearTimeout(refetchTimer); refetchTimer = setTimeout(() => void loadUserData(), 250); };

async function initSupabase() {
  const sb = getSupabase()!;
  await loadCatalog();
  await loadUserData();
  sb.auth.onAuthStateChange((event) => {
    // Password-reset link: land on the "choose a new password" form.
    if (event === "PASSWORD_RECOVERY" && !/\/login\/?$/.test(window.location.pathname)) {
      window.location.assign((process.env.NEXT_PUBLIC_BASE_PATH ?? "") + "/login/?reset=1");
      return;
    }
    refetchSoon();
  });
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

/** Friendlier texts for common Supabase Auth errors. */
function authError(m: string) {
  if (/rate limit/i.test(m)) return tx("Er zijn het afgelopen uur te veel e-mails verstuurd. Probeer het later opnieuw (of vraag het Food Porter-team je account te activeren).", "Too many emails were sent in the last hour. Please try again later (or ask the Food Porter team to enable your account).");
  if (/not authorized/i.test(m)) return tx("Aanmeldmails kunnen nog niet naar dit adres worden verstuurd (pilotlimiet). Vraag het Food Porter-team.", "Sign-up emails can't be delivered to this address yet (pilot mail limits). Please ask the Food Porter team.");
  if (/not confirmed/i.test(m)) return tx("Bevestig eerst je e-mailadres via de link die we je stuurden (kijk ook in spam).", "Please confirm your email first: open the link we emailed you (check spam).");
  if (/should be different/i.test(m)) return tx("Kies een ander wachtwoord dan je huidige.", "Choose a password different from your current one.");
  if (/weak|at least|characters/i.test(m)) return tx("Wachtwoord te zwak: gebruik minstens 8 tekens.", "Password too weak: use at least 8 characters.");
  if (/seconds/i.test(m)) return tx("Even geduld: probeer het over een minuut opnieuw.", "Please wait a minute and try again.");
  if (/already registered|already exists/i.test(m)) return tx("Aanmelden lukt niet met dit adres. Heb je al een account? Log in of herstel je wachtwoord.", "Can't sign up with this address. Already have an account? Sign in or reset your password.");
  if (/invalid login/i.test(m)) return tx("Onjuist e-mailadres of wachtwoord.", "Wrong email or password.");
  return m;
}
const authRedirect = () => window.location.origin + (process.env.NEXT_PUBLIC_BASE_PATH ?? "") + "/";

// ---------------- Actions (async in both modes) ----------------
export const actions = {
  // --- auth ---
  async signInWithPassword(email: string, password: string) {
    const sb = getSupabase();
    if (!sb) { set((s) => ({ ...s, signedIn: email || "email" })); return "Signed in (mock)"; }
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(authError(error.message));
    await loadUserData();
    return "Signed in";
  },
  async signUp(email: string, password: string) {
    const sb = getSupabase();
    if (password.length < 8) throw new Error(tx("Gebruik een wachtwoord van minstens 8 tekens.", "Use a password of at least 8 characters."));
    if (!sb) { set((s) => ({ ...s, signedIn: email || "email" })); return "Account created (mock)"; }
    const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: authRedirect() } });
    if (error) throw new Error(authError(error.message));
    if (!data.session) return "✉️ " + tx("Kijk in je e-mail (en spam) voor de bevestigingslink en log daarna in", "Check your email (and spam folder) for the confirmation link, then come back and sign in");
    await loadUserData();
    return "Account created";
  },
  async magicLink(email: string) {
    const sb = getSupabase();
    if (!sb) { set((s) => ({ ...s, signedIn: email || "email" })); return "Signed in (mock)"; }
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: authRedirect() } });
    if (error) throw new Error(authError(error.message));
    return "✉️ " + tx("Kijk in je e-mail voor een inloglink", "Check your email for a login link");
  },
  async oauth(provider: "google" | "apple") {
    const sb = getSupabase();
    if (!sb) { set((s) => ({ ...s, signedIn: provider })); return `Signed in with ${provider} (mock)`; }
    const { error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo: authRedirect() } });
    if (error) throw new Error(error.message);
    return "Redirecting…";
  },
  /** Always answers the same way, whether or not the address has an account (no user enumeration). */
  async resetPassword(email: string) {
    const sb = getSupabase();
    const sent = "✉️ " + tx("Als er een account bij dit adres hoort, sturen we een link om je wachtwoord te herstellen. Kijk ook in spam.", "If an account exists for this address, we've emailed a link to reset your password. Check spam too.");
    if (!sb) return sent;
    const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: authRedirect() });
    if (error && /rate limit|seconds/i.test(error.message)) throw new Error(authError(error.message));
    return sent;
  },
  async updatePassword(password: string) {
    const sb = getSupabase();
    if (password.length < 8) throw new Error(tx("Gebruik minstens 8 tekens.", "Use at least 8 characters."));
    if (!sb) return tx("Wachtwoord gewijzigd", "Password changed");
    const { error } = await sb.auth.updateUser({ password });
    if (error) throw new Error(authError(error.message));
    return tx("Wachtwoord gewijzigd", "Password changed");
  },
  async signOut() {
    const sb = getSupabase();
    await (await import("@/lib/push")).disablePush(); // this device stops getting this user's pushes
    if (sb) await sb.auth.signOut();
    set((s) => ({ ...s, signedIn: null, profile: null, orders: sb ? [] : s.orders }));
    window.location.assign((process.env.NEXT_PUBLIC_BASE_PATH ?? "") + "/login/"); // full reload drops any in-memory data of the old user
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
  async placeOrder(address: string, phone: string, geo?: Geo | null, opts: { leaveAtDoor?: boolean; pickup?: boolean } = {}): Promise<string> {
    const { restaurant_id, qty } = state.cart;
    const lines: OrderLine[] = Object.entries(qty).map(([item_id, q]) => {
      const it = state.menuItems.find((m) => m.id === item_id)!;
      return { item_id, name: it.name, qty: q, price_cents: it.price_cents };
    });
    const subtotal = lines.reduce((a, l) => a + l.qty * l.price_cents, 0);
    const sb = getSupabase();
    if (sb) {
      const uid = state.profile?.id;
      if (!uid) throw new Error(tx("Log eerst in", "Please sign in first"));
      const { data, error } = await sb.from("orders").insert({
        customer_id: uid, restaurant_id, subtotal_cents: subtotal, delivery_fee_cents: state.settings.delivery_fee_cents, address, phone,
        status: "awaiting_payment", leave_at_door: !opts.pickup && Boolean(opts.leaveAtDoor), fulfilment: opts.pickup ? "pickup" : "delivery", ...(geo ? { lat: geo.lat, lng: geo.lng, distance_km: Math.round(geo.distance_km * 100) / 100 } : {}),
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
      delivery_fee_cents: state.settings.delivery_fee_cents, address, phone, prep_minutes: null, ready_at: null, bids: [],
      created_at: new Date().toISOString(), delivered_at: null, accepted_at: null,
    };
    set((s) => ({ ...s, orders: [...s.orders, order], cart: { restaurant_id: null, qty: {} } }));
    return id;
  },

  /** Supabase mode: create a Mollie payment server-side and return the checkout URL. */
  async startPayment(orderId: string, tipCents = 0, extra: { promo_code?: string; use_credit?: boolean; scheduled_for?: string | null; leave_at_door?: boolean; expected_total_cents?: number } = {}): Promise<string> {
    const sb = getSupabase();
    if (!sb) throw new Error("Payments need Supabase");
    const { data, error } = await sb.functions.invoke("create-payment", { body: { order_id: Number(orderId), tip_cents: tipCents, ...extra } });
    if (error) {
      let msg = error.message;
      let body: { error?: string; code?: string; breakdown?: PriceBreakdown } = {};
      try { const ctx = (error as { context?: Response }).context; if (ctx) { body = await ctx.json(); msg = body.error ?? msg; } } catch { /* ignore */ }
      if (body.code === "price_changed" && body.breakdown) throw new PriceChangedError(body.breakdown);
      throw new Error(msg);
    }
    if (!data?.checkoutUrl) throw new Error("No checkout URL returned");
    return data.checkoutUrl as string;
  },

  // --- restaurant ---
  async acceptOrder(id: string, prep: number) {
    const now = new Date();
    const p = { status: "accepted" as OrderStatus, prep_minutes: prep, accepted_at: now.toISOString(), ready_at: new Date(now.getTime() + prep * 60000).toISOString() };
    const sb = getSupabase();
    if (sb) return run(sb.from("orders").update(p).eq("id", Number(id)));
    patch(id, p);
  },
  /** Restaurant runs late: add minutes to prep (before "ready"); ready_at moves with it, realtime updates others. */
  async extendPrep(id: string, addMinutes: number) {
    const o = state.orders.find((x) => x.id === id);
    if (!o) throw new Error("Order not found");
    const prep = Math.min(120, (o.prep_minutes ?? 0) + addMinutes);
    const base = new Date(o.accepted_at ?? o.created_at).getTime();
    const p = { prep_minutes: prep, ready_at: new Date(base + prep * 60000).toISOString() };
    patch(id, p); // optimistic: show the new time immediately
    const sb = getSupabase();
    if (sb) return run(sb.from("orders").update(p).eq("id", Number(id)));
  },
  /** Reject before accepting: the DB cancels the order and the order-refund function refunds it via Mollie. */
  async rejectOrder(id: string) {
    const sb = getSupabase();
    if (sb) return run(sb.from("orders").update({ status: "cancelled", cancel_reason: "restaurant_rejected" }).eq("id", Number(id)));
    patch(id, { status: "cancelled", cancel_reason: "restaurant_rejected" });
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
      const { data, error } = await sb.from("bids").insert({ order_id: Number(id), rider_id: uid, eta_minutes: eta }).select("id").single();
      if (error) throw new Error(error.message.includes("row-level security") ? "Bidding for this order has closed" : error.message.includes("duplicate") ? "You already bid on this order" : error.message);
      // Auction: the window closes 60 s after the first bid; lowest ETA wins (ties: earliest). Settled server-side.
      return run(Promise.resolve({ error: null, data }));
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
  /** Pickup order collected at the counter (restaurant). */
  async collect(id: string) {
    const sb = getSupabase();
    if (sb) return run(sb.from("orders").update({ status: "delivered" }).eq("id", Number(id)));
    patch(id, { status: "delivered" as OrderStatus, delivered_at: new Date().toISOString() });
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
        earnings: [...s.earnings, { id: `e-${id}`, rider_id: "rider-demo", order_id: id, restaurant_name: (r?.name ?? "").replace(" (example)", ""), amount_cents: (o.fulfilment === "pickup" ? 0 : s.settings.rider_bonus_cents ?? 50) + (o.tip_cents ?? 0), earned_at: new Date().toISOString(), payout_id: null }],
      };
    });
  },

  /** Put the (still available) items of a past order back in the cart. Returns how many lines were skipped. */
  reorder(orderId: string) {
    const o = state.orders.find((x) => x.id === orderId);
    if (!o) throw new Error("Order not found");
    if (!state.restaurants.some((r) => r.id === o.restaurant_id && r.active)) throw new Error("This restaurant is not available right now");
    const qty: Record<string, number> = {};
    let skipped = 0;
    for (const l of o.lines) {
      if (state.menuItems.some((m) => m.id === l.item_id)) qty[l.item_id] = (qty[l.item_id] ?? 0) + l.qty; else skipped++;
    }
    if (Object.keys(qty).length === 0) throw new Error("None of these items are available anymore");
    set((s) => ({ ...s, cart: { restaurant_id: o.restaurant_id, qty } }));
    return skipped;
  },
  async rate(orderId: string, food: number, rider: number | null, comment: string) {
    const sb = getSupabase();
    if (!sb) return;
    const { error } = await sb.from("ratings").insert({ order_id: Number(orderId), food_stars: food, rider_stars: rider, comment: comment.trim() || null });
    if (error) throw new Error(error.message.includes("duplicate") ? "You already rated this order" : error.message);
    return true;
  },
  /** Rider availability. Going online the first time records location-sharing consent. */
  async setOnline(online: boolean, consent = false) {
    const sb = getSupabase();
    const uid = state.profile?.id;
    if (!sb || !uid) return true;
    const p: Record<string, unknown> = { online };
    if (consent && !state.profile?.location_consent_at) p.location_consent_at = new Date().toISOString();
    const { error } = await sb.from("profiles").update(p).eq("id", uid);
    if (error) throw new Error(error.message);
    set((s) => ({ ...s, profile: s.profile ? { ...s.profile, online, location_consent_at: (p.location_consent_at as string) ?? s.profile.location_consent_at } : s.profile }));
    return true;
  },
  async setMyName(name: string) {
    const sb = getSupabase();
    const uid = state.profile?.id;
    if (!sb || !uid) return;
    const { error } = await sb.from("profiles").update({ full_name: name.trim() || null }).eq("id", uid);
    if (error) throw new Error(error.message);
    set((s) => ({ ...s, profile: s.profile ? { ...s.profile, full_name: name.trim() || null } : s.profile }));
    return true;
  },
  reloadUser() { if (state.mode === "supabase") void loadUserData(); },
  reloadCatalog() { if (state.mode === "supabase") void loadCatalog(); },
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

