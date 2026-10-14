"use client";
import Link from "next/link";
import { Card, Header, Pill } from "@/components/ui";
import { eur } from "@/lib/format";
import { useStore } from "@/lib/store";
import { STATUS_LABEL } from "@/lib/types";
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
      <main className="p-4">
        <InstallPrompt />
        <Card className="bg-ink text-white">
          <p className="font-display text-2xl leading-none text-gold">{t("Zo werkt het", "How it works")}</p>
          <p className="mt-1 text-[13px] text-white/85">{t(`Riders bieden hun bezorgtijd · vaste bezorgkosten ${eur(DELIVERY_FEE_CENTS)}, 100% voor de rider · binnen ${useStore().settings.zone_radius_km} km van het centrum`, `Riders bid their delivery time · flat ${eur(DELIVERY_FEE_CENTS)} fee, 100% to the rider · within ${useStore().settings.zone_radius_km} km of the centre`)}</p>
          <Link href="/welcome" className="mt-2 inline-block text-xs font-bold text-gold underline">{t("Meer uitleg →", "Learn more →")}</Link>
        </Card>
        {ready && !signedIn && (
          <Card className="flex items-center justify-between bg-brand-soft">
            <span className="text-sm">{t("Log in om te bestellen", "Sign in to order")}</span>
            <Link href="/login" className="rounded-xl bg-brand px-3 py-2 text-sm font-bold text-white">{t("Inloggen", "Sign in")}</Link>
          </Card>
        )}
        {active && (
          <Link href={orderHref(active.id)}><Card className="flex items-center justify-between bg-brand-soft"><b>{t("Volg bestelling", "Track order")} #{active.id}</b><Pill>{STATUS_LABEL[active.status]}</Pill></Card></Link>
        )}
        {signedIn && <Link href="/my-orders" className="mb-3 block text-right text-sm font-semibold text-brand">{t("Je bestellingen & opnieuw bestellen →", "Your orders & reorder →")}</Link>}
        <h2 className="mb-3 mt-1 text-lg font-bold">{t("Restaurants bij jou in de buurt", "Restaurants near you")}</h2>
        {ready && restaurants.length === 0 && <p className="text-sm text-muted">No restaurants yet (seed the database).</p>}
        <RestaurantList restaurants={restaurants} orders={orders} profileId={profile?.id} fee={DELIVERY_FEE_CENTS} />
        <Footer />
      </main>
    </>
  );
}
