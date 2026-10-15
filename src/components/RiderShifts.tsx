"use client";
import { useEffect, useState } from "react";
import { CalendarClock, Coffee, Trash2 } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { tx, useLang } from "@/lib/i18n";
import { act } from "@/lib/act";
import { eur } from "@/lib/format";
import { Button, Card, SectionHeader } from "@/components/ui";

type Slot = { id: number; starts_at: string; ends_at: string };
type Sess = { clock_in: string; clock_out: string | null };
const loc = (l: string) => (l === "en" ? "en-GB" : "nl-NL");
const hm = (m: number) => `${Math.floor(m / 60)}:${String(Math.round(m % 60)).padStart(2, "0")}`;

/** Worked minutes today and minutes since the last >= 15 min break (mirrors fp_stretch_minutes). */
function workStats(sess: Sess[], now: number) {
  const day0 = new Date(); day0.setHours(0, 0, 0, 0);
  let today = 0;
  for (const s of sess) { const a = Math.max(new Date(s.clock_in).getTime(), day0.getTime()), b = s.clock_out ? new Date(s.clock_out).getTime() : now; if (b > a) today += (b - a) / 60000; }
  const desc = [...sess].sort((x, y) => y.clock_in.localeCompare(x.clock_in));
  let stretch = 0, prevIn: number | null = null;
  for (const s of desc) {
    const ci = new Date(s.clock_in).getTime(), co = s.clock_out ? new Date(s.clock_out).getTime() : now;
    if (prevIn == null) { if (co < now - 15 * 60000) break; } else if (prevIn - co >= 15 * 60000) break;
    stretch += (co - ci) / 60000; prevIn = ci;
  }
  return { today, stretch };
}

/** Shift planning for employed riders: availability blocks + today's clocked hours and break reminder. */
export function RiderShifts({ riderId, online }: { riderId: string; online: boolean }) {
  const lang = useLang();
  const [slots, setSlots] = useState<Slot[]>([]);
  const [sess, setSess] = useState<Sess[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [rev, setRev] = useState(0);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [from, setFrom] = useState("17:00");
  const [to, setTo] = useState("21:00");
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(i); }, []);
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    const since = new Date(Date.now() - 24 * 3600e3).toISOString();
    void sb.from("rider_availability").select("id, starts_at, ends_at").eq("rider_id", riderId).gt("ends_at", new Date().toISOString()).order("starts_at").limit(30).then(({ data }) => setSlots((data ?? []) as Slot[]));
    void sb.from("work_sessions").select("clock_in, clock_out").eq("rider_id", riderId).gt("clock_in", since).then(({ data }) => setSess((data ?? []) as Sess[]));
  }, [riderId, online, rev]);
  const { today, stretch } = workStats(sess, now);
  async function add() {
    const sb = getSupabase();
    if (!sb) return;
    const s = new Date(`${date}T${from}`), e = new Date(`${date}T${to}`);
    if (e <= s) e.setDate(e.getDate() + 1);
    const ok = await act((async () => {
      if (e.getTime() - s.getTime() > 12 * 3600e3) throw new Error(tx("Een blok mag maximaal 12 uur zijn", "A block can be at most 12 hours"));
      const { error } = await sb.from("rider_availability").insert({ rider_id: riderId, starts_at: s.toISOString(), ends_at: e.toISOString() });
      if (error) throw new Error(error.message);
      return true;
    })(), tx("Beschikbaarheid opgeslagen", "Availability saved"));
    if (ok) setRev((r) => r + 1);
  }
  async function del(id: number) {
    const sb = getSupabase();
    if (!sb) return;
    const ok = await act((async () => { const { error } = await sb.from("rider_availability").delete().eq("id", id); if (error) throw new Error(error.message); return true; })(), tx("Blok verwijderd", "Block removed"));
    if (ok) setRev((r) => r + 1);
  }
  const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString(loc(lang), o);
  return (
    <section data-testid="rider-shifts" className="mb-3">
      <SectionHeader>{tx("Diensten en uren", "Shifts and hours")}</SectionHeader>
      <Card>
        <div className="flex items-center gap-2 text-sm"><CalendarClock size={16} aria-hidden /><span data-testid="worked-today">{tx("Vandaag gewerkt", "Worked today")}: <b>{hm(today)}</b> {tx("uur", "h")}</span></div>
        {online && stretch >= 300 && <p data-testid="break-warning" className="mt-2 flex items-center gap-1.5 rounded-xl bg-amber-50 p-2 text-[13px] font-semibold text-amber-900"><Coffee size={14} aria-hidden />{stretch >= 330 ? tx("Je hebt 5,5 uur gewerkt: klok uit en neem minstens 30 minuten pauze (mag in 2 × 15 min).", "You've worked 5.5 hours: clock out and take at least 30 minutes' break (2 × 15 min is fine).") : tx(`Pauze nodig over ${Math.max(0, Math.round(330 - stretch))} min (na 5,5 uur werk).`, `Break due in ${Math.max(0, Math.round(330 - stretch))} min (after 5.5 hours of work).`)}</p>}
        <p className="mt-2 text-[13px] text-muted">{tx("Online gaan = inklokken, offline gaan = uitklokken. Je krijgt je uurloon voor alle ingeklokte uren, ook als er even geen bestelling is.", "Going online = clocking in, going offline = clocking out. You're paid your hourly wage for every clocked-in hour, even when there's no order.")}</p>
        <p className="mt-3 text-sm font-semibold">{tx("Mijn beschikbaarheid", "My availability")}</p>
        <div className="mt-1 grid grid-cols-[1.4fr_1fr_1fr] gap-2">
          <input aria-label={tx("Datum", "Date")} data-testid="slot-date" type="date" className="rounded-xl border border-line p-2 text-sm" value={date} onChange={(e) => setDate(e.target.value)} />
          <input aria-label={tx("Van", "From")} data-testid="slot-from" type="time" className="rounded-xl border border-line p-2 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
          <input aria-label={tx("Tot", "To")} data-testid="slot-to" type="time" className="rounded-xl border border-line p-2 text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <Button data-testid="slot-add" variant="secondary" size="md" className="mt-2" onClick={add}>{tx("Blok toevoegen", "Add block")}</Button>
        {slots.length === 0 ? <p className="mt-2 text-[13px] text-muted">{tx("Nog geen blokken gepland.", "No blocks planned yet.")}</p> : (
          <ul data-testid="slot-list" className="mt-2 space-y-1">{slots.map((s) => (
            <li key={s.id} className="flex items-center justify-between rounded-xl bg-subtle px-3 py-1.5 text-sm"><span>{fmt(s.starts_at, { weekday: "short", day: "numeric", month: "short" })} · {fmt(s.starts_at, { hour: "2-digit", minute: "2-digit" })}–{fmt(s.ends_at, { hour: "2-digit", minute: "2-digit" })}</span>
              <button aria-label={tx("Verwijderen", "Remove")} className="p-1 text-muted" onClick={() => del(s.id)}><Trash2 size={15} /></button></li>))}</ul>)}
      </Card>
    </section>
  );
}

