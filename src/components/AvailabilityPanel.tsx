"use client";
// v17 P3: pause / busy mode (orders tab) and weekly hours + holiday closures (menu tab). Saved via restaurant_set_availability().
import { useState } from "react";
import { act } from "@/lib/act";
import { tx as txLang, useLang } from "@/lib/i18n";
const pickLang = (en: boolean) => (nl: string, eng: string) => (en ? eng : txLang(nl, eng));
const tx = pickLang(false);
import { getSupabase } from "@/lib/supabase";
import { actions, useStore } from "@/lib/store";
import { DAYS_EN, DAYS_NL, nextLabel, openState, type Hours } from "@/lib/hours";
import { Button, Card, SectionHeader } from "@/components/ui";
import { Pause, Play, Timer } from "lucide-react";

async function save(rid: string, args: Record<string, unknown>, done: string) {
  const ok = await act((async () => {
    const { error } = await getSupabase()!.rpc("restaurant_set_availability", { p_rid: rid, ...args });
    if (error) throw new Error(error.message);
    return true;
  })(), done);
  if (ok) actions.reloadCatalog();
  return ok;
}

export function PauseBusyPanel({ restaurantId }: { restaurantId: string }) {
  const r = useStore().restaurants.find((x) => x.id === restaurantId);
  const en = useLang() === "en";
  if (!r) return null;
  const s = openState(r);
  const paused = r.paused_until && new Date(r.paused_until) > new Date();
  const busy = r.busy_extra_minutes ?? 0;
  const until = paused ? new Date(r.paused_until!).toLocaleTimeString(en ? "en-GB" : "nl-NL", { hour: "2-digit", minute: "2-digit" }) : "";
  return (
    <Card data-testid="pause-busy" className="mb-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <b>{tx("Bestellingen ontvangen", "Taking orders")}</b>
        <span data-testid="open-status" className={`rounded-full px-2.5 py-0.5 text-[12px] font-bold ${s.open ? "bg-[#e3f7ee] text-ok" : "bg-gold-soft text-warn"}`}>
          {s.open ? tx("Nu open", "Open now") : paused ? tx(`Gepauzeerd tot ${until}`, `Paused until ${until}`) : `${tx("Gesloten", "Closed")} · ${nextLabel(s, en)}`}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {paused
          ? <Button size="md" variant="ok" data-testid="resume" data-persist icon={<Play size={16} aria-hidden />} onClick={() => save(restaurantId, { p_pause_minutes: 0 }, tx("Weer open voor bestellingen", "Taking orders again"))}>{tx("Hervatten", "Resume")}</Button>
          : [30, 60].map((m) => <Button key={m} size="md" variant="secondary" data-testid={`pause-${m}`} data-persist icon={<Pause size={16} aria-hidden />} onClick={() => save(restaurantId, { p_pause_minutes: m }, tx(`Gepauzeerd voor ${m} min`, `Paused for ${m} min`))}>{tx(`Pauze ${m} min`, `Pause ${m} min`)}</Button>)}
      </div>
      <p className="mb-1 mt-3 flex items-center gap-1 text-[13px] font-semibold"><Timer size={14} aria-hidden />{tx("Druk? Extra bereidingstijd", "Busy? Extra prep time")}</p>
      <div className="flex flex-wrap gap-2">
        {[0, 10, 20, 30].map((m) => (
          <button key={m} type="button" data-testid={`busy-${m}`} data-persist aria-pressed={busy === m} onClick={() => save(restaurantId, { p_busy: m }, m ? tx(`+${m} min voor nieuwe bestellingen`, `+${m} min for new orders`) : tx("Normale bereidingstijd", "Normal prep time"))}
            className={`min-h-10 rounded-full px-4 text-sm font-semibold ring-1 ${busy === m ? "bg-ink text-white ring-ink" : "bg-white ring-line"}`}>{m ? `+${m} min` : tx("Normaal", "Normal")}</button>
        ))}
      </div>
      <p className="mt-2 text-[12px] text-muted">{tx("Klanten zien de langere tijd. Tijdens een pauze kun je niet besteld worden.", "Customers see the longer time. While paused, nobody can order.")}</p>
    </Card>
  );
}

