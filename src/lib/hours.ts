// Opening hours (v17 P3). Mirrors fp_restaurant_open() in SQL; the server is the authority (create-payment).
import type { Restaurant } from "./types";
export type Hours = Record<string, [string, string][]>; // ISO weekday "1".."7" -> slots
export const DAYS_NL = ["ma", "di", "wo", "do", "vr", "za", "zo"];
export const DAYS_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Wall-clock parts in Europe/Amsterdam. */
export function amsParts(d: Date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
  const dow = DAYS_EN.indexOf(p.weekday) + 1;
  return { date: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}`, dow };
}

export type OpenState = { open: boolean; reason: "paused" | "holiday" | "closed" | null; next: { dow: number; time: string; inDays: number } | null; pausedUntil?: string | null };

export function openState(r: Pick<Restaurant, "opening_hours" | "closed_dates" | "paused_until">, now = new Date()): OpenState {
  const { date, hm, dow } = amsParts(now);
  const closed = new Set(r.closed_dates ?? []);
  const hours = r.opening_hours as Hours | null | undefined;
  const paused = r.paused_until && new Date(r.paused_until) > now;
  const inSlot = (d: number, t: string) => (hours?.[String(d)] ?? []).some(([a, b]) => t >= a && t < b);
  const isOpen = !paused && !closed.has(date) && (!hours || inSlot(dow, hm));
  if (isOpen) return { open: true, reason: null, next: null };
  // next opening (within 8 days)
  let next: OpenState["next"] = null;
  for (let i = 0; i < 8 && !next; i++) {
    const day = new Date(now.getTime() + i * 864e5); const pd = amsParts(day);
    if (closed.has(pd.date)) continue;
    if (!hours) { next = { dow: pd.dow, time: i === 0 && paused ? amsParts(new Date(r.paused_until!)).hm : "00:00", inDays: i }; break; }
    for (const [a, b] of hours[String(pd.dow)] ?? []) {
      if (i === 0 && b <= hm) continue;
      const start = i === 0 && a < hm ? hm : a;
      if (i === 0 && paused && amsParts(new Date(r.paused_until!)).hm >= b) continue;
      next = { dow: pd.dow, time: i === 0 && paused && amsParts(new Date(r.paused_until!)).hm > start ? amsParts(new Date(r.paused_until!)).hm : start, inDays: i }; break;
    }
  }
  return { open: false, reason: paused ? "paused" : closed.has(date) ? "holiday" : "closed", next, pausedUntil: r.paused_until };
}

/** "opent om 17:00" / "opent morgen 11:00" / "opent di 11:00" */
export function nextLabel(s: OpenState, en: boolean) {
  if (!s.next) return en ? "closed for now" : "voorlopig gesloten";
  const { inDays, time, dow } = s.next;
  if (inDays === 0) return en ? `opens at ${time}` : `opent om ${time}`;
  if (inDays === 1) return en ? `opens tomorrow ${time}` : `opent morgen ${time}`;
  return en ? `opens ${DAYS_EN[dow - 1]} ${time}` : `opent ${DAYS_NL[dow - 1]} ${time}`;
}
