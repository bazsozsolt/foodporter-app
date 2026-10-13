"use client";
import { useState } from "react";
import { toast } from "@/components/Toaster";
import { Button, Card, Chips, Empty, Header, Pill, Stat } from "@/components/ui";
import { restaurants } from "@/lib/mock-data";
import { eur } from "@/lib/format";
import { acceptedBid, actions, useStore } from "@/lib/store";
import { STATUS_LABEL, type Order } from "@/lib/types";

function OrderCard({ o }: { o: Order }) {
  const [prep, setPrep] = useState(15);
  const r = restaurants.find((x) => x.id === o.restaurant_id)!;
  const bid = acceptedBid(o);
  return (
    <Card>
      <div className="flex items-center justify-between"><b>#{o.id} · {r.name}</b><Pill>{o.status === "placed" ? "NEW" : STATUS_LABEL[o.status]}</Pill></div>
      <div className="my-1.5 text-[13px] text-muted">{o.lines.map((l) => `${l.qty}× ${l.name}`).join(", ")}</div>
      <div className="text-[13px] text-muted">Deliver to {o.address}</div>
      {o.status === "placed" ? (
        <>
          <p className="mb-2 mt-3 font-bold">Set preparation time</p>
          <Chips options={[10, 15, 20, 30]} value={prep} onChange={setPrep} render={(m) => `${m} min`} />
          <Button variant="ok" onClick={() => { actions.acceptOrder(o.id, prep); toast("Accepted · order published to riders"); }}>Accept order</Button>
          <Button variant="ghost" onClick={() => toast("Reject → automatic Mollie refund (not wired yet)")}>Reject</Button>
        </>
      ) : (
        <>
          <p className="mt-3 text-sm">Prep time <b>{o.prep_minutes} min</b> · {bid ? <>rider <b>{bid.rider_name}</b> coming</> : "waiting for a rider bid"}</p>
          <Button disabled={!bid} onClick={() => { actions.markReady(o.id); toast("Rider notified: food is ready"); }}>✅ Mark ready for pickup</Button>
        </>
      )}
    </Card>
  );
}

export default function RestaurantPage() {
  const { orders } = useStore();
  const open = orders.filter((o) => ["placed", "accepted", "assigned"].includes(o.status));
  const handed = orders.filter((o) => ["ready", "picked_up", "delivered"].includes(o.status));
  const revenue = handed.reduce((a, o) => a + o.subtotal_cents, 0);
  return (
    <>
      <Header subtitle="Restaurant dashboard · Partner kitchen view" />
      <main className="p-4">
        <div className="flex gap-2.5"><Stat value={String(handed.length)} label="Handed over" /><Stat value={eur(revenue)} label="Revenue" /><Stat value={eur(Math.round(revenue * 0.12))} label="Commission 12%" /></div>
        <h2 className="mb-3 mt-4 text-lg font-bold">Incoming orders</h2>
        {open.length === 0 ? <Empty icon="🍳">No open orders right now.</Empty> : open.map((o) => <OrderCard key={o.id} o={o} />)}
      </main>
    </>
  );
}
