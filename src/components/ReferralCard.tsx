"use client";
// v17 P6: the customer's own invite code and credit balance.
import { useEffect, useState } from "react";
import { tx } from "@/lib/i18n";
import { getSupabase } from "@/lib/supabase";
import { eur } from "@/lib/format";
import { toast } from "@/components/Toaster";
import { Card } from "@/components/ui";
import { Gift } from "lucide-react";

export function ReferralCard() {
  const [code, setCode] = useState<string | null>(null);
  const [credit, setCredit] = useState(0);
  useEffect(() => {
    const sb = getSupabase(); if (!sb) return;
    void sb.rpc("my_referral_code").then(({ data }) => setCode((data as string) ?? null));
    void sb.rpc("my_credit_cents").then(({ data }) => setCredit(Number(data ?? 0)));
  }, []);
  if (!code) return null;
  const share = async () => {
    const text = tx(`Bestel bij Food Porter met mijn code ${code} en krijg €5 korting op je eerste bestelling.`, `Order on Food Porter with my code ${code} and get €5 off your first order.`);
    try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); toast(tx("Gekopieerd", "Copied")); } } catch { toast(tx(`Jouw code: ${code}`, `Your code: ${code}`)); }
  };
  return (
    <Card data-testid="referral-card" className="flex items-center gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand"><Gift size={20} aria-hidden /></span>
      <span className="min-w-0 flex-1 text-sm"><b className="block">{tx("Nodig een vriend uit", "Invite a friend")}: <span data-testid="my-referral-code" className="font-mono">{code}</span></b>
        <span className="text-[13px] text-muted">{tx("Je vriend krijgt €5 korting, jij €5 tegoed.", "Your friend gets €5 off, you get €5 credit.")} {tx("Jouw tegoed", "Your credit")}: <b data-testid="my-credit">{eur(credit)}</b></span></span>
      <button type="button" onClick={share} className="min-h-10 rounded-xl border border-line px-3 text-sm font-semibold">{tx("Delen", "Share")}</button>
    </Card>
  );
}
