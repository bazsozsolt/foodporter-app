"use client";
import { useT } from "@/lib/i18n";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button, Card, Chips, Empty, Header } from "@/components/ui";
import { act } from "@/lib/act";
import { eur } from "@/lib/format";
import { actions, PriceChangedError, useStore, type Geo, type PriceBreakdown } from "@/lib/store";
import { feeForKm, feeKm, feeRange } from "@/lib/pricing";
import { AddressField } from "@/components/AddressField";
import { hasSupabase } from "@/lib/supabase";
import { orderHref } from "@/lib/orders";
import { openState } from "@/lib/hours";
import { PromoBox, SchedulePicker, type Quote } from "@/components/CheckoutExtras";
import { TestModeCheckoutNote } from "@/components/TestModeBanner";
import { ArrowLeft, Lock, ShoppingBag } from "lucide-react";

export default function CheckoutPage() {
  const { cart, signedIn, menuItems, settings, restaurants, profile } = useStore();
  const [quote, setQuote] = useState<{ q: Quote | null; code: string; credit: boolean }>({ q: null, code: "", credit: false });
  const [when, setWhen] = useState<string | null>(null);
  const rest = restaurants.find((x) => x.id === cart.restaurant_id);
  const [geo, setGeo] = useState<Geo | null>(null);
  const center = useMemo(() => ({ lat: settings.zone_center_lat, lng: settings.zone_center_lng }), [settings.zone_center_lat, settings.zone_center_lng]);

  const [busy, setBusy] = useState(false);
  const t = useT();
  const router = useRouter();
  const [address, setAddress] = useState("Heuvelstraat 12, 5038 AA Tilburg");
  const [phone, setPhone] = useState("");
  const [tip, setTip] = useState(0);
  const [door, setDoor] = useState(false);
  const [pickup, setPickup] = useState(false);
  const [customTip, setCustomTip] = useState("");
  const [method, setMethod] = useState<"iDEAL" | "Card">("iDEAL");
  const outOfZone = !pickup && hasSupabase && (!geo || geo.distance_km > settings.zone_radius_km);
  // v26: distance-based delivery fee (bands from the financial plan) + service fee on delivery orders; the server recomputes both.
  const km = !pickup && geo ? feeKm(geo, rest, settings.fee_distance_basis) : null;
  const range = feeRange(settings.delivery_fee_bands);
  const DELIVERY_FEE_CENTS = pickup ? 0 : km != null ? feeForKm(settings.delivery_fee_bands, km) : range.min;
  const SERVICE = pickup && !settings.service_fee_on_pickup ? 0 : (settings.service_fee_cents ?? 0);
  const TIP = pickup ? 0 : tip;
  // An order created on an earlier attempt (e.g. the price changed) is reused instead of creating a second one.
  const [pending, setPending] = useState<{ id: string; key: string; server?: PriceBreakdown } | null>(null);
  const sub = Object.entries(cart.qty).reduce((a, [id, q]) => a + q * (menuItems.find((m) => m.id === id)?.price_cents ?? 0), 0);
  const minOrder = rest?.min_order_cents ?? 0;
  const belowMin = sub < minOrder;
  const closedNow = rest ? !openState(rest).open : false;
  const OFF = quote.q && !quote.q.error ? quote.q.discount_cents + quote.q.credit_cents : 0;
  const blockedClosed = closedNow && !when;
  const input = "mb-2.5 mt-1 w-full rounded-xl border border-line p-3";
  const attemptKey = JSON.stringify([pickup, pickup ? "" : address, phone, door, cart.qty]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (pending && pending.key !== attemptKey) setPending(null); }, [attemptKey, pending]);
  const TOTAL = sub + DELIVERY_FEE_CENTS + SERVICE + TIP - OFF;

  if (sub === 0) return <><Header /><main id="main" className="p-4"><Empty icon={<ShoppingBag size={26} />}>{t("Er is niets om af te rekenen.", "Nothing to check out.")} <Link className="text-brand" href="/">{t("Bekijk restaurants", "Browse")}</Link></Empty></main></>;

  async function pay() {
    if (!signedIn) { router.push("/login?next=/checkout"); return; }
    setBusy(true);
    const id = pending?.id ?? await act(actions.placeOrder(pickup ? `Afhalen bij ${rest?.name ?? "restaurant"}` : address, phone, pickup ? null : geo, { leaveAtDoor: door, pickup }), hasSupabase ? undefined : `Order placed · Mollie ${method} payment is mocked (no Supabase)`);
    if (!id) { setBusy(false); return; }
    if (!hasSupabase) { setBusy(false); router.push(orderHref(id)); return; }
    // Mollie hosted checkout (iDEAL / card are chosen there). The server computes the amount; if it differs from what is shown, no payment is created.
    const expected = pending?.server ? pending.server.total_cents : TOTAL;
    let changed: PriceBreakdown | null = null;
    const checkoutUrl = await act(actions.startPayment(id, TIP, { promo_code: quote.code || undefined, use_credit: quote.credit, scheduled_for: when, expected_total_cents: expected })
      .catch((e) => { if (e instanceof PriceChangedError) changed = e.breakdown; throw e; }));
    setBusy(false);
    if (checkoutUrl) window.location.href = checkoutUrl;
    else if (changed) setPending({ id, key: attemptKey, server: changed });
    else router.push(orderHref(id)); // order exists unpaid; tracking page offers "Pay now"
  }

  return (
    <>
      <Header />
      <main id="main" className="p-4">
        <Link href="/cart" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-muted"><ArrowLeft size={16} aria-hidden />{t("Terug naar winkelmand", "Back to cart")}</Link>
        <h1 className="my-3 text-[28px]">{t("Afrekenen", "Checkout")}</h1>
        <div role="radiogroup" aria-label={t("Bezorgen of afhalen", "Delivery or pickup")} className="mb-3 grid grid-cols-2 rounded-xl bg-subtle p-1 text-sm font-semibold" data-testid="fulfilment">
          {([false, true] as const).map((pk) => <button key={String(pk)} type="button" role="radio" aria-checked={pickup === pk} data-testid={pk ? "choose-pickup" : "choose-delivery"} onClick={() => setPickup(pk)} className={`min-h-11 rounded-lg ${pickup === pk ? "bg-white shadow-sm" : "text-muted"}`}>{pk ? t("Afhalen", "Pickup") : t("Bezorgen", "Delivery")}</button>)}
        </div>
        <Card>
          {pickup ? <p data-testid="pickup-address" className="mb-2 text-sm"><b className="block">{t("Afhalen bij", "Collect at")} {rest?.name}</b>{rest?.address ?? ""}<span className="block text-[13px] text-muted">{t("Geen bezorgkosten. Je krijgt een bericht zodra je bestelling klaarstaat.", "No delivery fee. We'll notify you when your order is ready.")}</span></p> : <>
          <label className="text-[13px] text-muted">{t("Bezorgadres", "Delivery address")}</label>
          <AddressField value={address} onChange={setAddress} geo={geo} onGeo={setGeo} center={center} radiusKm={settings.zone_radius_km} />
          <label className="mb-2 flex min-h-11 items-center gap-2 text-sm" data-testid="leave-at-door"><input type="checkbox" checked={door} onChange={(e) => setDoor(e.target.checked)} className="h-5 w-5" />{t("Zet het bij de deur (zonder contact, de rider maakt een foto)", "Leave at the door (contactless, the rider takes a photo)")}</label>
          </>}
          <label className="text-[13px] text-muted">{t("Telefoon (voor SMS-updates)", "Phone (for SMS updates)")}</label>
          <input className={input} data-testid="phone" type="tel" placeholder={t("Mobiel nummer, bv. 06 12345678", "Mobile number, e.g. 06 12345678")} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Card>
        {rest && hasSupabase && <SchedulePicker restaurant={rest} value={when} onChange={setWhen} mustSchedule={closedNow} />}
        {hasSupabase && <PromoBox customerId={profile?.id} subtotal={sub} onQuote={(q, code, credit) => setQuote({ q, code, credit })} />}
        <Card data-testid="price-breakdown">
          <b className="mb-2 block">{t("Prijsoverzicht", "Price breakdown")}</b>
          <div className="flex justify-between text-sm"><span>{t("Gerechten", "Items")}</span><span>{eur(sub)}</span></div>
          <div className="flex justify-between text-sm" data-testid="fee-line"><span>{pickup ? t("Bezorgkosten (afhalen)", "Delivery fee (pickup)") : km != null ? t(`Bezorgkosten (${km.toFixed(1).replace(".", ",")} km)`, `Delivery fee (${km.toFixed(1)} km)`) : t("Bezorgkosten (vanaf)", "Delivery fee (from)")}</span><span>{eur(DELIVERY_FEE_CENTS)}</span></div>
          <div className="flex justify-between text-sm" data-testid="service-line"><span>{t("Servicekosten", "Service fee")}</span><span>{eur(SERVICE)}</span></div>
          <div className="flex justify-between text-sm"><span>{t("Fooi (100% voor de rider)", "Tip (100% to the rider)")}</span><span data-testid="tip-line">{eur(TIP)}</span></div>
          {OFF > 0 && <div className="flex justify-between text-sm text-ok" data-testid="discount-line"><span>{t("Korting en tegoed", "Discount and credit")}</span><span>−{eur(OFF)}</span></div>}
          {when && <div className="flex justify-between text-sm" data-testid="when-line"><span>{t("Gepland voor", "Scheduled for")}</span><span>{new Date(when).toLocaleString("nl-NL", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" })}</span></div>}
          <hr className="my-2 border-line" />
          <div className="flex justify-between font-bold" data-testid="total"><span>{t("Totaal (incl. btw)", "Total (incl. VAT)")}</span><span>{eur(pending?.server?.total_cents ?? TOTAL)}</span></div>
          {!pickup && <p data-testid="fee-explainer" className="mt-2 text-[12px] text-muted">{t(`Bezorgkosten hangen af van de afstand tussen restaurant en adres: ${(settings.delivery_fee_bands ?? []).map((b, i, a) => `${i === 0 ? "t/m" : `${String(a[i - 1].max_km).replace(".", ",")}–`}${String(b.max_km).replace(".", ",")} km ${eur(b.fee_cents)}`).join(" · ")}. Bezorg- en servicekosten (${eur(settings.service_fee_cents ?? 0)}) gaan naar Food Porter voor bezorging en platform; de rider (in loondienst) krijgt uurloon plus een vaste bonus per bezorging, en 100% van je fooi.`, `The delivery fee depends on the distance between the restaurant and your address: ${(settings.delivery_fee_bands ?? []).map((b, i, a) => `${i === 0 ? "up to" : `${a[i - 1].max_km}–`}${b.max_km} km ${eur(b.fee_cents)}`).join(" · ")}. Delivery and service fees (${eur(settings.service_fee_cents ?? 0)}) go to Food Porter for delivery and the platform; the rider (an employee) gets an hourly wage plus a fixed bonus per delivery, and 100% of your tip.`)}</p>}
          {pending?.server && <p data-testid="price-changed" role="status" className="mt-2 rounded-xl bg-gold-soft p-2 text-[13px] text-warn">{t(`Bijgewerkt door de server: bezorgkosten ${eur(pending.server.delivery_fee_cents)}${pending.server.fee_km != null ? ` (${String(pending.server.fee_km).replace(".", ",")} km)` : ""}, servicekosten ${eur(pending.server.service_fee_cents)}. Totaal ${eur(pending.server.total_cents)}.`, `Updated by the server: delivery fee ${eur(pending.server.delivery_fee_cents)}${pending.server.fee_km != null ? ` (${pending.server.fee_km} km)` : ""}, service fee ${eur(pending.server.service_fee_cents)}. Total ${eur(pending.server.total_cents)}.`)}</p>}
          {blockedClosed && <p data-testid="closed-warning" className="mt-2 rounded-xl bg-gold-soft p-2 text-[13px] text-warn">{t("Dit restaurant is nu gesloten of gepauzeerd. Je kunt bestellen zodra het weer open is.", "This restaurant is closed or paused right now. You can order once it reopens.")}</p>}
          {belowMin && <p data-testid="min-order-warning" className="mt-2 rounded-xl bg-gold-soft p-2 text-[13px] text-warn">{t(`Minimale bestelling bij dit restaurant is ${eur(minOrder)}. Voeg nog ${eur(minOrder - sub)} toe.`, `This restaurant's minimum order is ${eur(minOrder)}. Add ${eur(minOrder - sub)} more.`)}</p>}
        </Card>
        {!pickup && <Card data-testid="tip-picker">
          <b className="block">{t("Fooi voor je rider", "Tip your rider")}</b>
          <p className="mb-2 text-[13px] text-muted">{t("Optioneel. De rider krijgt 100% van de fooi.", "Optional. The rider gets 100% of the tip.")}</p>
          <div className="flex flex-wrap gap-2">
            {[0, 100, 200, 300].map((c) => (
              <button key={c} type="button" data-testid={`tip-${c}`} aria-pressed={tip === c && customTip === ""} onClick={() => { setTip(c); setCustomTip(""); }}
                className={`min-h-11 rounded-full px-4 text-sm font-semibold ring-1 ${tip === c && customTip === "" ? "bg-ink text-white ring-ink" : "bg-white ring-line"}`}>{c === 0 ? t("Geen", "None") : eur(c)}</button>
            ))}
            <label className="flex min-h-11 items-center gap-1 rounded-full px-3 text-sm ring-1 ring-line">€
              <input data-testid="tip-custom" inputMode="decimal" aria-label={t("Eigen bedrag", "Custom amount")} placeholder={t("Anders", "Other")} className="w-16 bg-transparent outline-none" value={customTip}
                onChange={(e) => { const v = e.target.value.replace(",", "."); setCustomTip(e.target.value); const c = Math.round(Number(v) * 100); setTip(Number.isFinite(c) ? Math.min(2000, Math.max(0, c)) : 0); }} />
            </label>
          </div>
          <p className="mt-1 text-[12px] text-muted">{t("Maximaal €20.", "Up to €20.")}</p>
        </Card>}
        <TestModeCheckoutNote />
        <Card><b>{t("Betalen met Mollie", "Pay with Mollie")}</b><div className="mt-2"><Chips options={["iDEAL", "Card"] as const as ("iDEAL" | "Card")[]} render={(v) => v === "Card" ? t("Kaart", "Card") : v} value={method} onChange={setMethod} /></div></Card>
        <Button icon={<Lock size={16} aria-hidden />} onClick={pay} disabled={busy || belowMin || blockedClosed || (Boolean(signedIn) && (outOfZone || phone.replace(/\D/g, "").length < 9))}>{busy ? t("Doorsturen naar Mollie…", "Redirecting to Mollie…") : signedIn ? t(`Betaal ${eur(pending?.server?.total_cents ?? TOTAL)} met ${method === "Card" ? "kaart" : method}`, `Pay ${eur(pending?.server?.total_cents ?? TOTAL)} with ${method}`) : t("Log in om te betalen", "Sign in to pay")}</Button>
        <p className="mt-3 text-center text-xs text-muted">{t("Door te betalen ga je akkoord met onze", "By paying you agree to our")} <Link className="underline" href="/terms">{t("Voorwaarden", "Terms")}</Link> {t("en", "and")} <Link className="underline" href="/privacy">{t("Privacybeleid", "Privacy policy")}</Link>. {t("Geannuleerde bestellingen worden volledig terugbetaald.", "Cancelled orders are refunded in full.")}</p>
      </main>
    </>
  );
}
