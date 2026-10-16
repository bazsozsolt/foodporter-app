"use client";
import { PauseBusyPanel, HoursPanel } from "@/components/AvailabilityPanel";
import { RestaurantPhotos } from "@/components/PhotoUpload";
import { useT , tx } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { AlertsBar, useOrderAlerts } from "@/components/OrderAlerts";
import { RoleGate } from "@/components/RoleGate";
import { LegalOnboarding, useLegalStatus } from "@/components/LegalOnboarding";
import { act } from "@/lib/act";
import { Button, Card, Empty, Header, Pill } from "@/components/ui";
import { PREP_MAX, PrepPicker } from "@/components/PrepPicker";
import { HelpButton } from "@/components/SupportSheet";
import { ItemUnavailable } from "@/components/ItemUnavailable";
import { hhmm } from "@/lib/format";
import { eur } from "@/lib/format";
import { actions, useStore } from "@/lib/store";
import { STATUS_LABEL, STATUS_LABEL_NL, type Order } from "@/lib/types";
import { mmss, useSecondsLeft } from "@/components/Countdown";
import { LiveMap } from "@/components/LiveMap";
import { useOrderLocation } from "@/lib/location";
import { OrderChat } from "@/components/OrderChat";
import { useRiderInfo } from "@/lib/orders";
import { AllergenEditor } from "@/components/AllergenEditor";
import { SoldOutPanel } from "@/components/SoldOutPanel";
import { SectionHeader } from "@/components/ui";
import { ChefHat, CircleCheck, Inbox, Users } from "lucide-react";

function Countdown({ from }: { from: string }) {
  const mins = useStore().settings.restaurant_accept_minutes;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const left = Math.max(0, new Date(from).getTime() + mins * 60000 - now);
  const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
  return <p className={`mt-2 text-center text-[13px] ${left < 60000 ? "font-bold text-red-600" : "text-muted"}`}>{left > 0 ? tx(`Accepteer binnen ${m}:${String(s).padStart(2, "0")}, anders wordt de bestelling automatisch geannuleerd en terugbetaald`, `Accept within ${m}:${String(s).padStart(2, "0")} or the order is cancelled and refunded automatically`) : tx("Tijd om — wordt geannuleerd en terugbetaald…", "Time's up — cancelling and refunding…")}</p>;
}

const alertBody = (n: number) => tx(`${n} nieuwe ${n > 1 ? "bestellingen wachten" : "bestelling wacht"} op acceptatie`, `${n} new order${n > 1 ? "s" : ""} waiting for you to accept`);