type Week = { week_start: string; hours: number; shifts: number; age: number | null; age_known: boolean; wml_rate_cents: number; wage_cents: number; bonus_cents: number; tips_cents: number; deliveries: number; holiday_pay_pct: number; holiday_pay_cents: number; holiday_hours: number; gross_cents: number };

/** Weekly payslip-style summary. Indicative only: the payroll provider produces the real payslip. */
export function WeekPay({ riderId }: { riderId: string }) {
  const lang = useLang();
  const [offset, setOffset] = useState(0);
  const [w, setW] = useState<Week | null>(null);
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    const d = new Date(); d.setDate(d.getDate() - 7 * offset);
    void sb.rpc("fp_rider_week", { p_rider: riderId, p_week: d.toISOString().slice(0, 10) }).then(({ data }) => setW((data as Week) ?? null));
  }, [riderId, offset]);
  if (!w) return null;
  const row = (l: string, v: string, testid?: string, strong = false) => <div data-testid={testid} className={`flex justify-between py-1 text-sm ${strong ? "border-t border-line pt-2 font-bold" : ""}`}><span>{l}</span><span>{v}</span></div>;
  return (
    <Card data-testid="week-pay" className="mt-3">
      <div className="flex items-center justify-between"><b>{tx("Weekoverzicht", "Weekly summary")} · {new Date(w.week_start).toLocaleDateString(loc(lang), { day: "numeric", month: "short" })}</b>
        <div className="flex gap-1 text-sm"><button className="rounded-lg bg-subtle px-2 py-1" onClick={() => setOffset(offset + 1)} aria-label={tx("Vorige week", "Previous week")}>←</button><button className="rounded-lg bg-subtle px-2 py-1 disabled:opacity-40" disabled={offset === 0} onClick={() => setOffset(offset - 1)} aria-label={tx("Volgende week", "Next week")}>→</button></div></div>
      <p className="mb-2 mt-1 rounded-lg bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900">{tx("Indicatief, loonadministratie via payroll", "Indicative: payroll is run by the payroll provider")}</p>
      {row(tx(`Gewerkte uren (${w.shifts} diensten)`, `Hours worked (${w.shifts} shifts)`), `${w.hours} × ${eur(w.wml_rate_cents)}`, "wp-hours")}
      {row(tx(`Uurloon (minimumloon${w.age_known ? `, ${w.age} jaar` : ""})`, `Hourly wage (minimum wage${w.age_known ? `, age ${w.age}` : ""})`), eur(w.wage_cents), "wp-wage")}
      {row(tx(`Bezorgbonus (${w.deliveries} bezorgingen)`, `Delivery bonus (${w.deliveries} deliveries)`), eur(w.bonus_cents), "wp-bonus")}
      {row(tx("Fooien (100% voor jou)", "Tips (100% yours)"), eur(w.tips_cents), "wp-tips")}
      {row(tx(`Vakantiegeld (${w.holiday_pay_pct}%)`, `Holiday pay (${w.holiday_pay_pct}%)`), eur(w.holiday_pay_cents), "wp-holiday")}
      {row(tx("Bruto (indicatief)", "Gross (indicative)"), eur(w.gross_cents), "wp-gross", true)}
      <p className="mt-1 text-xs text-muted">{tx(`Opgebouwde vakantie-uren: ${w.holiday_hours}. Netto loon, loonheffing en pensioen staan op je loonstrook van de loonadministratie.`, `Holiday hours accrued: ${w.holiday_hours}. Net pay, payroll tax and pension are on your payslip from the payroll provider.`)}</p>
    </Card>
  );
}
