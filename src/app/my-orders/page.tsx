"use client";
import Link from "next/link";
import { ReorderButton } from "@/components/ReorderButton";
import { Card, Empty, Header, Pill } from "@/components/ui";
import { eur } from "@/lib/format";
import { orderHref } from "@/lib/orders";
import { useStore } from "@/lib/store";
import { STATUS_LABEL } from "@/lib/types";

export default function MyOrders() {
  const { orders, profile, restaurants, ready, signedIn, mode } = useStore();
  const mine = [...orders].filter((o) => mode === "mock" || o.customer_id === profile?.id).sort((a, b) => Number(b.id) - Number(a.id));
  return (
    <>
      <Header subtitle="Your orders" />
      <main className="p-4">
        <Link href="/" className="text-sm text-muted">← Home</Link>
        <h2 className="my-3 text-lg font-bold">Order history</h2>
        {!ready ? <p className="text-muted">Loading…</p>
          : !signedIn ? <Empty icon="🔐"><Link className="text-brand" href="/login?next=/my-orders">Sign in</Link> to see your orders.</Empty>
          : mine.length === 0 ? <Empty icon="🧾">No orders yet. <Link className="text-brand" href="/">Find something tasty</Link></Empty>
          : mine.map((o) => (
            <Link key={o.id} href={orderHref(o.id)}>
              <Card>
                <div className="flex items-center justify-between"><b>#{o.id} · {restaurants.find((r) => r.id === o.restaurant_id)?.name ?? "Restaurant"}</b><Pill tone={o.status === "delivered" ? "ok" : undefined}>{STATUS_LABEL[o.status]}</Pill></div>
                <div className="mt-1 text-[13px] text-muted">{new Date(o.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {o.lines.map((l) => `${l.qty}× ${l.name}`).join(", ")}</div>
                <div className="mt-1 text-sm font-semibold">{eur(o.subtotal_cents + o.delivery_fee_cents)}{o.refund_cents ? <span className="ml-2 text-xs font-normal text-muted">refunded {eur(o.refund_cents)}</span> : null}</div>
                {o.status === "delivered" && <ReorderButton id={o.id} />}
              </Card>
            </Link>
          ))}
      </main>
    </>
  );
}
