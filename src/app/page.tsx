"use client";
import Link from "next/link";
import { Card, Header, Pill } from "@/components/ui";
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
      <Header tagline={t("Sneller je avondeten bezorgd in Tilburg, door lokale riders die zelf hun tempo kiezen.", "Faster dinner delivery in Tilburg, driven by local riders who choose their own speed.")} subtitle={t("Tilburg Centrum · lokale zaken, riders bieden op de snelste bezorging", "Tilburg Centrum · local spots, riders bid to deliver fast")} />
      <main id="main" className="p-4">
        <InstallPrompt />
        <Card className="bg-ink text-white">
          <p className="font-display text-2xl leading-none text-gold">{t("Zo werkt het", "How it works")}</p>
          <p className="mt-1 text-[13px] text-white/85">{t(`Riders bieden hun bezorgtijd · vaste bezorgkosten ${eur(DELIVERY_FEE_CENTS)}, 100% voor de rider · binnen ${useStore().settings.zone_radius_km} km van het centrum`, `Riders bid their delivery time · flat ${eur(DELIVERY_FEE_CENTS)} fee, 100% to the rider · within ${useStore().settings.zone_radius_km} km of the centre`)}</p>
          <Link href="/welcome" className="mt-2 inline-block text-xs font-bold text-gold underline">{t("Meer uitleg →", "Learn more →")}</Link>
        </Card>
        {/* Reserved slot: the login prompt or the signed-in shortcuts appear after auth loads; a fixed height avoids pushing the list down (CLS). */}
        <div className="min-h-[76px]">
        {ready && !signedIn && (
          <Card className="flex items-center justify-between bg-brand-soft">
            <span className="text-sm">{t("Log in om te bestellen", "Sign in to order")}</span>
            <Link href="/login" className="rounded-xl bg-brand px-3 py-2 text-sm font-bold text-white">{t("Inloggen", "Sign in")}</Link>
          </Card>
        )}
        {active && (
          <Link href={orderHref(active.id)}><Card className="flex items-center justify-between bg-brand-soft"><b>{t("Volg bestelling", "Track order")} #{active.id}</b><Pill>{statusLabel(active.status)}</Pill></Card></Link>
        )}
        {signedIn && (
          <div className="mb-3 flex gap-2">
            <Link href="/group" data-testid="nav-groups" className="flex-1 rounded-2xl border-2 border-dashed border-brand bg-gold-soft px-3 py-2.5 text-sm font-bold text-brand">👥 {t("Samen bestellen", "Order together")}<span className="block text-[11px] font-normal text-muted">{t("Mijn groepen · code invoeren", "My groups · enter a code")}</span></Link>
            <Link href="/my-orders" className="flex-1 rounded-2xl bg-white px-3 py-2.5 text-sm font-bold text-ink shadow-sm">🧾 {t("Mijn bestellingen", "My orders")}<span className="block text-[11px] font-normal text-muted">{t("Status & opnieuw bestellen", "Status & reorder")}</span></Link>
          </div>
        )}
        </div>
        <h2 className="mb-3 mt-1 text-lg font-bold">{t("Restaurants bij jou in de buurt", "Restaurants near you")}</h2>
        {ready && restaurants.length === 0 && <p className="text-sm text-muted">{t("Nog geen restaurants beschikbaar. Kom straks terug.", "No restaurants available yet. Check back soon.")}</p>}
        <div className={restaurants.length ? "" : "min-h-[100vh]"}><RestaurantList restaurants={restaurants} orders={orders} profileId={profile?.id} fee={DELIVERY_FEE_CENTS} /></div>{/* keeps the footer below the fold until the list loads (CLS) */}
        <Footer />
      </main>
    </>
  );
}