const DEFAULT: Hours = { "1": [["11:00", "21:30"]], "2": [["11:00", "21:30"]], "3": [["11:00", "21:30"]], "4": [["11:00", "22:00"]], "5": [["11:00", "23:00"]], "6": [["12:00", "23:00"]], "7": [["12:00", "21:00"]] };

export function HoursPanel({ restaurantId, english = false }: { restaurantId: string; english?: boolean }) {
  const r = useStore().restaurants.find((x) => x.id === restaurantId);
  const lang = useLang();
  const en = english || lang === "en";
  const tx = pickLang(english);
  const [draft, setDraft] = useState<Hours | null>(null);
  const [day, setDay] = useState("");
  if (!r) return null;
  const hours: Hours = draft ?? (r.opening_hours as Hours | null) ?? DEFAULT;
  const set = (d: string, v: [string, string][]) => setDraft({ ...hours, [d]: v });
  const closed = r.closed_dates ?? [];
  const input = "rounded-lg border border-line px-2 py-1.5 text-sm";
  return (
    <section data-testid="hours-panel" className="mb-4">
      <SectionHeader>{tx("Openingstijden", "Opening hours")}</SectionHeader>
      {!r.opening_hours && <p className="mb-2 text-[13px] text-muted">{tx("Nog geen tijden ingesteld: je bent nu altijd open. Sla hieronder je tijden op.", "No hours set yet: you are always open. Save your hours below.")}</p>}
      {r.hours_test && <p className="mb-2 text-[12px] italic text-muted">{tx("testwaarden, controleer", "test values, please check")}</p>}
      <Card className="!p-3">
        {DAYS_NL.map((_, i) => {
          const d = String(i + 1); const slot = hours[d]?.[0];
          return (
            <div key={d} className="flex flex-wrap items-center gap-2 border-b border-[#f1eee9] py-1.5 last:border-0" data-testid={`hours-day-${d}`}>
              <span className="w-10 font-semibold">{en ? DAYS_EN[i] : DAYS_NL[i]}</span>
              <label className="flex items-center gap-1 text-[13px]"><input type="checkbox" checked={!!slot} onChange={(e) => set(d, e.target.checked ? [["11:00", "21:00"]] : [])} />{tx("geopend", "open")}</label>
              {slot && <>
                <input aria-label={tx("Opent", "Opens")} type="time" className={input} value={slot[0]} onChange={(e) => set(d, [[e.target.value, slot[1]]])} />
                <span>–</span>
                <input aria-label={tx("Sluit", "Closes")} type="time" className={input} value={slot[1] === "24:00" ? "23:59" : slot[1]} onChange={(e) => set(d, [[slot[0], e.target.value]])} />
              </>}
            </div>
          );
        })}
        <Button className="mt-2" data-testid="save-hours" data-persist disabled={!draft} onClick={async () => { if (await save(restaurantId, { p_hours: hours, p_set_hours: true }, tx("Openingstijden opgeslagen", "Opening hours saved"))) setDraft(null); }}>{tx("Tijden opslaan", "Save hours")}</Button>
      </Card>
      <SectionHeader>{tx("Feestdagen en sluiting", "Holidays and closures")}</SectionHeader>
      <Card className="!p-3" data-testid="closures">
        {closed.length === 0 && <p className="text-[13px] text-muted">{tx("Geen geplande sluitingsdagen.", "No planned closures.")}</p>}
        <div className="flex flex-wrap gap-1.5">{closed.map((c) => (
          <button key={c} type="button" data-persist className="min-h-9 rounded-full bg-subtle px-3 text-[13px]" aria-label={tx(`Verwijder ${c}`, `Remove ${c}`)} onClick={() => save(restaurantId, { p_closed: closed.filter((x) => x !== c) }, tx("Sluitingsdag verwijderd", "Closure removed"))}>{c} ×</button>
        ))}</div>
        <div className="mt-2 flex gap-2">
          <input type="date" data-testid="closure-date" aria-label={tx("Datum", "Date")} className={input} value={day} onChange={(e) => setDay(e.target.value)} />
          <Button variant="secondary" data-persist data-testid="add-closure" disabled={!day} onClick={async () => { if (await save(restaurantId, { p_closed: [...closed, day] }, tx("Sluitingsdag toegevoegd", "Closure added"))) setDay(""); }}>{tx("Toevoegen", "Add")}</Button>
        </div>
      </Card>
    </section>
  );
}
