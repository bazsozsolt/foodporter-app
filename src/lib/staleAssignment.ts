/** An assignment is stale when it is still waiting to be picked up (assigned or ready)
 *  and the expected pickup time (ready_at, else assigned_at) is older than the
 *  admin setting settings.stale_assignment_minutes (default 180 = 3 hours).
 *  Picked-up orders are left alone: the rider already has the food.
 *  Must stay in sync with public.fp_assignment_stale (v39). */
export const STALE_ASSIGNMENT_GRACE_MINUTES_DEFAULT = 180;
export const STALE_ASSIGNMENT_GRACE_MS = STALE_ASSIGNMENT_GRACE_MINUTES_DEFAULT * 60 * 1000;

export type AssignmentTimes = {
  status: string;
  assigned_at?: string | null;
  ready_at?: string | null;
};

export function staleAssignmentGraceMinutes(minutes?: number | null): number {
  const n = Number(minutes);
  return Number.isFinite(n) && n > 0 ? n : STALE_ASSIGNMENT_GRACE_MINUTES_DEFAULT;
}

export function staleAssignmentGraceMs(minutes?: number | null): number {
  return staleAssignmentGraceMinutes(minutes) * 60 * 1000;
}

/** Human window for NL/EN copy, e.g. "3 uur" / "3 hours" or "90 minuten" / "90 minutes". */
export function staleWindowLabel(minutes: number | null | undefined, lang: "nl" | "en"): string {
  const m = staleAssignmentGraceMinutes(minutes);
  if (m % 60 === 0) {
    const h = m / 60;
    if (lang === "nl") return h === 1 ? "1 uur" : `${h} uur`;
    return h === 1 ? "1 hour" : `${h} hours`;
  }
  if (lang === "nl") return `${m} minuten`;
  return m === 1 ? "1 minute" : `${m} minutes`;
}

export function assignmentExpectedAt(o: AssignmentTimes): number | null {
  const raw = o.ready_at || o.assigned_at;
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
}

export function isStaleAssignment(o: AssignmentTimes, now = Date.now(), minutes?: number | null): boolean {
  if (o.status !== "assigned" && o.status !== "ready") return false;
  const expected = assignmentExpectedAt(o);
  if (expected == null) return false;
  return expected < now - staleAssignmentGraceMs(minutes);
}

/** Calendar date in Europe/Amsterdam, YYYY-MM-DD. */
export function amsterdamDay(d: Date | string | number): string {
  return new Date(d).toLocaleDateString("en-CA", { timeZone: "Europe/Amsterdam" });
}

export function isTodayAmsterdam(iso: string | null | undefined, now = Date.now()): boolean {
  if (!iso) return false;
  return amsterdamDay(iso) === amsterdamDay(now);
}
