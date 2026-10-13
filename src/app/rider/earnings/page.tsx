"use client";
import Link from "next/link";
import { RoleGate } from "@/components/RoleGate";
import { Card, Header, Stat } from "@/components/ui";
import { eur } from "@/lib/format";
import { useStore } from "@/lib/store";

export default function EarningsPage() {
  const { earnings } = useStore();
  const unpaid = earnings.filter((e) => !e.payout_id);
  const total = unpaid.reduce((a, e) => a + e.amount_cents, 0);
  return (
    <>
      <Header subtitle="Rider app · Earnings" />
      <main className="p-4">
        <Link href="/rider" className="text-sm text-muted">← Order feed</Link>
        <RoleGate role="rider">
        <div className="mt-2.5 flex gap-2.5"><Stat value={eur(total)} label="Unpaid · paid next Monday" /><Stat value={String(earnings.length)} label="Deliveries" /></div>
        <Card className="mt-3">
          {[...earnings].reverse().map((e) => (
            <div key={e.id} className="flex items-center justify-between border-b border-[#f1eee9] py-2 last:border-0">
              <span>{e.restaurant_name}<div className="text-[13px] text-muted">{new Date(e.earned_at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</div></span>
              <b>{eur(e.amount_cents)}</b>
            </div>
          ))}
          <p className="mt-3 text-[13px] text-muted">💶 Each Monday, last week&apos;s earnings are paid out by bank transfer. You keep 100% of the delivery fee.</p>
        </Card>
        </RoleGate>
      </main>
    </>
  );
}
