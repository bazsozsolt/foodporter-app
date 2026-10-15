"use client";
import { useState } from "react";
import { ErrorNote, Kpi, Panel, SmallBtn, Table, Td } from "@/components/admin";
import { downloadCsv, fmtDateTime, sb, useAdminQuery, type Row } from "@/lib/admin";
import { act } from "@/lib/act";
import { eur } from "@/lib/format";

const monday = (d: Date) => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x.toISOString().slice(0, 10); };
const addDays = (iso: string, n: number) => { const x = new Date(iso + "T12:00:00"); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
const KIND: Record<string, string> = { break: "No break after 5.5 h", max_shift: "Max shift exceeded", weekly_max: "Weekly max exceeded", youth_night: "Under 18 after 23:00" };

export default function AdminPayroll() {
  const [week, setWeek] = useState(() => monday(new Date()));
  const [showResolved, setShowResolved] = useState(false);
  const q = useAdminQuery<Row>(async () => {
    const c = sb();
    const [p, v, s] = await Promise.all([
      c.rpc("fp_payroll_week", { p_week: week }),
      (() => { let x = c.from("work_violations").select("*").order("created_at", { ascending: false }).limit(200); if (!showResolved) x = x.is("resolved_at", null); return x; })(),
      c.from("work_sessions").select("id, rider_id, clock_in, clock_out, closed_by").gte("clock_in", week + "T00:00:00").lt("clock_in", addDays(week, 7) + "T00:00:00").order("clock_in", { ascending: false }).limit(300),
    ]);
    return { data: { rows: (p.data ?? []) as Row[], viol: v.data ?? [], sess: s.data ?? [] }, error: p.error ?? v.error ?? s.error };
  }, [week, showResolved]);
  const d = (q.data ?? { rows: [], viol: [], sess: [] }) as { rows: Row[]; viol: Row[]; sess: Row[] };
  const [loadedAt] = useState(() => Date.now());
  const rows = d.rows.filter((r) => Number(r.minutes) > 0 || Number(r.deliveries) > 0);
  const name = new Map(d.rows.map((r) => [String(r.rider_id), String(r.name || r.email)]));
  const sum = (k: string) => rows.reduce((a, r) => a + Number(r[k] ?? 0), 0);
  async function resolve(id: unknown) {
    if (await act((async () => { const { error } = await sb().from("work_violations").update({ resolved_at: new Date().toISOString() }).eq("id", Number(id)); if (error) throw new Error(error.message); return true; })(), "Marked reviewed")) void q.reload();
  }
  const csv = () => downloadCsv(`payroll-${week}.csv`, rows.map((r) => ({
    week_start: r.week_start, rider_id: r.rider_id, name: r.name, email: r.email, age: r.age ?? "", hours: r.hours, shifts: r.shifts,
    wml_rate_eur: (Number(r.wml_rate_cents) / 100).toFixed(2), wage_eur: (Number(r.wage_cents) / 100).toFixed(2), delivery_bonus_eur: (Number(r.bonus_cents) / 100).toFixed(2),
    tips_eur: (Number(r.tips_cents) / 100).toFixed(2), holiday_pay_pct: r.holiday_pay_pct, holiday_pay_eur: (Number(r.holiday_pay_cents) / 100).toFixed(2), holiday_hours: r.holiday_hours,
    gross_indicative_eur: (Number(r.gross_cents) / 100).toFixed(2), deliveries: r.deliveries, atw_violations: r.violations, test_account: r.is_test ? "yes" : "no",
  })), ["week_start", "rider_id", "name", "email", "age", "hours", "shifts", "wml_rate_eur", "wage_eur", "delivery_bonus_eur", "tips_eur", "holiday_pay_pct", "holiday_pay_eur", "holiday_hours", "gross_indicative_eur", "deliveries", "atw_violations", "test_account"]);
  return (<>
    <ErrorNote error={q.error} />
    <Panel title={`Hours & payroll · week of ${week}`} actions={<>
      <SmallBtn onClick={() => setWeek(addDays(week, -7))}>← Prev</SmallBtn><SmallBtn onClick={() => setWeek(monday(new Date()))}>This week</SmallBtn><SmallBtn onClick={() => setWeek(addDays(week, 7))}>Next →</SmallBtn>
      <SmallBtn tone="brand" onClick={csv}>⬇ Payroll CSV</SmallBtn></>}>
      <p className="mb-3 text-xs text-muted">Indicative: hours × age-based WML (Settings) + per-delivery bonus + tips + holiday pay. The payroll provider computes the real payslip (taxes, loonheffingskorting, pension). No BSN is stored in the app.</p>
      <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-5"><Kpi label="Riders paid" value={rows.length} /><Kpi label="Hours" value={sum("hours").toFixed(1)} /><Kpi label="Wages" value={eur(sum("wage_cents"))} /><Kpi label="Bonus + tips" value={eur(sum("bonus_cents") + sum("tips_cents"))} /><Kpi label="Gross (indicative)" value={eur(sum("gross_cents"))} /></div>
      <Table head={["Rider", "Age", "Hours", "WML/h", "Wage", "Bonus", "Tips", "Holiday pay", "Holiday h", "Gross", "ATW"]} empty={!q.loading && rows.length === 0}>
        {rows.map((r) => (<tr key={String(r.rider_id)} data-testid="payroll-row">
          <Td><b>{String(r.name || r.email)}</b>{r.is_test ? <span className="ml-1 text-xs text-muted">test</span> : null}</Td>
          <Td>{r.age_known ? String(r.age) : <span className="text-amber-700" title="No birthdate: 21+ rate used">?</span>}</Td>
          <Td>{String(r.hours)}</Td><Td>{eur(Number(r.wml_rate_cents))}</Td><Td>{eur(Number(r.wage_cents))}</Td><Td>{eur(Number(r.bonus_cents))}</Td><Td>{eur(Number(r.tips_cents))}</Td>
          <Td>{eur(Number(r.holiday_pay_cents))}</Td><Td>{String(r.holiday_hours)}</Td><Td><b>{eur(Number(r.gross_cents))}</b></Td>
          <Td>{Number(r.violations) > 0 ? <span className="font-bold text-red-600">{String(r.violations)}</span> : "0"}</Td></tr>))}
      </Table>
    </Panel>
    <Panel title={`Working Hours Act alerts (${d.viol.length}${showResolved ? "" : " open"})`} actions={<><SmallBtn onClick={async () => { if (await act((async () => { const { data, error } = await sb().rpc("fp_atw_check_now"); if (error) throw new Error(error.message); return data; })(), "Checks run")) void q.reload(); }}>Run checks now</SmallBtn>
      <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} /> show reviewed</label></>}>
      <p className="mb-2 text-xs text-muted">Checked every 5 min. Clock-in is blocked after the max shift / weekly max, until a 15+ min break after 5.5 h, and for under-18s between 23:00 and 06:00. At the max shift a rider is clocked out automatically unless on a delivery.</p>
      <Table head={["Day", "Rider", "Rule", "Detail", ""]} empty={d.viol.length === 0}>
        {d.viol.map((v) => (<tr key={String(v.id)} data-testid="atw-row"><Td>{String(v.day)}</Td><Td>{name.get(String(v.rider_id)) ?? String(v.rider_id).slice(0, 8)}</Td><Td>{KIND[String(v.kind)] ?? String(v.kind)}</Td><Td>{String(v.detail ?? "")}</Td>
          <Td>{v.resolved_at ? <span className="text-xs text-muted">reviewed {fmtDateTime(v.resolved_at)}</span> : <SmallBtn tone="ok" onClick={() => resolve(v.id)}>Reviewed</SmallBtn>}</Td></tr>))}
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
