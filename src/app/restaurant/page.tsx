"use client";
import { useEffect, useState } from "react";
import { AlertsToggle, TestSoundButton, useOrderAlerts } from "@/components/OrderAlerts";
import { RoleGate } from "@/components/RoleGate";
import { act } from "@/lib/act";
import { Button, Card, Empty, Header, Pill, Stat } from "@/components/ui";
import { PREP_MAX, PrepPicker } from "@/components/PrepPicker";
import { hhmm } from "@/lib/format";
import { eur } from "@/lib/format";
import { acceptedBid, actions, useStore } from "@/lib/store";
import { STATUS_LABEL, type Order } from "@/lib/types";
import { mmss, useSecondsLeft } from "@/components/Countdown";
import { LiveMap } from "@/components/LiveMap";
import { useOrderLocation } from "@/lib/location";

function Countdown({ from }: { from: string }) {
  const mins = useStore().settings.restaurant_accept_minutes;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const left = Math.max(0, new Date(from).getTime() + mins * 60000 - now);
  const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
  return <p className={`mt-2 text-center text-[13px] ${left < 60000 ? "font-bold text-red-600" : "text-muted"}`}>{left > 0 ? `Accept within ${m}:${String(s).padStart(2, "0")} or the order is cancelled and refunded automatically` : "Time's up — cancelling and refunding…"}</p>;
}

const alertBody = (n: number) => `${n} new order${n > 1 ? "s" : ""} waiting for you to accept`;

function OrderCard({ o }: { o: Order }) {
  const [prep, setPrep] = useState(15);
  const { restaurants } = useStore();
  const r = restaurants.find((x) => x.id === o.restaurant_id);
  const bid = acceptedBid(o);
  const left = useSecondsLeft(o.status === "accepted" ? o.bid_window_closes_at : null);
  const loc = useOrderLocation(o.id, ["assigned", "ready"].includes(o.status), o.rider_id ?? null, o.assigned_at ?? null);
  return (
    <Card>
      <div className="flex items-center justify-between"><b>#{o.id} · {r?.name}</b><Pill>{o.status === "placed" ? "NEW" : STATUS_LABEL[o.status]}</Pill></div>
      <div className="my-1.5 text-[13px] text-muted">{o.lines.map((l) => `${l.qty}× ${l.name}`).join(", ")}</div>
      <div className="text-[13px] text-muted">Deliver to {o.address}</div>
      {o.status === "placed" ? (
        <>
          <p className="mb-2 mt-3 font-bold">Set preparation time</p>
          <PrepPicker value={prep} onChange={setPrep} />
          <Button variant="ok" onClick={() => act(actions.acceptOrder(o.id, prep), "Accepted · order published to riders")}>Accept order</Button>
          <Countdown from={o.paid_at ?? o.created_at} />
          <Button variant="ghost" onClick={() => { if (confirm(`Reject order #${o.id}? The customer is refunded in full.`)) void act(actions.rejectOrder(o.id), "Order rejected · customer refunded"); }}>Reject</Button>
        </>
      ) : (
        <>
          <p className="mt-3 text-sm">Prep time <b>{o.prep_minutes} min</b>{o.ready_at ? <> · ready ~<b>{hhmm(new Date(o.ready_at))}</b></> : null} · {bid ? <>rider <b>{bid.rider_name}</b> coming</> : left != null ? `${o.bids.length} bid(s) · rider chosen in ${mmss(left)}` : "waiting for a rider bid"}</p>
          {bid && r?.lat && <div className="mt-2"><LiveMap height={180} markers={[{ id: "r", lat: r.lat, lng: r.lng!, kind: "restaurant", label: r.name }, ...(loc ? [{ id: "rider", lat: loc.lat, lng: loc.lng, kind: "rider" as const, label: `Rider ${bid.rider_name}` }] : [])]} /></div>}
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[13px] text-muted">Running late?</span>
            {[5, 10].map((m) => (
              <button key={m} disabled={(o.prep_minutes ?? 0) + m > PREP_MAX}
                className="rounded-full border-[1.5px] border-[#e2ded8] bg-white px-3 py-1.5 text-sm font-semibold disabled:opacity-40"
                onClick={() => act(actions.extendPrep(o.id, m), `Prep +${m} min · rider and customer updated`)}>+{m} min</button>
            ))}
          </div>
          <Button disabled={!bid} onClick={() => act(actions.markReady(o.id), "Rider notified: food is ready")}>✅ Mark ready for pickup</Button>
        </>
      )}
    </Card>
  );
}

export default function RestaurantPage() {
  const { orders, profile, mode, restaurants } = useStore();
  const pct = Number(restaurants.find((r) => r.id === profile?.restaurant_id)?.commission_pct ?? 12);
  const mine = mode === "supabase" && profile?.role === "restaurant" ? orders.filter((o) => o.restaurant_id === profile.restaurant_id) : orders;
  const open = mine.filter((o) => ["placed", "accepted", "assigned"].includes(o.status));
  useOrderAlerts(mine.filter((o) => o.status === "placed").map((o) => o.id), "Food Porter · new order", alertBody);
  const handed = mine.filter((o) => ["ready", "picked_up", "delivered"].includes(o.status));
  const revenue = handed.reduce((a, o) => a + o.subtotal_cents, 0);
  return (
    <>
      <Header subtitle="Restaurant dashboard · Partner kitchen view" />
      <main className="p-4">
        <RoleGate role="restaurant">
        <div className="grid grid-cols-[1fr_auto] gap-2"><AlertsToggle /><TestSoundButton /></div>
        <div className="flex gap-2.5"><Stat value={String(handed.length)} label="Handed over" /><Stat value={eur(revenue)} label="Revenue" /><Stat value={eur(Math.round((revenue * pct) / 100))} label={`Commission ${pct}%`} /></div>
        <h2 className="mb-3 mt-4 text-lg font-bold">Incoming orders</h2>
        {open.length === 0 ? <Empty icon="🍳">No open orders right now.</Empty> : open.map((o) => <OrderCard key={o.id} o={o} />)}
        </RoleGate>
      </main>
    </>
  );
}
