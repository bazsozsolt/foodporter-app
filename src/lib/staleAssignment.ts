/** An assignment is stale when it is still waiting to be picked up (assigned or ready)
 *  and the expected pickup time (ready_at, else assigned_at) is more than 3 hours ago.
 *  Picked-up orders are left alone: the rider already has the food.
 *  Must stay in sync with public.fp_assignment_stale (v39 migration, not applied live yet). */
export const STALE_ASSIGNMENT_GRACE_MS = 3 * 60 * 60 * 1000;

export type AssignmentTimes = {
  status: string;
  assigned_at?: string | null;
  ready_at?: string | null;
};

export function assignmentExpectedAt(o: AssignmentTimes): number | null {
  const raw = o.ready_at || o.assigned_at;
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
}

export function isStaleAssignment(o: AssignmentTimes, now = Date.now()): boolean {
  if (o.status !== "assigned" && o.status !== "ready") return false;
  const expected = assignmentExpectedAt(o);
  if (expected == null) return false;
  return expected < now - STALE_ASSIGNMENT_GRACE_MS;
}

/** Calendar date in Europe/Amsterdam, YYYY-MM-DD. */
export function amsterdamDay(d: Date | string | number): string {
  return new Date(d).toLocaleDateString("en-CA", { timeZone: "Europe/Amsterdam" });
}

export function isTodayAmsterdam(iso: string | null | undefined, now = Date.now()): boolean {
  if (!iso) return false;
  return amsterdamDay(iso) === amsterdamDay(now);
}
