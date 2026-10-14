// Every admin report must answer quickly and without errors (run after the pilot-evening simulation).
import { login, ok, summary } from "./common.mjs";
const admin = await login("ADMIN"), cust = await login("CUST2");
const p_from = new Date(Date.now() - 30 * 86400000).toISOString(), p_to = new Date(Date.now() + 86400000).toISOString();
for (const fn of ["report_key_metric", "report_delivery", "report_quality", "report_safety", "report_payments", "report_groups"]) {
  const t = Date.now(); const r = await admin.sb.rpc(fn, { p_from, p_to }); const ms = Date.now() - t;
  ok(`${fn} answers in < 2 s`, !r.error && ms < 2000, r.error?.message ?? `${ms} ms`);
  const d = await cust.sb.rpc(fn, { p_from, p_to }); ok(`${fn} denied to customers`, !!d.error, d.error?.message);
}
const g = (await admin.sb.rpc("report_groups", { p_from, p_to })).data;
ok("group report: counts + conversion + basket", g.groups >= 7 && g.paid >= 4 && g.conversion_pct > 0 && g.avg_basket_cents > 0 && g.avg_members > 1, JSON.stringify({ groups: g.groups, paid: g.paid, conv: g.conversion_pct, size: g.avg_members, basket: g.avg_basket_cents, solo: g.avg_solo_basket_cents }));
const k = (await admin.sb.rpc("report_key_metric", { p_from, p_to })).data;
ok("key metric counts paid-then-cancelled as misses", k.cancelled_after_payment > 0 && k.paid >= k.hits, JSON.stringify({ pct: k.pct, hits: k.hits, paid: k.paid, no_bid: k.no_bid, cancelled: k.cancelled_after_payment }));
process.exit(summary() ? 1 : 0);
