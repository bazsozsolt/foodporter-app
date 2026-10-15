"use client";
import { AlertTriangle, CircleCheck, CreditCard, Hourglass, Search, Smartphone, Undo2 } from "lucide-react";
import { CustomerPushCard } from "@/components/OrderAlerts";
import { HelpButton } from "@/components/SupportSheet";
import { useT, tx } from "@/lib/i18n";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { act } from "@/lib/act";
import { Card, Empty, Header } from "@/components/ui";
import { hhmm } from "@/lib/format";
import { acceptedBid, actions, useStore } from "@/lib/store";
import { cancelReason, STATUS_LABEL, STATUS_LABEL_NL, STATUS_STEPS } from "@/lib/types";
import { RateOrder } from "@/components/RateOrder";
import { ReorderButton } from "@/components/ReorderButton";
import { mmss, useSecondsLeft } from "@/components/Countdown";
import { LiveMap, type MapMarker } from "@/components/LiveMap";
import { useOrderLocation } from "@/lib/location";
import { eur } from "@/lib/format";
import { getSupabase } from "@/lib/supabase";
import { CallButton, OrderChat } from "@/components/OrderChat";
import { useRiderInfo } from "@/lib/orders";
import { DeliveryPhoto } from "@/components/DeliveryProof";

const NEXT_ROLE: Record<string, string> = { placed: "Restaurant", accepted: "Rider", assigned: "Restaurant", ready: "Rider", picked_up: "Rider" };

