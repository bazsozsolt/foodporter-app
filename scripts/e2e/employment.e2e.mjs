// v19 direct employment: clock-in/out via online, availability, WML table in settings, weekly indicative pay,
// payroll export RPC, Working Hours Act gates + alerts. Test accounts only (SIMR3); cleans up its sessions.
import { client, login, ok, summary } from "./common.mjs";
const anon = client();
const admin = await login("ADMIN"), rider = await login("SIMR3"), other = await login("SIMR1"), out = await login("OUTSIDER");
const err = (r) => r?.error?.message ?? null;
const status = async () => (await rider.sb.rpc("my_legal_status")).data;
const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
const wasOnline = (await admin.sb.from("profiles").select("online").eq("id", rider.id).single()).data.online;
const wipe = async () => { await admin.sb.from("profiles").update({ online: false }).eq("id", rider.id); await admin.sb.from("work_sessions").delete().eq("rider_id", rider.id).gte("clock_in", ago(60 * 24 * 40)); };
const set0 = (await admin.sb.from("settings").select("wml_cents, holiday_pay_pct").single()).data;
try {
  await wipe();
  // settings / WML
  const s = (await anon.from("settings").select("wml_cents, holiday_pay_pct, atw_break_after_h").single()).data;
  ok("WML table readable", s?.wml_cents?.["21"] === 1499 && s.wml_cents["16"] === 517 && Number(s.holiday_pay_pct) === 8, JSON.stringify(s?.wml_cents));
  ok("non-admin cannot edit WML", ((await out.sb.from("settings").update({ wml_cents: { 21: 100 } }).eq("id", true).select("id")).data ?? []).length === 0);
  ok("WML without 21+ rate rejected", err(await admin.sb.from("settings").update({ wml_cents: { 16: 517 } }).eq("id", true)) !== null);
  ok("holiday pay below 8% rejected", err(await admin.sb.from("settings").update({ holiday_pay_pct: 5 }).eq("id", true)) !== null);
  ok("admin edits WML", !err(await admin.sb.from("settings").update({ wml_cents: { ...set0.wml_cents, 21: 1500 } }).eq("id", true)));
  await admin.sb.from("settings").update({ wml_cents: set0.wml_cents }).eq("id", true);

  // clock in / out
  ok("clock in (go online)", !err(await rider.sb.from("profiles").update({ online: true }).eq("id", rider.id)));
  let open = (await rider.sb.from("work_sessions").select("id, clock_out").eq("rider_id", rider.id).is("clock_out", null)).data ?? [];
  ok("session opened", open.length === 1);
  await rider.sb.from("profiles").update({ online: false }).eq("id", rider.id);
  const closed = (await rider.sb.from("work_sessions").select("clock_out, closed_by").eq("id", open[0]?.id).single()).data;
  ok("clock out closes session", closed?.clock_out && closed.closed_by === "rider", JSON.stringify(closed));
  ok("rider cannot write sessions", err(await rider.sb.from("work_sessions").insert({ rider_id: rider.id, clock_in: ago(60) })) !== null);
  ok("rider cannot edit own session", ((await rider.sb.from("work_sessions").update({ clock_in: ago(600) }).eq("id", open[0]?.id).select("id")).data ?? []).length === 0);
  ok("others cannot read sessions", ((await other.sb.from("work_sessions").select("id").eq("rider_id", rider.id)).data ?? []).length === 0 && ((await out.sb.from("work_sessions").select("id")).data ?? []).length === 0);

  // availability
  const st = new Date(Date.now() + 864e5); st.setMinutes(0, 0, 0); const en = new Date(st.getTime() + 4 * 3600e3);
  const av = await rider.sb.from("rider_availability").insert({ rider_id: rider.id, starts_at: st.toISOString(), ends_at: en.toISOString() }).select("id").single();
  ok("rider adds availability", !av.error, err(av));
  ok("past block rejected", err(await rider.sb.from("rider_availability").insert({ rider_id: rider.id, starts_at: ago(300), ends_at: ago(200) })) !== null);
  ok(">12h block rejected", err(await rider.sb.from("rider_availability").insert({ rider_id: rider.id, starts_at: st.toISOString(), ends_at: new Date(st.getTime() + 13 * 3600e3).toISOString() })) !== null);
  ok("cannot add for another rider", err(await other.sb.from("rider_availability").insert({ rider_id: rider.id, starts_at: st.toISOString(), ends_at: en.toISOString() })) !== null);
  ok("customer cannot add availability", err(await out.sb.from("rider_availability").insert({ rider_id: out.id, starts_at: st.toISOString(), ends_at: en.toISOString() })) !== null);
  ok("others cannot see availability", ((await other.sb.from("rider_availability").select("id").eq("rider_id", rider.id)).data ?? []).length === 0);
  ok("admin sees availability", ((await admin.sb.from("rider_availability").select("id").eq("id", av.data?.id)).data ?? []).length === 1);
  await rider.sb.from("rider_availability").delete().eq("id", av.data?.id);

  // weekly pay (2026-09-07 week, 2 h at age 17)
  const b17 = new Date(Date.UTC(2009, 0, 1)).toISOString().slice(0, 10);
  await admin.sb.from("rider_hr").upsert({ profile_id: rider.id, contract_type: "employment", birthdate: b17 });
  await admin.sb.from("work_sessions").insert({ rider_id: rider.id, clock_in: "2026-09-08T10:00:00Z", clock_out: "2026-09-08T12:00:00Z", closed_by: "admin", is_test: true });
  const w = (await rider.sb.rpc("fp_rider_week", { p_rider: rider.id, p_week: "2026-09-10" })).data;
  ok("week: hours × age-based WML", w?.week_start === "2026-09-07" && Number(w.hours) === 2 && w.wml_rate_cents === 592 && w.wage_cents === 1184, JSON.stringify(w && { h: w.hours, r: w.wml_rate_cents, wage: w.wage_cents }));
  ok("week: 8% holiday pay over wage + bonus", w?.holiday_pay_cents === Math.round((w.wage_cents + w.bonus_cents) * 0.08));
  ok("week: gross = wage + bonus + tips + holiday", w?.gross_cents === w.wage_cents + w.bonus_cents + w.tips_cents + w.holiday_pay_cents && w.indicative === true);
  ok("week: holiday hours accrued", Number(w?.holiday_hours) === Math.round(2 * 7.69) / 100);
  ok("others cannot read my week", /not allowed/.test(err(await other.sb.rpc("fp_rider_week", { p_rider: rider.id, p_week: "2026-09-10" })) ?? ""));
  ok("payroll export admin-only", err(await rider.sb.rpc("fp_payroll_week", { p_week: "2026-09-07" })) !== null);
  const pw = (await admin.sb.rpc("fp_payroll_week", { p_week: "2026-09-07" })).data ?? [];
  ok("payroll export lists the rider", pw.some((r) => r.rider_id === rider.id && r.wage_cents === 1184) && !JSON.stringify(pw).match(/bsn/i));
  await admin.sb.from("rider_hr").upsert({ profile_id: rider.id, contract_type: "employment", birthdate: null });
  ok("unknown age uses 21+ rate", (await admin.sb.rpc("fp_rider_week", { p_rider: rider.id, p_week: "2026-09-10" })).data?.wml_rate_cents === 1499);

  // ATW
  await wipe();
  const long = (await admin.sb.from("work_sessions").insert({ rider_id: rider.id, clock_in: ago(340), clock_out: ago(5), closed_by: "admin", is_test: true }).select("id").single()).data;
  ok("break required after 5.5 h", (await status())?.missing.includes("atw_break"));
  ok("clock-in blocked until break", /atw_break/.test(err(await rider.sb.from("profiles").update({ online: true }).eq("id", rider.id)) ?? ""));
  await admin.sb.from("work_sessions").update({ clock_out: ago(20) }).eq("id", long.id);
  ok("after a 15+ min break clock-in allowed", (await status())?.ready === true, JSON.stringify((await status())?.missing));
  await wipe();
  // live shift running 12.5 h → auto clock-out + violation + admin alert
  await admin.sb.from("profiles").update({ online: true }).eq("id", rider.id);
  const day0 = new Date(); day0.setHours(0, 5, 0, 0);
  const start = new Date(Math.max(day0.getTime(), Date.now() - 750 * 60000));
  await admin.sb.from("work_sessions").insert({ rider_id: rider.id, clock_in: ago(60 * 24 * 2), clock_out: ago(60 * 24 * 2 - 1), is_test: true }); // noise
  await admin.sb.from("work_sessions").update({ clock_in: start.toISOString() }).eq("rider_id", rider.id).is("clock_out", null);
  const workedMin = (Date.now() - start.getTime()) / 60000;
  ok("non-admin cannot run checks", err(await rider.sb.rpc("fp_atw_check_now")) !== null);
  await admin.sb.rpc("fp_atw_check_now");
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
  const viol = (await admin.sb.from("work_violations").select("kind").eq("rider_id", rider.id).eq("day", today)).data ?? [];
  ok("break violation recorded", viol.some((v) => v.kind === "break"));
  if (workedMin > 721) {
    ok("max-shift violation recorded", viol.some((v) => v.kind === "max_shift"));
    ok("auto clocked out at max shift", (await admin.sb.from("profiles").select("online").eq("id", rider.id).single()).data.online === false);
  } else console.log(`SKIP max-shift checks (only ${Math.round(workedMin)} min since midnight)`);
  ok("ATW alert raised for admin", ((await admin.sb.from("ops_alerts").select("id").eq("kind", "atw").gte("created_at", ago(60 * 24))).data ?? []).length > 0);
  ok("rider sees own violations only", ((await rider.sb.from("work_violations").select("rider_id")).data ?? []).every((v) => v.rider_id === rider.id) && ((await out.sb.from("work_violations").select("id")).data ?? []).length === 0);
  ok("rider cannot resolve violations", ((await rider.sb.from("work_violations").update({ resolved_at: new Date().toISOString() }).eq("rider_id", rider.id).select("id")).data ?? []).length === 0);
  await admin.sb.from("work_violations").update({ resolved_at: new Date().toISOString() }).eq("rider_id", rider.id).is("resolved_at", null);
  await admin.sb.from("ops_alerts").update({ resolved_at: new Date().toISOString() }).eq("kind", "atw").is("resolved_at", null).like("message", "%" + ((await admin.sb.from("profiles").select("full_name").eq("id", rider.id).single()).data.full_name ?? "rider") + "%");
} finally {
  await wipe();
  await admin.sb.from("settings").update({ wml_cents: set0.wml_cents, holiday_pay_pct: set0.holiday_pay_pct }).eq("id", true);
  await admin.sb.from("rider_hr").upsert({ profile_id: rider.id, contract_type: "employment", birthdate: null });
  if (wasOnline) await admin.sb.from("profiles").update({ online: true }).eq("id", rider.id);
}
process.exit(summary() ? 1 : 0);
