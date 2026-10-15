"use client";
import { WifiOff } from "lucide-react";
import { useSyncExternalStore } from "react";
import { tx } from "@/lib/i18n";

const sub = (f: () => void) => { window.addEventListener("online", f); window.addEventListener("offline", f); return () => { window.removeEventListener("online", f); window.removeEventListener("offline", f); }; };

/** Sticky notice when the phone loses its connection (orders, bids and payments need the network). */
export function NetworkBanner() {
  const online = useSyncExternalStore(sub, () => navigator.onLine, () => true);
  if (online) return null;
  return (
    <div role="alert" data-testid="offline-banner" className="sticky top-0 z-50 bg-ink px-4 py-2 text-center text-[13px] font-semibold text-white">
      <WifiOff size={14} className="mr-1.5 inline" aria-hidden />{tx("Geen internetverbinding. Bestellingen en biedingen worden bijgewerkt zodra je weer online bent.", "No internet connection. Orders and bids update as soon as you're back online.")}
    </div>
  );
}
