"use client";
import Link from "next/link";
import { useState } from "react";
import { RoleGate } from "@/components/RoleGate";
import { Button, Card, Header, Pill, Stat } from "@/components/ui";
import { restaurantStyle } from "@/lib/mock-data";
import { eur } from "@/lib/format";
import { hasSupabase } from "@/lib/supabase";
import { actions, useStore } from "@/lib/store";
import { isPaid, isTestOrder, orderHref } from "@/lib/orders";
import { STATUS_LABEL, type Order } from "@/lib/types";

const bidOf = (o: Order) => o.bids.find((b) => b.accepted);
/** Same definitions as the order_metrics view: bid within 3 min of restaurant acceptance; delivered within bid ETA. */
const fastBid = (o: Order) => {
  const b = bidOf(o);
  return !!b && new Date(b.created_at).getTime() - new Date(o.accepted_at ?? o.created_at).getTime() <= 3 * 60000;
};
const onTime = (o: Order) => {
  const b = bidOf(o);
  return !!b && !!o.delivered_at && new Date(o.delivered_at).getTime() <= new Date(b.created_at).getTime() + b.eta_minutes * 60000;
};

export default function AdminPage() {
  const { orders, earnings, restaurants } = useStore();
  const [includeTest, setIncludeTest] = useState(false);
  const scoped = orders.filter((o) => includeTest || !isTestOrder(o));
  const paid = scoped.filter(isPaid);
  const unpaidCount = scoped.filter((o) => o.status === "awaiting_payment").length;
  const failedCount = scoped.filter((o) => o.status === "payment_failed").length;
  const delivered = paid.filter((o) => o.status === "delivered");
  const fast = paid.filter(fastBid);
  const fastAndOnTime = paid.filter((o) => fastBid(o) && onTime(o));
  const keyMetric = paid.length ? Math.round((fastAndOnTime.length / paid.length) * 100) : 0;
  const revenue = paid.reduce((a, o) => a + o.subtotal_cents, 0);
  const commission = paid.reduce((a, o) => {
    const pct = restaurants.find((r) => r.id === o.restaurant_id)?.commission_pct ?? 12;
    return a + Math.round((o.subtotal_cents * Number(pct)) / 100);
  }, 0);
  const scopedIds = new Set(scoped.map((o) => o.id));
  const payoutsDue = earnings.filter((e) => !e.payout_id && (includeTest || scopedIds.has(e.order_id) || !orders.some((o) => o.id === e.order_id))).reduce((a, e) => a + e.amount_cents, 0);
  const recent = [...scoped].reverse().slice(0, 8);

  return (
    <>
      <Header subtitle="Ops / admin" />
      <main className="p-4">
        <RoleGate role="admin">
        <label className="mb-3 flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={includeTest} onChange={(e) => setIncludeTest(e.target.checked)} /> Include test orders (FP TEST…)
        </label>
        <Card className="text-center">
          <div className="text-sm text-muted">Key metric: bid accepted ≤ 3 min AND delivered on time</div>
          <div className="text-4xl font-extrabold text-brand">{keyMetric}%</div>
          <div className="text-[13px] text-muted">{fastAndOnTime.length} of {paid.length} paid order{paid.length === 1 ? "" : "s"} · {fast.length} fast bids</div>
        </Card>
        <div className="flex gap-2.5"><Stat value={String(paid.length)} label="Paid orders" /><Stat value={String(delivered.length)} label="Delivered" /><Stat value={String(unpaidCount + failedCount)} label="Unpaid / failed" /></div>
        <div className="mt-2.5 flex gap-2.5"><Stat value={eur(revenue)} label="Food revenue" /><Stat value={eur(commission)} label="Commission" /><Stat value={eur(payoutsDue)} label="Rider payouts due" /></div>
        <h2 className="mb-3 mt-4 text-lg font-bold">Recent orders</h2>
        {recent.map((o) => (
          <Link key={o.id} href={orderHref(o.id)}>
            <Card className="flex items-center justify-between">
              <span>#{o.id} {isTestOrder(o) && <Pill>TEST</Pill>}</span>
              <span className="text-sm text-muted">{STATUS_LABEL[o.status]}</span>
            </Card>
          </Link>
        ))}
        <h2 className="mb-3 mt-4 text-lg font-bold">Partner restaurants</h2>
        {restaurants.map((r) => (
          <Card key={r.id} className="flex items-center justify-between"><span>{restaurantStyle(r.id).emoji} {r.name}</span><span className="text-sm text-muted">{Number(r.commission_pct)}%</span></Card>
        ))}
        <Card className="text-[13px] text-muted">Data source: {hasSupabase ? "Supabase" : "mock data (no Supabase keys set)"}</Card>
        <Button variant="ghost" onClick={actions.reset}>{hasSupabase ? "Refresh data" : "Reset demo data"}</Button>
        </RoleGate>
      </main>
    </>
  );
}
