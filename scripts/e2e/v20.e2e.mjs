// v20: CAO profile (surcharges, holidays), contract kinds (on-call 3 h minimum, min-max top-up, short-notice
// cancellation pay, overtime), call-in roster + decline, 12 h rest gate, fixed-hours offer alert. Test riders only.
import { client, login, ok, summary } from "./common.mjs";
const anon = client();
const admin = await login("ADMIN"), rider = await login("SIMR3"), other = await login("SIMR1"), out = await login("OUTSIDER");
const err = (r) => r?.error?.message ?? null;
const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
const inH = (h) => new Date(Date.now() + h * 3600e3).toISOString();
const status = async () => (await rider.sb.rpc("my_legal_status")).data;
const week = async (d) => (await admin.sb.rpc("fp_rider_week", { p_rider: rider.id, p_week: d })).data;
const sess = (a, b) => admin.sb.from("work_sessions").insert({ rider_id: rider.id, clock_in: a, clock_out: b, closed_by: "admin", is_test: true });
const wasOnline = (await admin.sb.from("profiles").select("online").eq("id", rider.id).single()).data.online;
const clean = async () => {
  await admin.sb.from("profiles").update({ online: false }).eq("id", rider.id);
  await admin.sb.from("work_sessions").delete().eq("rider_id", rider.id).gte("clock_in", "2026-05-01T00:00:00Z");
  await admin.sb.from("rider_shifts").delete().eq("rider_id", rider.id);
  await admin.sb.from("rider_hr").upsert({ profile_id: rider.id, contract_type: "employment", birthdate: null, contract_kind: "on_call", min_hours_week: null, max_hours_week: null, start_date: null, fixed_offer_at: null, offer_alerted_at: null });
};
try {
  await clean();
  const s = (await anon.from("settings").select("cao, surcharge_sun_pct, min_call_hours, rest_min_h, atw_break_after_h, holiday_hours_pct").single()).data;
  ok("CAO BGV profile active", s?.cao === "bgv" && Number(s.surcharge_sun_pct) === 100 && Number(s.min_call_hours) === 3 && Number(s.rest_min_h) === 12 && Number(s.atw_break_after_h) === 4.5, JSON.stringify(s));
  ok("rest below 11 h rejected", err(await admin.sb.from("settings").update({ rest_min_h: 10 }).eq("id", true)) !== null);
  ok("call minimum below 3 h rejected", err(await admin.sb.from("settings").update({ min_call_hours: 2 }).eq("id", true)) !== null);
  ok("notice below 4 days rejected", err(await admin.sb.from("settings").update({ call_notice_days: 3 }).eq("id", true)) !== null);
  ok("holidays readable", ((await rider.sb.from("public_holidays").select("day").gte("day", "2026-01-01").lte("day", "2026-12-31")).data ?? []).length >= 7);
  ok("rider cannot edit holidays", err(await rider.sb.from("public_holidays").insert({ day: "2026-08-01", name: "x" })) !== null);

  // surcharges (age unknown → 21+ rate 1499)
  await sess("2026-09-13T10:00:00Z", "2026-09-13T12:00:00Z"); // Sunday 12–14
  await sess("2026-09-11T19:00:00Z", "2026-09-11T21:00:00Z"); // Friday 21–23 night
  let w = await week("2026-09-07");
  ok("Sunday +100%", Number(w?.sun_hours) === 2 && w.surcharge_sun_cents === 2998, JSON.stringify(w && { sun: w.sun_hours, c: w.surcharge_sun_cents }));
  ok("night +19% (21–05)", Number(w?.night_hours) === 2 && w.surcharge_night_cents === 570, JSON.stringify(w && { n: w.night_hours, c: w.surcharge_night_cents }));
  ok("holiday pay includes surcharges", w?.holiday_pay_cents === Math.round((w.wage_cents + w.guarantee_cents + w.surcharge_cents + w.bonus_cents) * 0.08));
  await sess("2026-05-25T10:00:00Z", "2026-05-25T12:00:00Z"); // Tweede Pinksterdag
  w = await week("2026-05-25");
  ok("public holiday +100%", Number(w?.holiday_hours_worked) === 2 && w.surcharge_holiday_cents === 2998 && w.surcharge_sat_cents === 0);

  // on-call: 3 h minimum per call-in + short-notice cancellation paid
  const sh = async (a, b) => (await admin.sb.from("rider_shifts").insert({ rider_id: rider.id, starts_at: a, ends_at: b }).select("id").single()).data?.id;
  await sh("2026-06-02T10:00:00Z", "2026-06-02T14:00:00Z");
  await sess("2026-06-02T10:00:00Z", "2026-06-02T11:00:00Z");
  const c1 = await sh("2026-06-03T10:00:00Z", "2026-06-03T14:00:00Z");
  const c2 = await sh("2026-06-04T10:00:00Z", "2026-06-04T14:00:00Z");
  await admin.sb.from("rider_shifts").update({ status: "cancelled" }).in("id", [c1, c2]);
  await admin.sb.from("rider_shifts").update({ cancelled_at: "2026-05-29T10:00:00Z" }).eq("id", c2); // 6 days ahead: on time
  w = await week("2026-06-01");
  ok("on-call: 1 h worked paid as 3 h", Number(w?.guarantee_callin_hours) === 2 && w.call_ins === 1, JSON.stringify(w && { g: w.guarantee_callin_hours, c: w.call_ins }));
  ok("cancel < 4 days: hours paid; on time: not", Number(w?.guarantee_cancel_hours) === 4 && Number(w.paid_hours) === 7, JSON.stringify(w && { c: w.guarantee_cancel_hours, p: w.paid_hours }));
  ok("guarantee at base rate", w?.guarantee_cents === Math.round(6 * 1499) && w.contract_kind === "on_call");

  // min-max 6–12: minimum paid when not worked, overtime above max
  ok("min > max rejected", err(await admin.sb.from("rider_hr").update({ contract_kind: "min_max", min_hours_week: 12, max_hours_week: 6 }).eq("profile_id", rider.id)) !== null);
  ok("min-max set", !err(await admin.sb.from("rider_hr").update({ contract_kind: "min_max", min_hours_week: 6, max_hours_week: 12 }).eq("profile_id", rider.id)));
  await sess("2026-06-09T10:00:00Z", "2026-06-09T11:00:00Z");
  w = await week("2026-06-08");
  ok("min-max: 1 h worked → 6 h paid", Number(w?.guarantee_minmax_hours) === 5 && Number(w.paid_hours) === 6, JSON.stringify(w && { g: w.guarantee_minmax_hours, p: w.paid_hours }));
  for (const d of [15, 16, 17, 18, 19]) await sess(`2026-06-${d}T08:00:00Z`, `2026-06-${d}T11:00:00Z`);
  w = await week("2026-06-15");
  ok("overtime +30% above max hours", Number(w?.overtime_hours) === 3 && w.surcharge_overtime_cents === Math.round(3 * 1499 * 0.3) && Number(w.guarantee_minmax_hours) === 0, JSON.stringify(w && { o: w.overtime_hours }));
  const pw = (await admin.sb.rpc("fp_payroll_week", { p_week: "2026-06-15" })).data ?? [];
  ok("export carries contract kind + surcharges", pw.some((r) => r.rider_id === rider.id && r.contract_kind === "min_max" && r.surcharge_overtime_cents > 0) && !JSON.stringify(pw).match(/bsn|loonheffingskorting/i));

  // roster: rider sees own call-ins, declines short-notice ones only
  const soon = await sh(inH(48), inH(52));
  const far = await sh(inH(24 * 6), inH(24 * 6 + 4));
  ok("rider sees own call-ins", ((await rider.sb.from("rider_shifts").select("id").in("id", [soon, far])).data ?? []).length === 2);
  ok("others cannot see call-ins", ((await other.sb.from("rider_shifts").select("id").eq("rider_id", rider.id)).data ?? []).length === 0);
  ok("rider cannot create call-ins", err(await rider.sb.from("rider_shifts").insert({ rider_id: rider.id, starts_at: inH(30), ends_at: inH(32) })) !== null);
  ok("rider cannot edit call-ins", ((await rider.sb.from("rider_shifts").update({ status: "cancelled" }).eq("id", far).select("id")).data ?? []).length === 0);
  ok("other rider cannot decline", err(await other.sb.rpc("rider_decline_shift", { p_id: soon })) !== null);
  ok("decline on time-notice call-in refused", /notice/.test(err(await rider.sb.rpc("rider_decline_shift", { p_id: far })) ?? ""));
  ok("decline short-notice call-in", !err(await rider.sb.rpc("rider_decline_shift", { p_id: soon })) && (await rider.sb.from("rider_shifts").select("status").eq("id", soon).single()).data?.status === "declined");
  ok("> 12 h call-in rejected", err(await admin.sb.from("rider_shifts").insert({ rider_id: rider.id, starts_at: inH(24), ends_at: inH(37) })) !== null);

  // 12 h rest between shifts
  await admin.sb.from("work_sessions").delete().eq("rider_id", rider.id).gte("clock_in", ago(60 * 48));
  await sess(ago(780), ago(600)); // shift started 13 h ago, ended 10 h ago
  let st = await status();
  const rest = (st?.missing ?? []).find((m) => m.startsWith("atw_rest:"));
  ok("rest < 12 h blocks", !!rest && Math.abs(new Date(rest.slice(9)).getTime() - (Date.now() + 2 * 3600e3)) < 120e3, JSON.stringify(st?.missing));
  ok("clock-in blocked with rest time", /atw_rest/.test(err(await rider.sb.from("profiles").update({ online: true }).eq("id", rider.id)) ?? ""));
  ok("admin rest overview lists rider", ((await admin.sb.rpc("fp_rest_overview")).data ?? []).some((r) => r.rider_id === rider.id));
  ok("rest overview admin-only", err(await rider.sb.rpc("fp_rest_overview")) !== null);
  await admin.sb.from("work_sessions").delete().eq("rider_id", rider.id).gte("clock_in", ago(60 * 48));
  await sess(ago(900), ago(722));
  ok("after 12 h rest clock-in allowed", !(await status())?.missing.some((m) => m.startsWith("atw_rest")));
  await admin.sb.from("work_sessions").delete().eq("rider_id", rider.id).gte("clock_in", ago(60 * 48));
  await sess(ago(300), ago(240));
  ok("split shift same day allowed", !(await status())?.missing.some((m) => m.startsWith("atw_rest")));
  await admin.sb.from("work_sessions").delete().eq("rider_id", rider.id).gte("clock_in", ago(60 * 48));

  // fixed-hours offer after 12 months
  const d13 = new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10);
  await admin.sb.from("rider_hr").update({ start_date: d13, offer_alerted_at: null, fixed_offer_at: null }).eq("profile_id", rider.id);
  await admin.sb.rpc("fp_atw_check_now");
  ok("12-month offer alert raised once", !!(await admin.sb.from("rider_hr").select("offer_alerted_at").eq("profile_id", rider.id).single()).data?.offer_alerted_at
    && ((await admin.sb.from("ops_alerts").select("id").eq("kind", "legal").like("message", "Fixed-hours offer due%").gte("created_at", ago(5))).data ?? []).length >= 1);
  ok("average weekly hours: admin yes, others no", typeof (await admin.sb.rpc("fp_avg_week_hours", { p_rider: rider.id })).data === "number" && err(await other.sb.rpc("fp_avg_week_hours", { p_rider: rider.id })) !== null);
  await admin.sb.from("ops_alerts").update({ resolved_at: new Date().toISOString() }).eq("kind", "legal").like("message", "Fixed-hours offer due%").is("resolved_at", null);
  ok("customer cannot read roster", ((await out.sb.from("rider_shifts").select("id")).data ?? []).length === 0);
} finally {
  await clean();
  if (wasOnline) await admin.sb.from("profiles").update({ online: true }).eq("id", rider.id);
}
process.exit(summary() ? 1 : 0);
