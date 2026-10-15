// Dumps admin report output for a fixed closed window so it can be reconciled against SQL totals.
import { login } from "../e2e/common.mjs";
const a = await login("ADMIN");
const p_from = process.argv[2] ?? "2026-09-01T00:00:00Z", p_to = process.argv[3] ?? "2026-10-15T00:00:00Z";
for (const fn of ["report_payments", "report_delivery", "report_key_metric", "report_support"]) {
  const r = await a.sb.rpc(fn, { p_from, p_to });
  console.log("##", fn, r.error?.message ?? JSON.stringify(r.data).slice(0, 1500));
}
const p = await a.sb.rpc("fp_payroll_week", { p_week: "2026-10-05" });
console.log("## payroll 2026-10-05", p.error?.message ?? JSON.stringify((p.data ?? []).filter((r) => r.minutes > 0 || r.deliveries > 0).map((r) => ({ id: r.rider_id.slice(0, 8), m: r.minutes, d: r.deliveries, b: r.bonus_cents, t: r.tips_cents }))));
process.exit(0);
