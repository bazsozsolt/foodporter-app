"use client";
import Link from "next/link";
import { useState } from "react";
import { toast } from "@/components/Toaster";
import { Button, Card, Chips, Empty, Header, Pill } from "@/components/ui";
import { restaurants } from "@/lib/mock-data";
import { eur } from "@/lib/format";
import { acceptedBid, actions, useStore } from "@/lib/store";
import { STATUS_LABEL, type Order } from "@/lib/types";

function BidCard({ o }: { o: Order }) {
  const prep = o.prep_minutes ?? 15;
  const opts = [prep + 8, prep + 12, prep + 18, prep + 25];
  const [eta, setEta] = useState(opts[1]);
  const r = restaurants.find((x) => x.id === o.restaurant_id)!;
  return (
    <Card>
      <div className="flex items-center justify-between"><b>{r.emoji} {r.name}</b><Pill tone="ok">{eur(o.delivery_fee_cents)}</Pill></div>
      <div className="my-1.5 text-[13px] text-muted">Ready in ~{prep} min · {o.address}</div>
      <p className="mb-2 mt-3 font-bold">Bid your delivery time</p>
      <Chips options={opts} value={eta} onChange={setEta} render={(m) => `${m} min`} />
      <p className="mt-2 text-[13px] text-muted">Lowest realistic ETA wins · you keep the full fee</p>
      <Button onClick={() => { actions.placeBid(o.id, eta); toast(`Bid accepted! Customer notified: ETA ${eta} min`); }}>Place bid</Button>
    </Card>
  );
}

export default function RiderPage() {
  const { orders } = useStore();
  const open = orders.filter((o) => o.status === "accepted");
  const active = orders.filter((o) => ["assigned", "ready", "picked_up"].includes(o.status));
  return (
    <>
      <Header subtitle="Rider app · Tilburg Centrum" />
      <main className="p-4">
        {active.map((o) => {
          const bid = acceptedBid(o)!;
          return (
            <Card key={o.id}>
              <div className="flex items-center justify-between"><b>Active · #{o.id}</b><Pill>{STATUS_LABEL[o.status]}</Pill></div>
              <p className="mt-1 text-[13px] text-muted">Your ETA {bid.eta_minutes} min · to {o.address}</p>
              {o.status === "assigned" && <Empty icon="⏳">Waiting for the restaurant to mark ready…</Empty>}
              {o.status === "ready" && <Button onClick={() => { actions.pickUp(o.id); toast("Customer SMS: your food is on the way"); }}>📦 Picked up</Button>}
              {o.status === "picked_up" && <Button variant="ok" onClick={() => { actions.deliver(o.id); toast(`Delivered ✅ · ${eur(o.delivery_fee_cents)} added to earnings`); }}>✅ Delivered</Button>}
            </Card>
          );
        })}
        <h2 className="mb-3 mt-1 text-lg font-bold">Open orders</h2>
        {open.length === 0 ? <Empty icon="📭">No orders to bid on right now.</Empty> : open.map((o) => <BidCard key={o.id} o={o} />)}
        <Link href="/rider/earnings" className="mt-2 block rounded-2xl border-[1.5px] border-[#e2ded8] bg-white py-3.5 text-center font-bold">💶 Earnings history</Link>
      </main>
    </>
  );
}
