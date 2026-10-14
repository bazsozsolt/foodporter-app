"use client";
import { useT , tx } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { AlertsToggle, TestSoundButton, useOrderAlerts } from "@/components/OrderAlerts";
import { RoleGate } from "@/components/RoleGate";
import { act } from "@/lib/act";
import { Button, Card, Empty, Header, Pill, Stat } from "@/components/ui";
import { PREP_MAX, PrepPicker } from "@/components/PrepPicker";
import { HelpButton } from "@/components/SupportSheet";
import { ItemUnavailable } from "@/components/ItemUnavailable";
import { hhmm } from "@/lib/format";
import { eur } from "@/lib/format";
import { acceptedBid, actions, useStore } from "@/lib/store";
import { STATUS_LABEL, STATUS_LABEL_NL, type Order } from "@/lib/types";
import { mmss, useSecondsLeft } from "@/components/Countdown";
import { LiveMap } from "@/components/LiveMap";
import { useOrderLocation } from "@/lib/location";

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
  const { restaurants } = useStore();
  const r = restaurants.find((x) => x.id === o.restaurant_id);
  const bid = acceptedBid(o);
  const left = useSecondsLeft(o.status === "accepted" ? o.bid_window_closes_at : null);
  const loc = useOrderLocation(o.id, ["assigned", "ready"].includes(o.status), o.rider_id ?? null, o.assigned_at ?? null);
  return (
    <Card>
      <div className="flex items-center justify-between"><b>#{o.id} · {r?.name}</b><Pill>{o.status === "placed" ? t("NIEUW", "NEW") : SL[o.status]}</Pill></div>
      {o.group_order_id ? (
        <div className="my-1.5 text-[13px] text-muted" data-testid="group-lines">
          <span className="mr-1 rounded bg-gold/40 px-1.5 py-0.5 text-[11px] font-bold text-ink">👥 {t("GROEP", "GROUP")}</span>
          {Object.entries(o.lines.reduce<Record<string, string[]>>((a, l) => { (a[l.guest_name ?? "?"] ??= []).push(`${l.qty}× ${l.name}`); return a; }, {})).map(([n, ls]) => (
            <div key={n}><b className="text-ink">{n}:</b> {ls.join(", ")}</div>))}
        </div>
      ) : <div className="my-1.5 text-[13px] text-muted">{o.lines.map((l) => `${l.qty}× ${l.name}`).join(", ")}</div>}
      <div className="text-[13px] text-muted">{t("Bezorgen op", "Deliver to")} {o.address}</div>
      <div className="mt-1 flex flex-wrap gap-2"><ItemUnavailable o={o} /><HelpButton role="restaurant" orderId={Number(o.id)} label={t("Probleem melden", "Report a problem")} /></div>
      {o.status === "placed" ? (
        <>
          <p className="mb-2 mt-3 font-bold">{t("Bereidingstijd instellen", "Set preparation time")}</p>
          <PrepPicker value={prep} onChange={setPrep} />
          <Button variant="ok" onClick={() => act(actions.acceptOrder(o.id, prep), t("Geaccepteerd · bestelling gedeeld met riders", "Accepted · order published to riders"))}>{t("Bestelling accepteren", "Accept order")}</Button>
          <Countdown from={o.paid_at ?? o.created_at} />
          <Button variant="ghost" onClick={() => { if (confirm(`Reject order #${o.id}? The customer is refunded in full.`)) void act(actions.rejectOrder(o.id), t("Bestelling geweigerd · klant terugbetaald", "Order rejected · customer refunded")); }}>{t("Weigeren", "Reject")}</Button>
        </>
      ) : (
        <>
          <p className="mt-3 text-sm">{tx("Bereidingstijd", "Prep time")} <b>{o.prep_minutes} min</b>{o.ready_at ? <> · {tx("klaar", "ready")} ~<b>{hhmm(new Date(o.ready_at))}</b></> : null} · {bid ? <>rider <b>{bid.rider_name}</b> {tx("komt eraan", "coming")}</> : left != null ? tx(`${o.bids.length} bod/biedingen · rider gekozen over ${mmss(left)}`, `${o.bids.length} bid(s) · rider chosen in ${mmss(left)}`) : tx("wacht op een bod van een rider", "waiting for a rider bid")}</p>
          {bid && r?.lat && <div className="mt-2"><LiveMap height={180} markers={[{ id: "r", lat: r.lat, lng: r.lng!, kind: "restaurant", label: r.name }, ...(loc ? [{ id: "rider", lat: loc.lat, lng: loc.lng, kind: "rider" as const, label: `Rider ${bid.rider_name}` }] : [])]} /></div>}
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[13px] text-muted">{tx("Loop je uit?", "Running late?")}</span>
            {[5, 10].map((m) => (
              <button key={m} disabled={(o.prep_minutes ?? 0) + m > PREP_MAX}
                className="rounded-full border-[1.5px] border-[#e2ded8] bg-white px-3 py-1.5 text-sm font-semibold disabled:opacity-40"
                onClick={() => act(actions.extendPrep(o.id, m), tx(`Bereiding +${m} min · rider en klant bijgewerkt`, `Prep +${m} min · rider and customer updated`))}>+{m} min</button>
            ))}
          </div>
          <Button disabled={!bid} onClick={() => act(actions.markReady(o.id), t("Rider geïnformeerd: eten is klaar", "Rider notified: food is ready"))}>{t("Klaar voor ophalen", "Mark ready for pickup")}</Button>
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
  const open = mine.filter((o) => ["placed", "accepted", "assigned"].includes(o.status));
  useOrderAlerts(mine.filter((o) => o.status === "placed").map((o) => o.id), tx("Food Porter · nieuwe bestelling", "Food Porter · new order"), alertBody, "/restaurant/");
  const handed = mine.filter((o) => ["ready", "picked_up", "delivered"].includes(o.status));
  const revenue = handed.reduce((a, o) => a + o.subtotal_cents, 0);
  return (
    <>
      <Header subtitle={t("Restaurantdashboard · keukenoverzicht", "Restaurant dashboard · Partner kitchen view")} />
      <main id="main" className="p-4">
        <RoleGate role="restaurant">
        <div className="grid grid-cols-[1fr_auto] gap-2"><AlertsToggle /><TestSoundButton /></div>
        <div className="flex gap-2.5"><Stat value={String(handed.length)} label={tx("Overgedragen", "Handed over")} /><Stat value={eur(revenue)} label={tx("Omzet", "Revenue")} /><Stat value={eur(Math.round((revenue * pct) / 100))} label={tx(`Commissie ${pct}%`, `Commission ${pct}%`)} /></div>
        <h2 className="mb-3 mt-4 text-lg font-bold">{t("Binnenkomende bestellingen", "Incoming orders")}</h2>
        {open.length === 0 ? <Empty icon="🍳">{t("Op dit moment geen open bestellingen.", "No open orders right now.")}</Empty> : open.map((o) => <OrderCard key={o.id} o={o} />)}
        </RoleGate>
      </main>
    </>
  );
}
