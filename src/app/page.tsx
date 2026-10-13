"use client";
import Link from "next/link";
import { Card, Header, Pill } from "@/components/ui";
import { DELIVERY_FEE_CENTS, restaurantStyle } from "@/lib/mock-data";
import { eur } from "@/lib/format";
import { useStore } from "@/lib/store";
import { STATUS_LABEL } from "@/lib/types";

export default function Home() {
  const { orders, signedIn, restaurants, ready } = useStore();
  const active = [...orders].reverse().find((o) => o.status !== "delivered" && o.status !== "cancelled");
  return (
    <>
      <Header subtitle="Tilburg Centrum · local spots, riders bid to deliver fast" />
      <main className="p-4">
        {!signedIn && (
          <Card className="flex items-center justify-between bg-[#fff1ea]">
            <span className="text-sm">Sign in to order</span>
            <Link href="/login" className="rounded-xl bg-brand px-3 py-2 text-sm font-bold text-white">Sign in</Link>
          </Card>
        )}
        {active && (
          <Link href={`/orders/${active.id}`}><Card className="flex items-center justify-between bg-[#fff1ea]"><b>🛵 Track order #{active.id}</b><Pill>{STATUS_LABEL[active.status]}</Pill></Card></Link>
        )}
        <h2 className="mb-3 mt-1 text-lg font-bold">Restaurants near you</h2>
        {ready && restaurants.length === 0 && <p className="text-sm text-muted">No restaurants yet (seed the database).</p>}
        {restaurants.filter((r) => r.active).map((r) => (
          <Link key={r.id} href={`/r/${r.id}`}>
            <Card className="flex items-center gap-3">
              <div className="grid h-16 w-16 place-items-center rounded-2xl text-3xl" style={{ background: restaurantStyle(r.id).color }}>{restaurantStyle(r.id).emoji}</div>
              <div className="flex-1">
                <h3 className="font-bold">{r.name}</h3>
                <div className="text-[13px] text-muted">{r.cuisine} · {r.area}</div>
                <div className="mt-1.5 flex gap-1.5"><Pill>~{r.avg_prep_minutes + 12} min</Pill><Pill tone="ok">{eur(DELIVERY_FEE_CENTS)} delivery</Pill></div>
              </div>
            </Card>
          </Link>
        ))}
      </main>
    </>
  );
}
