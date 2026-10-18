"use client";
import { eur } from "@/lib/format";
import { useStore } from "@/lib/store";

/** v28: the current per-delivery rider bonus from settings (admin-editable), so static info pages never go stale. */
export function LiveBonus() {
  const { settings } = useStore();
  return <span data-testid="live-bonus">{eur(settings.rider_bonus_cents ?? 50)}</span>;
}