function OrderCard({ o }: { o: Order }) {
  const t = useT();
  const SL = t("nl", "en") === "nl" ? STATUS_LABEL_NL : STATUS_LABEL;
  const [prep, setPrep] = useState(15);
  const { restaurants, profile } = useStore();
  const r = restaurants.find((x) => x.id === o.restaurant_id);
  const bid = useRiderInfo(o); // bid winner or hand-assigned rider
  const left = useSecondsLeft(o.status === "accepted" ? o.bid_window_closes_at : null);
  const loc = useOrderLocation(o.id, ["assigned", "ready"].includes(o.status), o.rider_id ?? null, o.assigned_at ?? null);
  return (
    <Card>
      {o.scheduled_for && <div data-testid="scheduled-badge" className="mb-1 inline-flex rounded bg-gold-soft px-2 py-0.5 text-[12px] font-bold text-warn">{t("GEPLAND", "SCHEDULED")} · {hhmm(new Date(o.scheduled_for))}</div>}
      <div className="flex items-center justify-between"><b className="text-[17px]">#{o.id}</b><Pill tone={o.status === "placed" ? "brand" : o.status === "ready" ? "ok" : "neutral"}>{o.status === "placed" ? t("NIEUW", "NEW") : SL[o.status]}</Pill></div>
      {o.group_order_id ? (
        <div className="my-1.5 text-[13px] text-muted" data-testid="group-lines">
          <span className="mr-1 inline-flex items-center gap-1 rounded bg-gold-soft px-1.5 py-0.5 text-[11px] font-bold text-warn"><Users size={11} aria-hidden />{t("GROEP", "GROUP")}</span>
          {Object.entries(o.lines.reduce<Record<string, string[]>>((a, l) => { (a[l.guest_name ?? "?"] ??= []).push(`${l.qty}× ${l.name}`); return a; }, {})).map(([n, ls]) => (
            <div key={n}><b className="text-ink">{n}:</b> {ls.join(", ")}</div>))}
        </div>
      ) : <ul className="my-2 space-y-0.5 text-[15px]">{o.lines.map((l, i) => <li key={i}><b>{l.qty}×</b> {l.name}</li>)}</ul>}
      {o.fulfilment === "pickup" ? <div data-testid="pickup-badge" className="inline-flex items-center gap-1 rounded bg-brand-soft px-2 py-0.5 text-[12px] font-bold text-brand">{t("AFHALEN · klant haalt zelf op", "PICKUP · customer collects")}</div> : <div className="text-[13px] text-muted">{t("Bezorgen op", "Deliver to")} {o.address}</div>}
      <div className="mt-2 flex flex-wrap gap-2"><ItemUnavailable o={o} /><HelpButton role="restaurant" orderId={Number(o.id)} label={t("Probleem melden", "Report a problem")} /></div>
      {o.status !== "placed" && <div className="mt-2"><OrderChat orderId={Number(o.id)} channel="restaurant" side={profile?.role === "admin" && profile.restaurant_id !== o.restaurant_id ? "admin" : "restaurant"} order={o} /></div>}
      {o.status === "placed" ? (
        <>
          <p className="mb-2 mt-3 font-bold">{t("Bereidingstijd instellen", "Set preparation time")}</p>
          <PrepPicker value={prep} onChange={setPrep} />
          <Button variant="ok" onClick={() => act(actions.acceptOrder(o.id, prep), o.fulfilment === "pickup" ? t("Geaccepteerd · klant ziet de afhaaltijd", "Accepted · customer sees the pickup time") : t("Geaccepteerd · bestelling gedeeld met riders", "Accepted · order published to riders"))}>{t("Bestelling accepteren", "Accept order")}</Button>
          <Countdown from={o.paid_at ?? o.created_at} />
          <Button variant="ghost" onClick={() => { if (confirm(tx(`Bestelling #${o.id} weigeren? De klant krijgt het volledige bedrag terug.`, `Reject order #${o.id}? The customer is refunded in full.`))) void act(actions.rejectOrder(o.id), t("Bestelling geweigerd · klant terugbetaald", "Order rejected · customer refunded")); }}>{t("Weigeren", "Reject")}</Button>
        </>
      ) : (
        <>
          <p className="mt-3 text-sm">{tx("Bereidingstijd", "Prep time")} <b>{o.prep_minutes} min</b>{o.ready_at ? <> · {tx("klaar", "ready")} ~<b>{hhmm(new Date(o.ready_at))}</b></> : null} · {o.fulfilment === "pickup" ? <span>{tx("klant haalt op", "customer collects")}</span> : bid ? <span data-testid="assigned-rider">rider <b>{bid.rider_name}</b> {tx("komt eraan", "coming")} · ETA {bid.eta_minutes} min{bid.estimated ? tx(" (geschat)", " (estimated)") : ""}</span> : left != null ? tx(`${o.bids.length} bod/biedingen · rider gekozen over ${mmss(left)}`, `${o.bids.length} bid(s) · rider chosen in ${mmss(left)}`) : tx("wacht op een bod van een rider", "waiting for a rider bid")}</p>
          {bid && r?.lat && <div className="mt-2"><LiveMap height={180} markers={[{ id: "r", lat: r.lat, lng: r.lng!, kind: "restaurant", label: r.name }, ...(loc ? [{ id: "rider", lat: loc.lat, lng: loc.lng, kind: "rider" as const, label: `Rider ${bid.rider_name}` }] : [])]} /></div>}
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[13px] text-muted">{tx("Loop je uit?", "Running late?")}</span>
            {[5, 10].map((m) => (
              <button key={m} disabled={(o.prep_minutes ?? 0) + m > PREP_MAX}
                className="min-h-11 rounded-xl border border-line bg-white px-4 text-[15px] font-semibold disabled:opacity-40"
                onClick={() => act(actions.extendPrep(o.id, m), tx(`Bereiding +${m} min · rider en klant bijgewerkt`, `Prep +${m} min · rider and customer updated`))}>+{m} min</button>
            ))}
          </div>
          {o.status !== "ready" && o.fulfilment !== "pickup" && <Button disabled={!bid} onClick={() => act(actions.markReady(o.id), t("Rider geïnformeerd: eten is klaar", "Rider notified: food is ready"))}>{t("Klaar voor ophalen", "Mark ready for pickup")}</Button>}
          {o.status !== "ready" && o.fulfilment === "pickup" && <Button data-testid="pickup-ready" onClick={() => act(actions.markReady(o.id), t("Klant geïnformeerd: klaar om af te halen", "Customer notified: ready to collect"))}>{t("Klaar om af te halen", "Ready for collection")}</Button>}
          {o.status === "ready" && o.fulfilment === "pickup" && <Button variant="ok" data-testid="pickup-collected" onClick={() => act(actions.collect(o.id), t("Opgehaald door de klant", "Collected by the customer"))}>{t("Opgehaald door klant", "Collected by customer")}</Button>}
        </>
      )}
    </Card>
  );
}

