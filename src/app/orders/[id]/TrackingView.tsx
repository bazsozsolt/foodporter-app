"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { act } from "@/lib/act";
import { Card, Empty, Header } from "@/components/ui";
import { hhmm } from "@/lib/format";
import { acceptedBid, actions, useStore } from "@/lib/store";
import { STATUS_LABEL, STATUS_STEPS } from "@/lib/types";

const NEXT_ROLE: Record<string, string> = { placed: "Restaurant", accepted: "Rider", assigned: "Restaurant", ready: "Rider", picked_up: "Rider" };

export function TrackingView({ id }: { id: string }) {
  const { orders, restaurants, ready, profile, mode } = useStore();
  const o = orders.find((x) => x.id === id);
  const [paying, setPaying] = useState(false);
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
  const etaAt = bid ? hhmm(new Date(new Date(bid.created_at).getTime() + bid.eta_minutes * 60000)) : null;

  return (
    <>
      <Header subtitle={`Order #${o.id}`} />
      <main className="p-4">
        <Link href="/" className="text-sm text-muted">← Home</Link>
        <Card className="mt-2.5 text-center">
          {o.status === "awaiting_payment" ? (<><div className="text-4xl">💳</div><h2 className="text-lg font-bold">Waiting for payment</h2><p className="text-sm text-muted">If you just paid, this updates in a few seconds.</p>{mine ? <Button onClick={payNow} disabled={paying}>{paying ? "Opening Mollie…" : "Pay now"}</Button> : <p className="mt-2 text-sm text-muted">Only the customer can pay this order.</p>}</>)
            : o.status === "payment_failed" ? (<><div className="text-4xl">⚠️</div><h2 className="text-lg font-bold">Payment failed or cancelled</h2>{mine && <Button onClick={payNow} disabled={paying}>Try again</Button>}</>)
            : o.status === "delivered" ? (<><div className="text-5xl">🎉</div><h2 className="text-lg font-bold">Delivered!</h2><p className="text-sm text-muted">Enjoy your meal.</p></>)
            : bid ? (<><div className="text-sm text-muted">Arriving in about</div><div className="text-4xl font-extrabold text-brand">{bid.eta_minutes} min</div><div className="text-sm text-muted">by {etaAt} · rider {bid.rider_name} 🚲</div></>)
            : (<><div className="text-sm text-muted">Waiting for {idx < 1 ? "the restaurant" : "a rider bid"}…</div><div className="text-4xl">⏳</div></>)}
        </Card>
        <Card>
          <b>{r?.name}</b>
          <ul className="mt-2">
            {STATUS_STEPS.map((s, j) => (
              <li key={s} className={`relative py-2 pl-7 ${j <= idx ? "font-semibold text-ink" : "text-muted"}`}>
                <span className={`absolute left-1.5 top-3 h-3 w-3 rounded-full ${j <= idx ? "bg-ok" : j === idx + 1 ? "bg-brand ring-4 ring-brand/20" : "bg-[#ddd]"}`} />
                {STATUS_LABEL[s]}
                {s === "accepted" && o.prep_minutes ? ` · ${o.prep_minutes} min prep` : ""}
                {s === "assigned" && bid ? ` · ${bid.rider_name}, ETA ${bid.eta_minutes} min` : ""}
              </li>
            ))}
          </ul>
        </Card>
        <Card className="text-sm text-muted">📱 SMS updates go to {o.phone} at each step.</Card>
        {!["delivered", "awaiting_payment", "payment_failed"].includes(o.status) && <p className="text-center text-sm text-muted">Demo: switch to <b>{NEXT_ROLE[o.status]}</b> below to move the order forward.</p>}
      </main>
    </>
  );
}
