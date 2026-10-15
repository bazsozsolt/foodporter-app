"use client";
import { useT } from "@/lib/i18n";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button, Card, Chips, Empty, Header } from "@/components/ui";
import { act } from "@/lib/act";
import { eur } from "@/lib/format";
import { actions, useStore, type Geo } from "@/lib/store";
import { AddressField } from "@/components/AddressField";
import { hasSupabase } from "@/lib/supabase";
import { orderHref } from "@/lib/orders";
import { TestModeCheckoutNote } from "@/components/TestModeBanner";
import { ArrowLeft, Lock, ShoppingBag } from "lucide-react";

export default function CheckoutPage() {
  const { cart, signedIn, menuItems, settings, restaurants } = useStore();
  const rest = restaurants.find((x) => x.id === cart.restaurant_id);
  const SERVICE = settings.service_fee_cents ?? 0;
  const [geo, setGeo] = useState<Geo | null>(null);
  const center = useMemo(() => ({ lat: settings.zone_center_lat, lng: settings.zone_center_lng }), [settings.zone_center_lat, settings.zone_center_lng]);
  const outOfZone = hasSupabase && (!geo || geo.distance_km > settings.zone_radius_km);
  const DELIVERY_FEE_CENTS = useStore().settings.delivery_fee_cents;
  const [busy, setBusy] = useState(false);
  const t = useT();
  const router = useRouter();
  const [address, setAddress] = useState("Heuvelstraat 12, 5038 AA Tilburg");
  const [phone, setPhone] = useState("");
  const [method, setMethod] = useState<"iDEAL" | "Card">("iDEAL");
  const sub = Object.entries(cart.qty).reduce((a, [id, q]) => a + q * (menuItems.find((m) => m.id === id)?.price_cents ?? 0), 0);
  const minOrder = rest?.min_order_cents ?? 0;
  const belowMin = sub < minOrder;
  const input = "mb-2.5 mt-1 w-full rounded-xl border border-line p-3";

  if (sub === 0) return <><Header /><main id="main" className="p-4"><Empty icon={<ShoppingBag size={26} />}>{t("Er is niets om af te rekenen.", "Nothing to check out.")} <Link className="text-brand" href="/">{t("Bekijk restaurants", "Browse")}</Link></Empty></main></>;

  async function pay() {
    if (!signedIn) { router.push("/login?next=/checkout"); return; }
    setBusy(true);
    const id = await act(actions.placeOrder(address, phone, geo), hasSupabase ? undefined : `Order placed · Mollie ${method} payment is mocked (no Supabase)`);
    if (!id) { setBusy(false); return; }
    if (!hasSupabase) { setBusy(false); router.push(orderHref(id)); return; }
    // Mollie hosted checkout (iDEAL / card are chosen there); amount is computed server-side.
    const checkoutUrl = await act(actions.startPayment(id));
    setBusy(false);
    if (checkoutUrl) window.location.href = checkoutUrl;
    else router.push(orderHref(id)); // order exists unpaid; tracking page offers "Pay now"
  }

  return (
    <>
      <Header />
      <main id="main" className="p-4">
        <Link href="/cart" className="inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-muted"><ArrowLeft size={16} aria-hidden />{t("Terug naar winkelmand", "Back to cart")}</Link>
        <h1 className="my-3 text-[28px]">{t("Afrekenen", "Checkout")}</h1>
        <Card>
          <label className="text-[13px] text-muted">{t("Bezorgadres", "Delivery address")}</label>
          <AddressField value={address} onChange={setAddress} geo={geo} onGeo={setGeo} center={center} radiusKm={settings.zone_radius_km} />
          <label className="text-[13px] text-muted">{t("Telefoon (voor SMS-updates)", "Phone (for SMS updates)")}</label>
          <input className={input} data-testid="phone" type="tel" placeholder={t("Mobiel nummer, bv. 06 12345678", "Mobile number, e.g. 06 12345678")} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Card>
        <Card data-testid="price-breakdown">
          <b className="mb-2 block">{t("Prijsoverzicht", "Price breakdown")}</b>
          <div className="flex justify-between text-sm"><span>{t("Gerechten", "Items")}</span><span>{eur(sub)}</span></div>
          <div className="flex justify-between text-sm"><span>{t("Bezorgkosten (vast, 100% voor de rider)", "Delivery fee (flat, 100% to the rider)")}</span><span>{eur(DELIVERY_FEE_CENTS)}</span></div>
          <div className="flex justify-between text-sm"><span>{t("Servicekosten", "Service fee")}</span><span>{eur(SERVICE)}</span></div>
          <hr className="my-2 border-line" />
          <div className="flex justify-between font-bold" data-testid="total"><span>{t("Totaal (incl. btw)", "Total (incl. VAT)")}</span><span>{eur(sub + DELIVERY_FEE_CENTS + SERVICE)}</span></div>
          {belowMin && <p data-testid="min-order-warning" className="mt-2 rounded-xl bg-gold-soft p-2 text-[13px] text-warn">{t(`Minimale bestelling bij dit restaurant is ${eur(minOrder)}. Voeg nog ${eur(minOrder - sub)} toe.`, `This restaurant's minimum order is ${eur(minOrder)}. Add ${eur(minOrder - sub)} more.`)}</p>}
        </Card>
        <TestModeCheckoutNote />
        <Card><b>{t("Betalen met Mollie", "Pay with Mollie")}</b><div className="mt-2"><Chips options={["iDEAL", "Card"] as const as ("iDEAL" | "Card")[]} render={(v) => v === "Card" ? t("Kaart", "Card") : v} value={method} onChange={setMethod} /></div></Card>
        <Button icon={<Lock size={16} aria-hidden />} onClick={pay} disabled={busy || belowMin || (Boolean(signedIn) && (outOfZone || phone.replace(/\D/g, "").length < 9))}>{busy ? t("Doorsturen naar Mollie…", "Redirecting to Mollie…") : signedIn ? t(`Betaal ${eur(sub + DELIVERY_FEE_CENTS + SERVICE)} met ${method === "Card" ? "kaart" : method}`, `Pay ${eur(sub + DELIVERY_FEE_CENTS + SERVICE)} with ${method}`) : t("Log in om te betalen", "Sign in to pay")}</Button>
        <p className="mt-3 text-center text-xs text-muted">{t("Door te betalen ga je akkoord met onze", "By paying you agree to our")} <Link className="underline" href="/terms">{t("Voorwaarden", "Terms")}</Link> {t("en", "and")} <Link className="underline" href="/privacy">{t("Privacybeleid", "Privacy policy")}</Link>. {t("Geannuleerde bestellingen worden volledig terugbetaald.", "Cancelled orders are refunded in full.")}</p>
      </main>
    </>
  );
}
