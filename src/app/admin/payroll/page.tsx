"use client";
import { useState } from "react";
import { ErrorNote, Kpi, Panel, SmallBtn, Table, Td } from "@/components/admin";
import { downloadCsv, fmtDateTime, sb, useAdminQuery, type Row } from "@/lib/admin";
import { act } from "@/lib/act";
import { eur } from "@/lib/format";

const monday = (d: Date) => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x.toISOString().slice(0, 10); };
const addDays = (iso: string, n: number) => { const x = new Date(iso + "T12:00:00"); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
const KIND: Record<string, string> = { rest: "Rest < 12 h", avg16w: "Avg > 48 h/wk (16 wk)", youth_avg4w: "Under 18: avg > 40 h/wk (4 wk)", sundays: "< 13 free Sundays / 52 wk", break: "No break (CAO 4.5 h / ATW 5.5 h)", max_shift: "Max shift exceeded", weekly_max: "Weekly max exceeded", youth_night: "Under 18 after 23:00" };

export default function AdminPayroll() {
  const [week, setWeek] = useState(() => monday(new Date()));
  const [showResolved, setShowResolved] = useState(false);
  const q = useAdminQuery<Row>(async () => {
    const c = sb();
    const [p, v, s, sh, rest] = await Promise.all([
      c.rpc("fp_payroll_week", { p_week: week }),
      (() => { let x = c.from("work_violations").select("*").order("created_at", { ascending: false }).limit(200); if (!showResolved) x = x.is("resolved_at", null); return x; })(),
      c.from("work_sessions").select("id, rider_id, clock_in, clock_out, closed_by").gte("clock_in", week + "T00:00:00").lt("clock_in", addDays(week, 7) + "T00:00:00").order("clock_in", { ascending: false }).limit(300),
      c.from("rider_shifts").select("*").gte("starts_at", week + "T00:00:00").lt("starts_at", addDays(week, 7) + "T00:00:00").order("starts_at").limit(300),
      c.rpc("fp_rest_overview"),
    ]);
    return { data: { rows: (p.data ?? []) as Row[], viol: v.data ?? [], sess: s.data ?? [], shifts: sh.data ?? [], rest: rest.data ?? [] }, error: p.error ?? v.error ?? s.error ?? sh.error ?? rest.error };
  }, [week, showResolved]);
  const d = (q.data ?? { rows: [], viol: [], sess: [], shifts: [], rest: [] }) as { rows: Row[]; viol: Row[]; sess: Row[]; shifts: Row[]; rest: Row[] };
  const [cr, setCr] = useState(""); const [cd, setCd] = useState(""); const [cf, setCf] = useState("17:00"); const [ct, setCt] = useState("21:00");
  async function addCall() {
    const a = new Date(`${cd}T${cf}`), b = new Date(`${cd}T${ct}`); if (b <= a) b.setDate(b.getDate() + 1);
    if (await act((async () => { if (!cr || !cd) throw new Error("Pick a rider and a date"); const { error } = await sb().from("rider_shifts").insert({ rider_id: cr, starts_at: a.toISOString(), ends_at: b.toISOString() }); if (error) throw new Error(error.message); return true; })(),
      (a.getTime() - Date.now()) < 4 * 864e5 ? "Call-in added (short notice: the rider may decline)" : "Call-in added")) void q.reload();
  }
  async function cancelCall(id: unknown) {
    if (await act((async () => { const { error } = await sb().from("rider_shifts").update({ status: "cancelled" }).eq("id", Number(id)); if (error) throw new Error(error.message); return true; })(), "Call-in cancelled")) void q.reload();
  }
  const [loadedAt] = useState(() => Date.now());
  const rows = d.rows.filter((r) => Number(r.minutes) > 0 || Number(r.deliveries) > 0);
  const name = new Map(d.rows.map((r) => [String(r.rider_id), String(r.name || r.email)]));
  const sum = (k: string) => rows.reduce((a, r) => a + Number(r[k] ?? 0), 0);
  async function resolve(id: unknown) {
    if (await act((async () => { const { error } = await sb().from("work_violations").update({ resolved_at: new Date().toISOString() }).eq("id", Number(id)); if (error) throw new Error(error.message); return true; })(), "Marked reviewed")) void q.reload();
  }
  const e2 = (c: unknown) => (Number(c ?? 0) / 100).toFixed(2);
  // provider-neutral export: see legal/payroll-export-spec.md (no BSN, no tax data)
  const COLS = ["week_start", "rider_id", "name", "email", "contract_kind", "min_hours_week", "max_hours_week", "cao", "age", "hours", "shifts", "call_ins",
    "guarantee_callin_hours", "guarantee_cancel_hours", "guarantee_minmax_hours", "paid_hours", "wml_rate_eur", "wage_eur", "guarantee_eur",
    "sat_hours", "sun_hours", "holiday_hours_worked", "night_hours", "overtime_hours", "surcharge_sat_eur", "surcharge_sun_eur", "surcharge_holiday_eur", "surcharge_night_eur", "surcharge_overtime_eur",
    "delivery_bonus_eur", "tips_eur", "holiday_pay_pct", "holiday_pay_eur", "holiday_hours", "pension_fund", "gross_indicative_eur", "deliveries", "atw_violations", "test_account"];
  const csv = () => downloadCsv(`payroll-${week}.csv`, rows.map((r) => ({
    week_start: r.week_start, rider_id: r.rider_id, name: r.name, email: r.email, contract_kind: r.contract_kind, min_hours_week: r.min_hours_week ?? "", max_hours_week: r.max_hours_week ?? "", cao: r.cao,
    age: r.age ?? "", hours: r.hours, shifts: r.shifts, call_ins: r.call_ins, guarantee_callin_hours: r.guarantee_callin_hours, guarantee_cancel_hours: r.guarantee_cancel_hours, guarantee_minmax_hours: r.guarantee_minmax_hours, paid_hours: r.paid_hours,
    wml_rate_eur: e2(r.wml_rate_cents), wage_eur: e2(r.wage_cents), guarantee_eur: e2(r.guarantee_cents),
    sat_hours: r.sat_hours, sun_hours: r.sun_hours, holiday_hours_worked: r.holiday_hours_worked, night_hours: r.night_hours, overtime_hours: r.overtime_hours,
    surcharge_sat_eur: e2(r.surcharge_sat_cents), surcharge_sun_eur: e2(r.surcharge_sun_cents), surcharge_holiday_eur: e2(r.surcharge_holiday_cents), surcharge_night_eur: e2(r.surcharge_night_cents), surcharge_overtime_eur: e2(r.surcharge_overtime_cents),
    delivery_bonus_eur: e2(r.bonus_cents), tips_eur: e2(r.tips_cents), holiday_pay_pct: r.holiday_pay_pct, holiday_pay_eur: e2(r.holiday_pay_cents), holiday_hours: r.holiday_hours, pension_fund: r.pension_fund ?? "",
    gross_indicative_eur: e2(r.gross_cents), deliveries: r.deliveries, atw_violations: r.violations, test_account: r.is_test ? "yes" : "no",
  })), COLS);
  return (<>
    <ErrorNote error={q.error} />
    <Panel title={`Hours & payroll · week of ${week}`} actions={<>
      <SmallBtn onClick={() => setWeek(addDays(week, -7))}>← Prev</SmallBtn><SmallBtn onClick={() => setWeek(monday(new Date()))}>This week</SmallBtn><SmallBtn onClick={() => setWeek(addDays(week, 7))}>Next →</SmallBtn>
      <SmallBtn tone="brand" onClick={csv}>⬇ Payroll CSV</SmallBtn></>}>
      <p className="mb-3 text-xs text-muted">Indicative: hours × age-based CAO/WML rate (Settings) + guarantees (3 h per call-in, short-notice cancellations, min-max minimum) + surcharges + per-delivery bonus + tips + holiday pay. The payroll provider computes the real payslip (taxes, loonheffingskorting, pension). No BSN is stored in the app.</p>
      <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-5"><Kpi label="Riders paid" value={rows.length} /><Kpi label="Hours" value={sum("hours").toFixed(1)} /><Kpi label="Wages" value={eur(sum("wage_cents"))} /><Kpi label="Bonus + tips" value={eur(sum("bonus_cents") + sum("tips_cents"))} /><Kpi label="Gross (indicative)" value={eur(sum("gross_cents"))} /></div>
      <Table head={["Rider", "Contract", "Age", "Hours", "Paid h", "Rate/h", "Wage", "Guarantee", "Surcharges", "Bonus", "Tips", "Holiday pay", "Holiday h", "Gross", "ATW"]} empty={!q.loading && rows.length === 0}>
        {rows.map((r) => (<tr key={String(r.rider_id)} data-testid="payroll-row">
          <Td><b>{String(r.name || r.email)}</b>{r.is_test ? <span className="ml-1 text-xs text-muted">test</span> : null}</Td>
          <Td>{r.contract_kind === "min_max" ? `min-max ${r.min_hours_week}–${r.max_hours_week}` : "on-call"}</Td>
          <Td>{r.age_known ? String(r.age) : <span className="text-amber-700" title="No birthdate: 21+ rate used">?</span>}</Td>
          <Td>{String(r.hours)}</Td><Td>{String(r.paid_hours)}</Td><Td>{eur(Number(r.wml_rate_cents))}</Td><Td>{eur(Number(r.wage_cents))}</Td><Td>{eur(Number(r.guarantee_cents))}</Td><Td>{eur(Number(r.surcharge_cents))}</Td><Td>{eur(Number(r.bonus_cents))}</Td><Td>{eur(Number(r.tips_cents))}</Td>
          <Td>{eur(Number(r.holiday_pay_cents))}</Td><Td>{String(r.holiday_hours)}</Td><Td><b>{eur(Number(r.gross_cents))}</b></Td>
          <Td>{Number(r.violations) > 0 ? <span className="font-bold text-red-600">{String(r.violations)}</span> : "0"}</Td></tr>))}
      </Table>
    </Panel>
    <Panel title={`Working Hours Act alerts (${d.viol.length}${showResolved ? "" : " open"})`} actions={<><SmallBtn onClick={async () => { if (await act((async () => { const { data, error } = await sb().rpc("fp_atw_check_now"); if (error) throw new Error(error.message); return data; })(), "Checks run")) void q.reload(); }}>Run checks now</SmallBtn>
      <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} /> show reviewed</label></>}>
      <p className="mb-2 text-xs text-muted">Checked every 5 min. Clock-in is blocked after the max shift / weekly max, until a 15+ min break (after 4.5 h under the CAO), until 12 h rest since the last shift, and for under-18s between 23:00 and 06:00. At the max shift a rider is clocked out automatically unless on a delivery.</p>
      <Table head={["Day", "Rider", "Rule", "Detail", ""]} empty={d.viol.length === 0}>
        {d.viol.map((v) => (<tr key={String(v.id)} data-testid="atw-row"><Td>{String(v.day)}</Td><Td>{name.get(String(v.rider_id)) ?? String(v.rider_id).slice(0, 8)}</Td><Td>{KIND[String(v.kind)] ?? String(v.kind)}</Td><Td>{String(v.detail ?? "")}</Td>
          <Td>{v.resolved_at ? <span className="text-xs text-muted">reviewed {fmtDateTime(v.resolved_at)}</span> : <SmallBtn tone="ok" onClick={() => resolve(v.id)}>Reviewed</SmallBtn>}</Td></tr>))}
      </Table>
    </Panel>
    <Panel title={`Call-in roster (${d.shifts.length})`}>
      <p className="mb-2 text-xs text-muted">Announce call-ins at least 4 days ahead (7:628a BW). Later call-ins are flagged and the rider may decline. Each call-in pays at least 3 h; cancelling within 4 days pays the scheduled hours.</p>
      <div className="mb-2 flex flex-wrap items-end gap-2">
        <select data-testid="call-rider" aria-label="Rider" className="rounded border border-line px-2 py-1 text-sm" value={cr} onChange={(e) => setCr(e.target.value)}><option value="">Rider…</option>{d.rows.map((r) => <option key={String(r.rider_id)} value={String(r.rider_id)}>{String(r.name || r.email)}</option>)}</select>
        <input data-testid="call-date" aria-label="Call-in date" type="date" className="rounded border border-line px-2 py-1 text-sm" value={cd} onChange={(e) => setCd(e.target.value)} />
        <input data-testid="call-from" aria-label="Call-in start" type="time" className="rounded border border-line px-2 py-1 text-sm" value={cf} onChange={(e) => setCf(e.target.value)} />
        <input data-testid="call-to" aria-label="Call-in end" type="time" className="rounded border border-line px-2 py-1 text-sm" value={ct} onChange={(e) => setCt(e.target.value)} />
        <SmallBtn tone="brand" onClick={addCall}>Add call-in</SmallBtn></div>
      <Table head={["Rider", "Start", "End", "Notice", "Status", ""]} empty={d.shifts.length === 0}>
        {d.shifts.map((c) => { const short = new Date(String(c.created_at)).getTime() > new Date(String(c.starts_at)).getTime() - 4 * 864e5;
          return (<tr key={String(c.id)} data-testid="call-row"><Td>{name.get(String(c.rider_id)) ?? "rider"}</Td><Td>{fmtDateTime(c.starts_at)}</Td><Td>{fmtDateTime(c.ends_at)}</Td>
            <Td>{short ? <span className="font-semibold text-amber-700">short notice</span> : "≥ 4 days"}</Td><Td>{String(c.status)}</Td>
            <Td>{c.status === "scheduled" && new Date(String(c.starts_at)).getTime() > loadedAt ? <SmallBtn onClick={() => cancelCall(c.id)}>Cancel</SmallBtn> : null}</Td></tr>); })}
      </Table>
    </Panel>
    <Panel title={`Resting riders (${d.rest.length})`}>
      <p className="mb-2 text-xs text-muted">Riders who cannot clock in yet: 12 h rest since their last shift (stricter than the ATW 11 h).</p>
      <Table head={["Rider", "Can clock in from"]} empty={d.rest.length === 0}>
        {d.rest.map((r) => <tr key={String(r.rider_id)} data-testid="rest-row"><Td>{String(r.name ?? "rider")}</Td><Td>{fmtDateTime(r.rest_until)}</Td></tr>)}
      </Table>
    </Panel>
    <Panel title={`Clock-ins this week (${d.sess.length})`}>
      <Table head={["Rider", "Clock in", "Clock out", "Minutes", "Closed by"]} empty={d.sess.length === 0}>
        {d.sess.map((s) => (<tr key={String(s.id)} data-testid="session-row"><Td>{name.get(String(s.rider_id)) ?? "rider"}</Td><Td>{fmtDateTime(s.clock_in)}</Td><Td>{s.clock_out ? fmtDateTime(s.clock_out) : <span className="text-emerald-700">on shift</span>}</Td>
          <Td>{Math.round(((s.clock_out ? new Date(String(s.clock_out)).getTime() : loadedAt) - new Date(String(s.clock_in)).getTime()) / 60000)}</Td><Td>{String(s.closed_by ?? "")}</Td></tr>))}
      </Table>
    </Panel>
  </>);
}
