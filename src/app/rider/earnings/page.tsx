"use client";
import { HelpButton } from "@/components/SupportSheet";
import { tx } from "@/lib/i18n";
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
      <Header subtitle={tx("Rider · Verdiensten", "Rider · Earnings")} />
      <main id="main" className="p-4">
        <div className="mb-3 flex justify-end"><HelpButton role="rider" label={tx("Vraag over uitbetaling", "Payout question")} /></div>
        <RoleGate role="rider">
        <div className="mt-2.5 flex gap-2.5"><Stat value={eur(total)} label={tx("Openstaand · uitbetaald komende maandag", "Unpaid · paid next Monday")} /><Stat value={String(earnings.length)} label={tx("Bezorgingen", "Deliveries")} /></div>
        <Card className="mt-3">
          {[...earnings].reverse().map((e) => (
            <div key={e.id} className="flex items-center justify-between border-b border-[#f1eee9] py-2 last:border-0">
              <span>{e.restaurant_name}<div className="text-[13px] text-muted">{new Date(e.earned_at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</div></span>
              <span className="text-right"><b>{eur(e.amount_cents)}</b>{(e.tip_cents ?? 0) > 0 && <div data-testid="earning-tip" className="text-[12px] text-ok">{tx(`incl. ${eur(e.tip_cents ?? 0)} fooi`, `incl. ${eur(e.tip_cents ?? 0)} tip`)}</div>}</span>
            </div>
          ))}
          <p className="mt-3 text-[13px] text-muted">{tx("Elke maandag worden de verdiensten van vorige week per bankoverschrijving uitbetaald. Je houdt 100% van de bezorgvergoeding en 100% van elke fooi.", "Each Monday, last week’s earnings are paid out by bank transfer. You keep 100% of the delivery fee and 100% of every tip.")}</p>
        </Card>
        </RoleGate>
      </main>
    </>
  );
}