export default function RestaurantPage() {
  const t = useT();
  const { orders, profile, mode, restaurants } = useStore();
  const pct = Number(restaurants.find((r) => r.id === profile?.restaurant_id)?.commission_pct ?? 12);
  const mine = mode === "supabase" && profile?.role === "restaurant" ? orders.filter((o) => o.restaurant_id === profile.restaurant_id) : orders;
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => { const i = setInterval(() => setNowMs(Date.now()), 30000); return () => clearInterval(i); }, []);
  const released = (o: Order) => !o.release_at || new Date(o.release_at).getTime() <= nowMs + 5 * 60000;
  const scheduledLater = mine.filter((o) => o.status === "placed" && !released(o));
  const open = mine.filter((o) => ["placed", "accepted", "assigned"].includes(o.status) && (o.status !== "placed" || released(o)));
  useOrderAlerts(open.filter((o) => o.status === "placed").map((o) => o.id), tx("Food Porter · nieuwe bestelling", "Food Porter · new order"), alertBody, "/restaurant/");
  const handed = mine.filter((o) => ["ready", "picked_up", "delivered"].includes(o.status));
  const revenue = handed.reduce((a, o) => a + o.subtotal_cents, 0);
  const [tab, setTab] = useState<"orders" | "menu">("orders");
  const cols: { key: string; title: string; icon: React.ReactNode; rows: Order[] }[] = [
    { key: "new", title: tx("Nieuw", "New"), icon: <Inbox size={16} aria-hidden />, rows: open.filter((o) => o.status === "placed") },
    { key: "prep", title: tx("In bereiding", "Preparing"), icon: <ChefHat size={16} aria-hidden />, rows: open.filter((o) => o.status !== "placed") },
    { key: "ready", title: tx("Klaar voor ophalen", "Ready for pickup"), icon: <CircleCheck size={16} aria-hidden />, rows: mine.filter((o) => o.status === "ready") },
  ];
  const myName = restaurants.find((r) => r.id === profile?.restaurant_id)?.name;
  const { st: legal, reload: reloadLegal } = useLegalStatus();
  return (
    <>
      <Header subtitle={myName ? `${myName} · ${t("Keuken", "Kitchen")}` : t("Restaurant · Keuken", "Restaurant · Kitchen")} />
      <main id="main" className="p-4 lg:px-6">
        <RoleGate role="restaurant">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div role="tablist" className="flex rounded-xl bg-subtle p-1 text-sm font-semibold">
            {(["orders", "menu"] as const).map((k) => <button key={k} role="tab" aria-selected={tab === k} data-testid={`rtab-${k}`} onClick={() => setTab(k)} className={`min-h-11 rounded-lg px-4 ${tab === k ? "bg-white shadow-sm" : "text-muted"}`}>{k === "orders" ? tx("Bestellingen", "Orders") : tx("Menu & foto's", "Menu & photos")}</button>)}
          </div>
          <AlertsBar />
        </div>
        {mode === "supabase" && profile?.role === "restaurant" && <LegalOnboarding st={legal} reload={() => void reloadLegal()} who="restaurant" />}
        {tab === "orders" ? (<>
        {profile?.restaurant_id && <PauseBusyPanel restaurantId={profile.restaurant_id} />}
        <p data-testid="kpi-line" className="mb-3 px-1 text-[13px] text-muted"><b className="text-ink">{handed.length}</b> {tx("overgedragen", "handed over")} · <b className="text-ink">{eur(revenue)}</b> {tx("omzet", "revenue")} · <b className="text-ink">{eur(Math.round((revenue * pct) / 100))}</b> {tx(`commissie ${pct}%`, `commission ${pct}%`)}</p>
        {scheduledLater.length > 0 && (
          <section data-testid="col-scheduled" className="mb-4 rounded-2xl bg-subtle/70 p-2">
            <h2 className="mb-2 px-1 !font-sans !text-[13px] font-bold uppercase tracking-wide text-muted">{tx("Gepland", "Scheduled")} <span className="rounded-full bg-white px-2 text-ink">{scheduledLater.length}</span></h2>
            {scheduledLater.map((o) => <Card key={o.id} className="!p-3"><b>#{o.id}</b> · {tx("klant wil het om", "customer wants it at")} <b>{hhmm(new Date(o.scheduled_for!))}</b><div className="text-[13px] text-muted">{tx(`Verschijnt bij Nieuw om ${hhmm(new Date(o.release_at!))}`, `Moves to New at ${hhmm(new Date(o.release_at!))}`)} · {o.lines.map((l) => `${l.qty}× ${l.name}`).join(", ")}</div></Card>)}
          </section>
        )}
        {open.length === 0 && cols[2].rows.length === 0 ? <Empty icon={<ChefHat size={24} />}>{t("Op dit moment geen open bestellingen.", "No open orders right now.")}</Empty> : (
          <div className="grid gap-4 lg:grid-cols-3" data-testid="order-board">
            {cols.map((c) => (
              <section key={c.key} data-testid={`col-${c.key}`} className="rounded-2xl bg-subtle/70 p-2">
                <h2 className="mb-2 flex items-center gap-2 px-1 !font-sans !text-[13px] font-bold uppercase tracking-wide text-muted">{c.icon}{c.title}<span className="ml-auto rounded-full bg-white px-2 text-ink">{c.rows.length}</span></h2>
                {c.rows.length === 0 ? <p className="px-1 pb-2 text-[13px] text-muted">{tx("Leeg", "Empty")}</p> : c.rows.map((o) => <OrderCard key={o.id} o={o} />)}
              </section>
            ))}
          </div>
        )}
        </>) : (
          profile?.restaurant_id ? <><SoldOutPanel restaurantId={profile.restaurant_id} /><HoursPanel restaurantId={profile.restaurant_id} /><RestaurantPhotos restaurantId={profile.restaurant_id} /><MenuAllergens restaurantId={profile.restaurant_id} /></> : <Empty icon={<ChefHat size={24} />}>{tx("Geen restaurant gekoppeld aan dit account.", "No restaurant linked to this account.")}</Empty>
        )}
        <div className="mt-6 flex flex-wrap gap-2"><HelpButton role="restaurant" label={t("Contact met support", "Contact support")} /></div>
        </RoleGate>
      </main>
    </>
  );
}

/** Allergens per dish (EU 14). Saved per tap; shown to customers before they add a dish to the cart. */
function MenuAllergens({ restaurantId }: { restaurantId: string }) {
  const items = useStore().menuItems.filter((m) => m.restaurant_id === restaurantId);
  return (
    <section data-testid="menu-allergens">
      <SectionHeader>{tx("Allergenen per gerecht", "Allergens per dish")}</SectionHeader>
      <p className="mb-2 text-[13px] text-muted">{tx("Tik de allergenen aan die in een gerecht zitten (EU-verplichting). Klanten zien dit vóór ze bestellen.", "Tap the allergens each dish contains (EU requirement). Customers see this before they order.")}</p>
      {items.map((m) => (
        <Card key={m.id} className="!p-3"><b className="mb-2 block">{m.name}{m.allergens_test ? <span className="ml-2 text-[11px] font-normal italic text-muted">{tx("testwaarden, controleer", "test values, please check")}</span> : null}</b><AllergenEditor itemId={m.id} value={m.allergens ?? []} /></Card>
      ))}
    </section>
  );
}
