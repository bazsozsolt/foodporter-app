"use client";
import { HelpButton } from "@/components/SupportSheet";
import { tx } from "@/lib/i18n";
import Link from "next/link";
import { RoleGate } from "@/components/RoleGate";
import { Card, Header, Stat } from "@/components/ui";
import { eur } from "@/lib/format";
import { useStore } from "@/lib/store";
import { WeekPay } from "@/components/RiderShifts";

export default function EarningsPage() {
  const { earnings, profile, mode } = useStore();
  const unpaid = earnings.filter((e) => !e.payout_id);
  const total = unpaid.reduce((a, e) => a + e.amount_cents, 0);
  return (
    <>
      <Header subtitle={tx("Rider · Uren en loon", "Rider · Hours and pay")} />
      <main id="main" className="p-4">
        <div className="mb-3 flex justify-end"><HelpButton role="rider" label={tx("Vraag over uitbetaling", "Payout question")} /></div>
        <RoleGate role="rider">
        {mode === "supabase" && profile?.role === "rider" && <WeekPay riderId={profile.id} />}
        <h2 className="mt-4 text-sm font-bold">{tx("Bezorgbonussen en fooien", "Delivery bonuses and tips")}</h2>
        <div className="mt-2.5 flex gap-2.5"><Stat value={eur(total)} label={tx("Nog te verwerken via de loonadministratie", "To be processed by payroll")} /><Stat value={String(earnings.length)} label={tx("Bezorgingen", "Deliveries")} /></div>
        <Card className="mt-3">
          {[...earnings].reverse().map((e) => (
            <div key={e.id} className="flex items-center justify-between border-b border-[#f1eee9] py-2 last:border-0">
              <span>{e.restaurant_name}<div className="text-[13px] text-muted">{new Date(e.earned_at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</div></span>
              <span className="text-right"><b>{eur(e.amount_cents)}</b>{(e.tip_cents ?? 0) > 0 && <div data-testid="earning-tip" className="text-[12px] text-ok">{tx(`incl. ${eur(e.tip_cents ?? 0)} fooi`, `incl. ${eur(e.tip_cents ?? 0)} tip`)}</div>}</span>
            </div>
          ))}
          <p className="mt-3 text-[13px] text-muted">{tx("Je krijgt uurloon (minimaal het cao- en minimumloon voor je leeftijd) voor alle ingeklokte uren en je garantie-uren, plus cao-toeslagen. Per bezorging komt de bezorgbonus erbovenop, plus 100% van elke fooi en 8% vakantiegeld. Uitbetaling via je loonstrook.", "You get an hourly wage (at least the CAO and minimum wage for your age) for every clocked-in hour and your guaranteed hours, plus CAO surcharges. Each delivery adds the delivery bonus on top, plus 100% of every tip and 8% holiday pay. Paid via your payslip.")}</p>
        </Card>
        </RoleGate>
      </main>
    </>
  );
}
