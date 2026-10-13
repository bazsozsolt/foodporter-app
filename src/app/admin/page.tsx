"use client";
import { Button, Card, Header, Stat } from "@/components/ui";
import { restaurants } from "@/lib/mock-data";
import { eur } from "@/lib/format";
import { hasSupabase } from "@/lib/supabase";
import { actions, useStore } from "@/lib/store";

export default function AdminPage() {
  const { orders, earnings } = useStore();
  const bidded = orders.filter((o) => o.bids.some((b) => b.accepted));
  const fast = bidded.filter((o) => {
    const b = o.bids.find((x) => x.accepted)!;
    return new Date(b.created_at).getTime() - new Date(o.created_at).getTime() <= 3 * 60000;
  });
  const delivered = orders.filter((o) => o.status === "delivered");
  const onTime = delivered.filter((o) => {
    const b = o.bids.find((x) => x.accepted);
    return b && o.delivered_at && new Date(o.delivered_at).getTime() <= new Date(b.created_at).getTime() + b.eta_minutes * 60000;
  });
  const keyMetric = orders.length ? Math.round((onTime.filter((o) => fast.includes(o)).length / orders.length) * 100) : 0;
  const unpaid = earnings.filter((e) => !e.payout_id).reduce((a, e) => a + e.amount_cents, 0);
  return (
    <>
      <Header subtitle="Ops / admin" />
      <main className="p-4">
        <Card className="text-center">
          <div className="text-sm text-muted">Key metric: bid accepted ≤ 3 min AND delivered on time</div>
          <div className="text-4xl font-extrabold text-brand">{keyMetric}%</div>
          <div className="text-[13px] text-muted">{orders.length} orders · {fast.length} fast bids · {onTime.length} on time</div>
        </Card>
        <div className="flex gap-2.5"><Stat value={String(delivered.length)} label="Delivered" /><Stat value={eur(unpaid)} label="Rider payouts due" /></div>
        <h2 className="mb-3 mt-4 text-lg font-bold">Partner restaurants</h2>
        {restaurants.map((r) => (
          <Card key={r.id} className="flex items-center justify-between"><span>{r.emoji} {r.name}</span><span className="text-sm text-muted">{r.commission_pct}%</span></Card>
        ))}
        <Card className="text-[13px] text-muted">Data source: {hasSupabase ? "Supabase" : "mock data (no Supabase keys set)"}</Card>
        <Button variant="ghost" onClick={actions.reset}>Reset demo data</Button>
      </main>
    </>
  );
}
