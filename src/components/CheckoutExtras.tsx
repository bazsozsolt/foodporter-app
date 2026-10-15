"use client";
// v17 P6: promo / referral code + credit, and "order for later" slot picker. The server (create-payment) re-validates everything.
import { useEffect, useMemo, useState } from "react";
import { tx, useLang } from "@/lib/i18n";
import { getSupabase } from "@/lib/supabase";
import { eur } from "@/lib/format";
import { slots } from "@/lib/hours";
import type { Restaurant } from "@/lib/types";
import { Card } from "@/components/ui";
import { CalendarClock, Tag } from "lucide-react";

export type Quote = { code: string | null; kind: string | null; discount_cents: number; credit_cents: number; error: string | null };

export function PromoBox({ customerId, subtotal, onQuote }: { customerId?: string; subtotal: number; onQuote: (q: Quote | null, code: string, useCredit: boolean) => void }) {
  const [code, setCode] = useState("");
  const [applied, setApplied] = useState("");
  const [useCredit, setUseCredit] = useState(false);
  const [balance, setBalance] = useState(0);
  const [q, setQ] = useState<Quote | null>(null);
  useEffect(() => { if (customerId) void getSupabase()?.rpc("my_credit_cents").then(({ data }) => setBalance(Number(data ?? 0))); }, [customerId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!customerId || (!applied && !useCredit)) { setQ(null); onQuote(null, "", false); return; }
    let live = true;
    void getSupabase()?.rpc("fp_quote_discount", { p_customer: customerId, p_subtotal: subtotal, p_code: applied, p_use_credit: useCredit }).then(({ data, error }) => {
      if (!live) return;
      const r = (data as Quote) ?? { code: null, kind: null, discount_cents: 0, credit_cents: 0, error: error?.message ?? "?" };
      setQ(r); onQuote(r, r.error ? "" : applied, useCredit);
    });
    return () => { live = false; };
  }, [customerId, subtotal, applied, useCredit]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!customerId) return null;
  return (
    <Card data-testid="promo-box">
      <b className="flex items-center gap-1.5"><Tag size={16} aria-hidden />{tx("Kortingscode of uitnodigingscode", "Promo or invite code")}</b>
      <div className="mt-2 flex gap-2">
        <input data-testid="promo-input" aria-label={tx("Code", "Code")} className="min-w-0 flex-1 rounded-xl border border-line p-3 uppercase" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20))} placeholder={tx("bv. WELKOM", "e.g. WELCOME")} />
        <button type="button" data-testid="promo-apply" disabled={!code} onClick={() => setApplied(code)} className="min-h-11 rounded-xl bg-ink px-4 text-sm font-semibold text-white disabled:opacity-40">{tx("Toepassen", "Apply")}</button>
      </div>
      {q?.error && applied && <p data-testid="promo-error" className="mt-2 text-[13px] text-danger">{q.error}</p>}
      {q && !q.error && q.discount_cents > 0 && <p data-testid="promo-ok" className="mt-2 text-[13px] text-ok">{q.kind === "referral" ? tx(`Uitnodiging: ${eur(q.discount_cents)} korting. Je vriend krijgt ook ${eur(500)} tegoed.`, `Invite: ${eur(q.discount_cents)} off. Your friend gets ${eur(500)} credit too.`) : tx(`Code toegepast: ${eur(q.discount_cents)} korting`, `Code applied: ${eur(q.discount_cents)} off`)}</p>}
      {balance > 0 && <label className="mt-2 flex min-h-11 items-center gap-2 text-sm" data-testid="use-credit"><input type="checkbox" className="h-5 w-5" checked={useCredit} onChange={(e) => setUseCredit(e.target.checked)} />{tx(`Gebruik mijn tegoed (${eur(balance)})`, `Use my credit (${eur(balance)})`)}</label>}
    </Card>
  );
}

export function SchedulePicker({ restaurant, value, onChange, mustSchedule }: { restaurant: Restaurant; value: string | null; onChange: (iso: string | null) => void; mustSchedule: boolean }) {
  const en = useLang() === "en";
  const list = useMemo(() => slots(restaurant), [restaurant]);
  const later = mustSchedule || value !== null;
  const fmt = (d: Date) => d.toLocaleString(en ? "en-GB" : "nl-NL", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" });
  return (
    <Card data-testid="schedule-picker">
      <b className="flex items-center gap-1.5"><CalendarClock size={16} aria-hidden />{tx("Wanneer?", "When?")}</b>
      <div className="mt-2 grid grid-cols-2 rounded-xl bg-subtle p-1 text-sm font-semibold">
        <button type="button" data-testid="when-now" disabled={mustSchedule} aria-pressed={!later} onClick={() => onChange(null)} className={`min-h-11 rounded-lg disabled:opacity-40 ${!later ? "bg-white shadow-sm" : "text-muted"}`}>{tx("Zo snel mogelijk", "As soon as possible")}</button>
        <button type="button" data-testid="when-later" aria-pressed={later} onClick={() => onChange(list[0]?.toISOString() ?? null)} className={`min-h-11 rounded-lg ${later ? "bg-white shadow-sm" : "text-muted"}`}>{tx("Later bestellen", "Order for later")}</button>
      </div>
      {mustSchedule && <p className="mt-2 text-[13px] text-warn">{tx("Het restaurant is nu gesloten. Kies een tijd waarop het open is.", "The restaurant is closed now. Pick a time when it's open.")}</p>}
      {later && (list.length === 0 ? <p className="mt-2 text-[13px] text-muted">{tx("Geen tijden beschikbaar in de komende 3 dagen.", "No times available in the next 3 days.")}</p> : (
        <select data-testid="slot-select" aria-label={tx("Tijdstip", "Time slot")} className="mt-2 w-full rounded-xl border border-line p-3" value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
          {!value && <option value="">{tx("Kies een tijd", "Pick a time")}</option>}
          {list.map((d) => <option key={d.toISOString()} value={d.toISOString()}>{fmt(d)}</option>)}
        </select>
      ))}
      {later && <p className="mt-1 text-[12px] text-muted">{tx("Het restaurant begint op tijd, riders bieden vlak voor je tijdstip.", "The restaurant starts in time; riders bid shortly before your slot.")}</p>}
    </Card>
  );
}