export function TrackingView({ id }: { id: string }) {
  const { orders, restaurants, ready, profile, mode } = useStore();
  const o = orders.find((x) => x.id === id);
  const [paying, setPaying] = useState(false);
  const tr = useT();
  const SL = tr("nl", "en") === "nl" ? STATUS_LABEL_NL : STATUS_LABEL;
  const left = useSecondsLeft(o?.status === "accepted" ? o?.bid_window_closes_at : null);
  const live = Boolean(o && ["assigned", "ready", "picked_up"].includes(o.status));
  const loc = useOrderLocation(o?.id ?? null, live, o?.rider_id ?? null, o?.assigned_at ?? null);
  const stopsBefore = useStopsBefore(live && mode === "supabase" ? o?.id ?? null : null, o?.status);
  const riderInfo = useRiderInfo(o);
  const unpaid = o?.status === "awaiting_payment";
  // After returning from Mollie the webhook may take a moment; realtime updates the order, poll as a fallback.
  useEffect(() => {
    if (!unpaid) return;
    const t = setInterval(() => actions.reset(), 4000);
    return () => clearInterval(t);
  }, [unpaid]);
  async function payNow() {
    setPaying(true);
    const url = await act(actions.startPayment(id));
    setPaying(false);
    if (url) window.location.href = url;
  }
  if (!o) return <><Header /><main id="main" className="p-4"><Empty icon={<Search size={24} />}>{!ready ? tx("Laden…", "Loading…") : !id ? tx("Geen bestelling gekozen.", "No order selected.") : tx(`Bestelling #${id} niet gevonden. ${profile ? "Mogelijk hoort die bij een ander account." : "Log in om je bestellingen te zien."}`, `Order #${id} not found. ${profile ? "It may belong to another account." : "Please sign in to see your orders."}`)}</Empty></main></>;
  const mine = mode === "mock" || o.customer_id === profile?.id;
  const r = restaurants.find((x) => x.id === o.restaurant_id);
  const bid = riderInfo;
  const idx = STATUS_STEPS.indexOf(o.status);
  const etaAt = bid ? hhmm(new Date(new Date(bid.since).getTime() + bid.eta_minutes * 60000)) : null;
  const best = o.bids.length ? Math.min(...o.bids.map((b) => b.eta_minutes)) : null;
  const markers: MapMarker[] = [
    ...(r?.lat ? [{ id: "r", lat: r.lat, lng: r.lng!, kind: "restaurant" as const, label: r.name }] : []),
    ...(o.lat ? [{ id: "d", lat: o.lat, lng: o.lng!, kind: "dropoff" as const, label: tx("Jouw adres", "Your address") }] : []),
    ...(loc ? [{ id: "rider", lat: loc.lat, lng: loc.lng, kind: "rider" as const, label: `Rider ${bid?.rider_name ?? ""}` }] : []),
  ];

  return (
    <>
      <Header subtitle={`${tr("Bestelling", "Order")} #${o.id}`} />
      <main id="main" className="p-4">
        {mine && o.paid_at && !["delivered", "cancelled"].includes(o.status) && <CustomerPushCard />}
        <Card className="text-center !py-6" data-testid="status-hero">
          {o.status === "awaiting_payment" ? (<><CreditCard size={40} className="mx-auto text-brand" aria-hidden /><h2 className="mt-2 text-lg font-bold">{tr("Wacht op betaling", "Waiting for payment")}</h2><p className="text-sm text-muted">{tx("Net betaald? Dit wordt binnen een paar seconden bijgewerkt.", "If you just paid, this updates in a few seconds.")}</p>{mine ? <Button onClick={payNow} disabled={paying}>{paying ? tx("Mollie openen…", "Opening Mollie…") : tx("Nu betalen", "Pay now")}</Button> : <p className="mt-2 text-sm text-muted">{tx("Alleen de klant kan deze bestelling betalen.", "Only the customer can pay this order.")}</p>}</>)
            : o.status === "payment_failed" ? (<><AlertTriangle size={40} className="mx-auto text-danger" aria-hidden /><h2 className="mt-2 text-lg font-bold">{tr("Betaling mislukt of geannuleerd", "Payment failed or cancelled")}</h2>{mine && <Button onClick={payNow} disabled={paying}>{tx("Opnieuw proberen", "Try again")}</Button>}</>)
            : o.status === "cancelled" ? (<><Undo2 size={40} className="mx-auto text-muted" aria-hidden /><h2 className="mt-2 text-lg font-bold">{tr("Bestelling geannuleerd", "Order cancelled")}</h2><p className="text-sm text-muted">{cancelReason(o.cancel_reason)}.</p>
                {o.paid_at ? <p data-testid="refund" className="mt-1 text-sm">{o.refund_status === "simulated" ? tx("Testbestelling: er is niets afgeschreven.", "Test order: nothing was charged.") : o.refund_status === "failed" ? tx("Ons team betaalt je binnenkort handmatig terug.", "Our team will refund you manually shortly.") : o.refund_cents ? tx(`Terugbetaling van ${eur(o.refund_cents)} ${o.refund_status === "refunded" ? "voltooid" : "onderweg"} (1–3 werkdagen voor iDEAL/kaart).`, `Refund of ${eur(o.refund_cents)} ${o.refund_status === "refunded" ? "completed" : "on its way"} (1–3 working days for iDEAL/card).`) : tx("Terugbetaling wordt verwerkt…", "Refund in progress…")}</p> : null}</>)
            : o.status === "delivered" ? (<><CircleCheck size={48} className="mx-auto text-ok" aria-hidden /><h2 className="mt-2 text-lg font-bold">{tr("Bezorgd!", "Delivered!")}</h2><p className="text-sm text-muted">{tr("Eet smakelijk.", "Enjoy your meal.")}</p></>)
            : bid ? (<><div className="text-sm text-muted">{tr("Bezorgd over ongeveer", "Arriving in about")}</div><div className="font-display text-6xl leading-none text-brand">{bid.eta_minutes} min</div><div className="text-sm text-muted" data-testid="assigned-rider">{tr("rond", "by")} {etaAt} · rider {bid.rider_name}{bid.estimated ? tr(" · geschatte tijd", " · estimated time") : ""}</div>{stopsBefore ? <div data-testid="stops-before" className="mt-2 inline-block rounded-full bg-brand-soft px-3 py-1 text-[13px] font-semibold text-brand">{tr(`Je rider heeft nog ${stopsBefore} ${stopsBefore > 1 ? "stops" : "stop"} vóór jou`, `Your rider has ${stopsBefore} stop${stopsBefore > 1 ? "s" : ""} before you`)}</div> : null}</>)
            : o.status === "accepted" && left != null ? (<div data-testid="customer-auction"><div className="text-sm text-muted">{tx(`${o.bids.length} rider${o.bids.length === 1 ? "" : "s"} biedt · beste tijd tot nu toe`, `${o.bids.length} rider${o.bids.length === 1 ? "" : "s"} bidding · best ETA so far`)}</div><div className="font-display text-6xl leading-none text-brand">{best} min</div><div className="text-sm text-muted">{left > 0 ? tx(`Rider gekozen over ${mmss(left)}`, `Rider chosen in ${mmss(left)}`) : tx("Je rider wordt gekozen…", "Choosing your rider…")}</div></div>)
            : (<><div className="text-sm text-muted">{idx < 1 ? tx("Wacht op het restaurant…", "Waiting for the restaurant…") : tx("Wacht op een bod van een rider…", "Waiting for a rider bid…")}</div><Hourglass size={36} className="mx-auto mt-2 text-brand" aria-hidden /></>)}
        </Card>
        {live && markers.length > 0 && <Card className="p-2"><LiveMap markers={markers} /><p className="mt-1.5 px-1 text-xs text-muted">{loc ? tx(`Locatie rider bijgewerkt ${hhmm(new Date(loc.created_at))}`, `Rider location updated ${hhmm(new Date(loc.created_at))}`) : tx("De locatie van de rider verschijnt zodra die GPS deelt.", "Rider location appears once they share GPS.")}</p></Card>}
        {(mine || profile?.role === "admin") && o.status !== "awaiting_payment" && (
          <Card className="!p-3" data-testid="contact-box">
            <div className="flex gap-2">
              {mine && <HelpButton role="customer" orderId={Number(o.id)} orderTotalCents={o.paid_at ? o.subtotal_cents + o.delivery_fee_cents + (o.tip_cents ?? 0) - (o.refund_cents ?? 0) : null} />}
              {o.rider_id && ["placed", "accepted", "assigned", "ready", "picked_up", "delivered"].includes(o.status) && <CallButton orderId={Number(o.id)} status={o.status} side="customer" asAdmin={!mine} />}
            </div>
            {["placed", "accepted", "assigned", "ready", "picked_up", "delivered"].includes(o.status) && <div className="mt-2 space-y-2">
              {o.leave_at_door && <p data-testid="door-chosen" className="mt-2 text-[13px] text-muted">{tr("Je koos: bij de deur zetten (zonder contact).", "You chose: leave at the door (contactless).")}</p>}
              <DeliveryPhoto path={o.delivery_photo_path} english={!mine} />
              {o.rider_id && <OrderChat orderId={Number(o.id)} channel="rider" side={mine ? "customer" : "admin"} order={o} />}
              <OrderChat orderId={Number(o.id)} channel="restaurant" side={mine ? "customer" : "admin"} order={o} />
            </div>}
          </Card>
        )}
        {o.status !== "cancelled" && <Card>
          <b>{r?.name}</b>
          <ul className="mt-2">
            {STATUS_STEPS.map((s, j) => (
              <li key={s} className={`relative py-2 pl-7 ${j <= idx ? "font-semibold text-ink" : "text-muted"}`}>
                <span className={`absolute left-1.5 top-3 h-3 w-3 rounded-full ${j <= idx ? "bg-ok" : j === idx + 1 ? "bg-brand ring-4 ring-brand/20" : "bg-[#ddd]"}`} />
                {SL[s]}
                {s === "accepted" && o.prep_minutes ? ` · ${o.prep_minutes} ${tx("min bereiding", "min prep")}${o.ready_at && !["ready", "picked_up", "delivered"].includes(o.status) ? ` (${tx("klaar", "ready")} ~${hhmm(new Date(o.ready_at))})` : ""}` : ""}
                {s === "assigned" && bid ? ` · ${bid.rider_name}, ETA ${bid.eta_minutes} min` : ""}
              </li>
            ))}
          </ul>
        </Card>}
        {o.status === "delivered" && mine && mode === "supabase" && <RateOrder orderId={o.id} hasRider={Boolean(bid)} />}
        {o.status === "delivered" && mine && <ReorderButton id={o.id} />}
        {mine && <SmsNote id={o.id} fallback={o.phone} />}
        {!["delivered", "awaiting_payment", "payment_failed", "cancelled"].includes(o.status) && <p className="text-center text-xs text-muted">{tx("Demo: wissel via het Demo-menu naar", "Demo: use the Demo menu to switch to")} <b>{NEXT_ROLE[o.status]}</b> {tx("om de bestelling verder te zetten.", "to move the order forward.")}</p>}
      </main>
    </>
  );
}

function SmsNote({ id, fallback }: { id: string; fallback: string }) {
  const [phone, setPhone] = useState<string | null>(fallback || null);
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    sb.rpc("order_phone", { p_order: Number(id) }).then(({ data }) => { if (data) setPhone(String(data)); });
  }, [id]);
  return <p className="mb-3 flex items-center justify-center gap-1.5 text-xs text-muted"><Smartphone size={14} aria-hidden />{tx(`Bij elke stap sturen we een sms naar ${phone ?? "je telefoon"}.`, `SMS updates go to ${phone ?? "your phone"} at each step.`)}</p>;
}

/** Stacked orders: how many stops the rider makes before this customer's drop-off (refreshes every 20 s). */
function useStopsBefore(id: string | null, status?: string) {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !id) return;
    let alive = true;
    const run = () => void sb.rpc("order_stops_before", { p_order: Number(id) }).then(({ data }) => { if (alive) setN(typeof data === "number" ? data : null); });
    run();
    const t = setInterval(run, 20000);
    return () => { alive = false; clearInterval(t); };
  }, [id, status]);
  return id ? n : null;
}
