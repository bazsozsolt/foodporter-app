"use client";
import Link from "next/link";
import { Card, Header } from "@/components/ui";
import { Bike, ChevronRight, Info } from "lucide-react";
import { eur } from "@/lib/format";
import { useStore } from "@/lib/store";
import { statusLabel } from "@/lib/types";
import { orderHref } from "@/lib/orders";
import { Footer } from "@/components/Footer";
import { InstallPrompt } from "@/components/InstallPrompt";
import { RestaurantList } from "@/components/RestaurantList";
import { useT } from "@/lib/i18n";

export default function Home() {
  const { orders, signedIn, restaurants, ready, profile } = useStore();
  const DELIVERY_FEE_CENTS = useStore().settings.delivery_fee_cents;
  // Show the signed-in customer's own latest open order (admins can see everyone's orders, so filter by owner)
  const t = useT();
  const active = [...orders].reverse().find((o) => (!profile || o.customer_id === profile.id) && !["delivered", "cancelled", "payment_failed"].includes(o.status));
  return (
    <>
      <Header subtitle={t("Bezorgen in Tilburg Centrum", "Delivering in Tilburg Centrum")} />
      <main id="main" className="px-4 pb-4 pt-3">
        <InstallPrompt />
        <div className="min-h-[52px]">
        {ready && !signedIn && (
          <Card className="flex items-center justify-between !py-3">
            <span className="text-sm">{t("Log in om te bestellen", "Sign in to order")}</span>
            <Link href="/login" className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white">{t("Inloggen", "Sign in")}</Link>
          </Card>
        )}
        {active && (
          <Link href={orderHref(active.id)} data-testid="active-order"><Card className="flex items-center gap-3 !bg-brand !py-3 text-white"><Bike size={22} aria-hidden /><span className="flex-1"><b className="block">{t("Volg bestelling", "Track order")} #{active.id}</b><span className="text-[13px] text-white/85">{statusLabel(active.status)}</span></span><ChevronRight size={18} aria-hidden /></Card></Link>
        )}
        </div>
        <RestaurantList restaurants={restaurants} orders={orders} profileId={profile?.id} fee={DELIVERY_FEE_CENTS} />
        {ready && restaurants.length === 0 && <p className="text-sm text-muted">{t("Nog geen restaurants beschikbaar. Kom straks terug.", "No restaurants available yet. Check back soon.")}</p>}
        {!restaurants.length && <div className="min-h-[100vh]" />}
        <Link href="/welcome" className="mt-4 flex items-center gap-3 rounded-2xl bg-white p-4 text-sm shadow-[var(--shadow-card)] ring-1 ring-black/[.04]">
          <Info size={20} className="shrink-0 text-brand" aria-hidden />
          <span className="flex-1"><b className="block">{t("Zo werkt Food Porter", "How Food Porter works")}</b><span className="text-[13px] text-muted">{t(`Riders bieden hun bezorgtijd · vaste bezorgkosten ${eur(DELIVERY_FEE_CENTS)}, 100% voor de rider`, `Riders bid their delivery time · flat ${eur(DELIVERY_FEE_CENTS)} fee, 100% to the rider`)}</span></span>
          <ChevronRight size={18} className="text-muted" aria-hidden />
        </Link>
        <Footer />
      </main>
    </>
  );
}
