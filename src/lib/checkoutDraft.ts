/** Persist checkout fields across an AppShell language-toggle remount (session only). */
export const CHECKOUT_DRAFT_KEY = "fp-checkout-draft";

export type CheckoutDraftQuote = {
  q: { code: string | null; kind: string | null; discount_cents: number; credit_cents: number; error: string | null } | null;
  code: string;
  credit: boolean;
};

export type CheckoutDraftGeo = { lat: number; lng: number; label: string; distance_km: number };

export type CheckoutDraft = {
  restaurant_id: string | null;
  address: string;
  phone: string;
  tip: number;
  customTip: string;
  door: boolean;
  pickup: boolean;
  method: "iDEAL" | "Card";
  when: string | null;
  quote: CheckoutDraftQuote;
  geo: CheckoutDraftGeo | null;
};

export function loadCheckoutDraft(restaurantId: string | null): CheckoutDraft | null {
  try {
    const raw = sessionStorage.getItem(CHECKOUT_DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as CheckoutDraft;
    if (!d || typeof d !== "object") return null;
    if ((d.restaurant_id ?? null) !== (restaurantId ?? null)) return null;
    return d;
  } catch {
    return null;
  }
}

export function saveCheckoutDraft(d: CheckoutDraft): void {
  try { sessionStorage.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify(d)); } catch { /* private mode */ }
}

export function clearCheckoutDraft(): void {
  try { sessionStorage.removeItem(CHECKOUT_DRAFT_KEY); } catch { /* private mode */ }
}
