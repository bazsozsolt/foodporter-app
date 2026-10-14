"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { act } from "@/lib/act";
import { Card, Empty, Header } from "@/components/ui";
import { hhmm } from "@/lib/format";
import { acceptedBid, actions, useStore } from "@/lib/store";
import { CANCEL_REASON, STATUS_LABEL, STATUS_STEPS } from "@/lib/types";
import { RateOrder } from "@/components/RateOrder";
import { ReorderButton } from "@/components/ReorderButton";
import { mmss, useSecondsLeft } from "@/components/Countdown";
import { LiveMap, type MapMarker } from "@/components/LiveMap";
import { useOrderLocation } from "@/lib/location";
import { eur } from "@/lib/format";
import { getSupabase } from "@/lib/supabase";

const NEXT_ROLE: Record<string, string> = { placed: "Restaurant", accepted: "Rider", assigned: "Restaurant", ready: "Rider", picked_up: "Rider" };

export function TrackingView({ id }: { id: string }) {
  const { orders, restaurants, ready, profile, mode } = useStore();
  const o = orders.find((x) => x.id === id);
  const [paying, setPaying] = useState(false);
  const left = useSecondsLeft(o?.status === "accepted" ? o?.bid_window_closes_at : null);
  const live = Boolean(o && ["assigned", "ready", "picked_up"].includes(o.status));
  const loc = useOrderLocation(o?.id ?? null, live, o?.rider_id ?? null, o?.assigned_at ?? null);
  const stopsBefore = useStopsBefore(live && mode === "supabase" ? o?.id ?? null : null, o?.status);
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
  if (!o) return <><Header /><main className="p-4"><Empty icon="🔎">{!ready ? "Loading…" : !id ? "No order selected." : `Order #${id} not found. ${profile ? "It may belong to another account." : "Please sign in to see your orders."}`}</Empty></main></>;
  const mine = mode === "mock" || o.customer_id === profile?.id;
  const r = restaurants.find((x) => x.id === o.restaurant_id);
  const bid = acceptedBid(o);
  const idx = STATUS_STEPS.indexOf(o.status);
  const etaAt = bid ? hhmm(new Date(new Date(o.assigned_at ?? bid.created_at).getTime() + bid.eta_minutes * 60000)) : null;
  const best = o.bids.length ? Math.min(...o.bids.map((b) => b.eta_minutes)) : null;
  const markers: MapMarker[] = [
    ...(r?.lat ? [{ id: "r", lat: r.lat, lng: r.lng!, kind: "restaurant" as const, label: r.name }] : []),
    ...(o.lat ? [{ id: "d", lat: o.lat, lng: o.lng!, kind: "dropoff" as const, label: "Your address" }] : []),
    ...(loc ? [{ id: "rider", lat: loc.lat, lng: loc.lng, kind: "rider" as const, label: `Rider ${bid?.rider_name ?? ""}` }] : []),
  ];

  return (
    <>
      <Header subtitle={`Order #${o.id}`} />
      <main className="p-4">
        <Link href="/" className="text-sm text-muted">← Home</Link>
        <Card className="mt-2.5 text-center">
          {o.status === "awaiting_payment" ? (<><div className="text-4xl">💳</div><h2 className="text-lg font-bold">Waiting for payment</h2><p className="text-sm text-muted">If you just paid, this updates in a few seconds.</p>{mine ? <Button onClick={payNow} disabled={paying}>{paying ? "Opening Mollie…" : "Pay now"}</Button> : <p className="mt-2 text-sm text-muted">Only the customer can pay this order.</p>}</>)
            : o.status === "payment_failed" ? (<><div className="text-4xl">⚠️</div><h2 className="text-lg font-bold">Payment failed or cancelled</h2>{mine && <Button onClick={payNow} disabled={paying}>Try again</Button>}</>)
            : o.status === "cancelled" ? (<><div className="text-4xl">↩️</div><h2 className="text-lg font-bold">Order cancelled</h2><p className="text-sm text-muted">{CANCEL_REASON[o.cancel_reason ?? "system"] ?? "Cancelled"}.</p>
                {o.paid_at ? <p data-testid="refund" className="mt-1 text-sm">{o.refund_status === "failed" ? "Our team will refund you manually shortly." : o.refund_cents ? `Refund of ${eur(o.refund_cents)} ${o.refund_status === "refunded" ? "completed" : "on its way"} (1–3 working days for iDEAL/card).` : "Refund in progress…"}</p> : null}</>)
            : o.status === "delivered" ? (<><div className="text-5xl">🎉</div><h2 className="text-lg font-bold">Delivered!</h2><p className="text-sm text-muted">Enjoy your meal.</p></>)
            : bid ? (<><div className="text-sm text-muted">Arriving in about</div><div className="text-4xl font-extrabold text-brand">{bid.eta_minutes} min</div><div className="text-sm text-muted">by {etaAt} · rider {bid.rider_name} 🚲</div>{stopsBefore ? <div data-testid="stops-before" className="mt-2 inline-block rounded-full bg-[#fff1ea] px-3 py-1 text-[13px] font-semibold text-brand">🛵 Your rider has {stopsBefore} stop{stopsBefore > 1 ? "s" : ""} before you</div> : null}</>)
            : o.status === "accepted" && left != null ? (<div data-testid="customer-auction"><div className="text-sm text-muted">{o.bids.length} rider{o.bids.length === 1 ? "" : "s"} bidding · best ETA so far</div><div className="text-4xl font-extrabold text-brand">{best} min</div><div className="text-sm text-muted">{left > 0 ? `Rider chosen in ${mmss(left)}` : "Choosing your rider…"}</div></div>)
            : (<><div className="text-sm text-muted">Waiting for {idx < 1 ? "the restaurant" : "a rider bid"}…</div><div className="text-4xl">⏳</div></>)}
        </Card>
        {live && markers.length > 0 && <Card className="p-2"><LiveMap markers={markers} /><p className="mt-1.5 px-1 text-xs text-muted">{loc ? `Rider location updated ${hhmm(new Date(loc.created_at))}` : "Rider location appears once they share GPS."}</p></Card>}
        {o.status !== "cancelled" && <Card>
          <b>{r?.name}</b>
          <ul className="mt-2">
            {STATUS_STEPS.map((s, j) => (
              <li key={s} className={`relative py-2 pl-7 ${j <= idx ? "font-semibold text-ink" : "text-muted"}`}>
                <span className={`absolute left-1.5 top-3 h-3 w-3 rounded-full ${j <= idx ? "bg-ok" : j === idx + 1 ? "bg-brand ring-4 ring-brand/20" : "bg-[#ddd]"}`} />
                {STATUS_LABEL[s]}
                {s === "accepted" && o.prep_minutes ? ` · ${o.prep_minutes} min prep${o.ready_at && !["ready", "picked_up", "delivered"].includes(o.status) ? ` (ready ~${hhmm(new Date(o.ready_at))})` : ""}` : ""}
                {s === "assigned" && bid ? ` · ${bid.rider_name}, ETA ${bid.eta_minutes} min` : ""}
              </li>
            ))}
          </ul>
        </Card>}
        {o.status === "delivered" && mine && mode === "supabase" && <RateOrder orderId={o.id} hasRider={Boolean(bid)} />}
        {o.status === "delivered" && mine && <ReorderButton id={o.id} />}
        {mine && <SmsNote id={o.id} fallback={o.phone} />}
        {!["delivered", "awaiting_payment", "payment_failed", "cancelled"].includes(o.status) && <p className="text-center text-sm text-muted">Demo: switch to <b>{NEXT_ROLE[o.status]}</b> below to move the order forward.</p>}
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
  return <Card className="text-sm text-muted">📱 SMS updates go to {phone ?? "your phone"} at each step.</Card>;
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
