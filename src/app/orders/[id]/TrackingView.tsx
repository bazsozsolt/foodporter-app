"use client";
import Link from "next/link";
import { Card, Empty, Header } from "@/components/ui";
import { hhmm } from "@/lib/format";
import { acceptedBid, useStore } from "@/lib/store";
import { STATUS_LABEL, STATUS_STEPS } from "@/lib/types";

const NEXT_ROLE: Record<string, string> = { placed: "Restaurant", accepted: "Rider", assigned: "Restaurant", ready: "Rider", picked_up: "Rider" };

export function TrackingView({ id }: { id: string }) {
  const { orders, restaurants, ready } = useStore();
  const o = orders.find((x) => x.id === id);
  if (!o) return <><Header /><main className="p-4"><Empty icon="🔎">{ready ? `Order #${id} not found (are you signed in?).` : "Loading…"}</Empty></main></>;
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
          {o.status === "delivered" ? (<><div className="text-5xl">🎉</div><h2 className="text-lg font-bold">Delivered!</h2><p className="text-sm text-muted">Enjoy your meal.</p></>)
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
        {o.status !== "delivered" && <p className="text-center text-sm text-muted">Demo: switch to <b>{NEXT_ROLE[o.status]}</b> below to move the order forward.</p>}
      </main>
    </>
  );
}
