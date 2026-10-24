"use client";
import { Bike, Store } from "lucide-react";
import { tx } from "@/lib/i18n";
import { LiveText } from "@/components/LiveBonus";
import Link from "next/link";
import { Footer } from "@/components/Footer";


const Step = ({ n, t, d }: { n: string; t: string; d: string }) => (
  <div className="flex gap-3 rounded-2xl bg-white p-4 shadow-sm">
    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand font-extrabold text-white">{n}</div>
    <div><b>{t}</b><p className="text-sm text-muted">{d}</p></div>
  </div>
);

export function WelcomeView() {
  return (
    <main>
      <section className="bg-gradient-to-br from-brand to-brand-dark px-5 pb-10 pt-12 text-white">
        <div className="text-sm font-bold opacity-90">Food Porter · Tilburg</div>
        <h1 className="mt-3 text-[28px] font-extrabold leading-tight">{tx("Sneller je avondeten bezorgd in Tilburg, door lokale riders die zelf hun tempo kiezen.", "Faster dinner delivery in Tilburg, driven by local riders who choose their own speed.")}</h1>
        <p className="mt-3 text-white/90">{tx("Bestel bij de favoriete zelfstandige keukens van de stad. Riders bieden de bezorgtijd die ze echt halen, en jij ziet die voordat je eten vertrekt.", "Order from the city’s favourite independent kitchens. Riders bid the delivery time they can really make, and you see it before your food leaves.")}</p>
        <Link href="/" className="mt-5 inline-block rounded-2xl bg-white px-5 py-3 font-extrabold text-brand shadow">{tx("Nu bestellen →", "Order now →")}</Link>
        <p className="mt-3 text-xs text-white/80"><LiveText t={tx("Tilburg · tot {ZONE} km van het centrum (straks tot 10 km)", "Tilburg · up to {ZONE} km from the centre (soon up to 10 km)")} isEn={tx("nl", "en") === "en"} /></p>
      </section>
      <section className="space-y-2.5 p-4">
        <h2 className="mt-2 text-lg font-bold">{tx("Zo werkt het", "How it works")}</h2>
        <Step n="1" t={tx("Kies een lokale zaak", "Pick a local spot")} d={tx("5–10 zorgvuldig gekozen Tilburgse restaurants. Betaal met iDEAL of kaart.", "5–10 hand-picked Tilburg restaurants. Pay with iDEAL or card.")} />
        <Step n="2" t={tx("Riders bieden hun tijd", "Riders bid their time")} d={tx("Riders in de buurt bieden een aankomsttijd. Meestal weet je binnen 3 minuten wie er komt en wanneer.", "Nearby riders offer an ETA. Usually within 3 minutes you know who’s coming and when.")} />
        <Step n="3" t={tx("Volg het tot aan je deur", "Track it to your door")} d={tx("Live status en SMS: geaccepteerd, onderweg, bezorgd. Daarna beoordeel je je maaltijd.", "Live status and SMS: accepted, on the way, delivered. Then rate your meal.")} />
      </section>
      <section className="grid gap-2.5 p-4 md:grid-cols-2">
        <div className="rounded-2xl bg-ink p-4 text-white">
          <b className="flex items-center gap-2"><Bike size={18} className="text-brand" aria-hidden />{tx("Rijd met ons mee", "Ride with us")}</b>
          <p className="mt-1 text-sm text-white/80">{tx("Vast in dienst met uurloon (minimaal het minimumloon), een bonus per bezorging en 100% van je fooien. Jij geeft je beschikbaarheid op.", "Employed with an hourly wage (at least minimum wage), a bonus per delivery and 100% of your tips. You set your availability.")}</p>
          <Link href="/login?next=/rider" className="mt-2 inline-block text-sm font-bold text-gold underline">{tx("Aanmelden als rider →", "Sign up as a rider →")}</Link>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <b className="flex items-center gap-2"><Store size={18} className="text-brand" aria-hidden />{tx("Partnerrestaurants", "Partner restaurants")}</b>
          <p className="mt-1 text-sm text-muted"><LiveText t={tx("Geen aanmeldkosten. Commissie: {COMM_D}% op bezorgde bestellingen, {COMM_I}% in je eerste {COMM_M} maanden, {COMM_P}% op afhaalbestellingen. Stel per bestelling je eigen bereidingstijd in; wij regelen riders en betalingen.", "No listing fee. Commission: {COMM_D}% on delivered orders, {COMM_I}% in your first {COMM_M} months, {COMM_P}% on pickup orders. Set your own prep time per order; we handle riders and payments.")} isEn={tx("nl", "en") === "en"} /></p>
          <a href="mailto:partners@foodporter.nl" className="mt-2 inline-block text-sm font-bold text-brand underline">{tx("Word partner →", "Become a partner →")}</a>
        </div>
      </section>
      <p className="px-4 text-sm text-muted" data-testid="about-sonic">{tx("Food Porter is een project van Sonic Jobs V.O.F.", "Food Porter is a project powered by Sonic Jobs V.O.F.")}</p>
      <div className="px-4"><Footer /></div>
      <p className="mt-4 px-4 text-xs text-muted">{tx("Testmodus: restaurants met 🧪 zijn testdata uit OpenStreetMap (© OpenStreetMap-bijdragers, ODbL, openstreetmap.org/copyright). Het zijn geen Food Porter-partners; menu’s en prijzen zijn voorbeelden.", "Testing mode: restaurants marked 🧪 are test data imported from OpenStreetMap (© OpenStreetMap contributors, ODbL, openstreetmap.org/copyright). They are not Food Porter partners; menus and prices are examples.")}</p>
    </main>
  );
}
