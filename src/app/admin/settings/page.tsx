"use client";
import { useEffect, useState } from "react";
import { ErrorNote, Field, inputCls, Panel, SmallBtn } from "@/components/admin";
import { act } from "@/lib/act";
import { sb, useAdminQuery, type Row } from "@/lib/admin";
import { actions } from "@/lib/store";
import { BusinessModelSettings } from "@/components/adminBusiness";

const AGES = ["16", "17", "18", "19", "20", "21"];
const NUMS: [string, string][] = [["holiday_pay_pct", "Holiday pay % (min 8)"], ["holiday_hours_pct", "Holiday hours accrued per hour worked, % (4 weeks/yr = 7.69)"],
  ["atw_max_shift_h", "Max shift, hours (ATW 12)"], ["atw_max_shift_youth_h", "Max shift under 18, hours (ATW 9)"], ["atw_break_after_h", "Break required after, hours (ATW 5.5)"],
  ["atw_week_max_h", "Max per week, hours (ATW 60)"], ["atw_week_max_youth_h", "Max per week under 18, hours (ATW 45)"],
  ["atw_break_after_youth_h", "Break required after, under 18 (ATW 4.5)"], ["rest_min_h", "Rest between shifts, hours (ATW 11, we use 12)"],
  ["surcharge_sat_pct", "Saturday surcharge %"], ["surcharge_sun_pct", "Sunday surcharge %"], ["surcharge_holiday_pct", "Public holiday surcharge %"],
  ["surcharge_night_pct", "Night surcharge %"], ["overtime_pct", "Overtime surcharge % (Mon–Fri)"], ["overtime_week_h", "Overtime above, h/week (on-call; min-max uses its max)"],
  ["cao_scale_cents", "CAO lowest scale 21+, cents/h (BGV A1)"], ["min_call_hours", "Minimum paid hours per call-in (7:628a, ≥ 3)"], ["call_notice_days", "Call-in notice, days (7:628a, ≥ 4)"]];
const TEXTS: [string, string][] = [["night_from", "Night from (HH:MM)"], ["night_to", "Night until (HH:MM)"], ["cao_avv_until", "CAO AVV valid until (YYYY-MM-DD)"],
  ["pension_fund", "Pension fund (placeholder)"], ["payroll_provider", "Payroll provider (name, placeholder until chosen)"]];
const OPT_NUMS: [string, string][] = [["pension_employee_pct", "Pension employee % (blank = provider sets)"], ["pension_employer_pct", "Pension employer % (blank = provider sets)"]];
/** Presets: CAO Beroepsgoederenvervoer (AVV until 1-1-2027, applies to meal delivery per HR 2023:1622) or statutory minimum only. */
const PRESETS: Record<string, { wml: Record<string, number>; nums: Record<string, number> }> = {
  bgv: { wml: { 16: 750, 17: 839, 18: 944, 19: 1079, 20: 1244, 21: 1499 }, nums: { holiday_hours_pct: 10.58, atw_break_after_h: 4.5, surcharge_sat_pct: 50, surcharge_sun_pct: 100, surcharge_holiday_pct: 100, surcharge_night_pct: 19, overtime_pct: 30, overtime_week_h: 40, cao_scale_cents: 1471 } },
  none: { wml: { 16: 517, 17: 592, 18: 750, 19: 899, 20: 1199, 21: 1499 }, nums: { holiday_hours_pct: 7.69, atw_break_after_h: 5.5, surcharge_sat_pct: 0, surcharge_sun_pct: 0, surcharge_holiday_pct: 0, surcharge_night_pct: 0, overtime_pct: 0, overtime_week_h: 40, cao_scale_cents: 0 } },
};

/** Age-based statutory minimum wage (WML) table + Working Hours Act limits used for the indicative pay summary and clock-in checks. */
function PaySettings({ data, reload }: { data: Row | null; reload: () => void }) {
  const [wml, setWml] = useState<Record<string, string>>({});
  const [nums, setNums] = useState<Record<string, string>>({});
  const [eff, setEff] = useState("");
  const [cao, setCao] = useState("bgv");
  const [texts, setTexts] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!data) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    const w = (data.wml_cents ?? {}) as Record<string, number>;
    setWml(Object.fromEntries(AGES.map((a) => [a, w[a] != null ? (w[a] / 100).toFixed(2) : ""])));
    setNums(Object.fromEntries(NUMS.map(([k]) => [k, String(data[k] ?? "")])));
    setEff(String(data.wml_effective ?? ""));
    setCao(String(data.cao ?? "bgv"));
    setTexts(Object.fromEntries([...TEXTS, ...OPT_NUMS].map(([k]) => [k, data[k] == null ? "" : String(data[k]).slice(0, k.startsWith("night") ? 5 : undefined)])));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [data]);
  async function save() {
    const p: Row = { wml_cents: Object.fromEntries(AGES.filter((a) => wml[a]).map((a) => [a, Math.round(Number(wml[a].replace(",", ".")) * 100)])), wml_effective: eff || null, updated_at: new Date().toISOString() };
    for (const [k] of NUMS) p[k] = Number(nums[k].replace(",", "."));
    p.cao = cao;
    for (const [k] of TEXTS) p[k] = texts[k] || null;
    for (const [k] of OPT_NUMS) p[k] = texts[k] ? Number(texts[k].replace(",", ".")) : null;
    const ok = await act((async () => { const { error } = await sb().from("settings").update(p).eq("id", true); if (error) throw new Error(/check/.test(error.message) ? "Out of the legal range (WML incl. a 21+ rate, holiday pay ≥ 8%, ATW maxima, rest ≥ 11 h, call-in ≥ 3 h, notice ≥ 4 days)" : error.message); return true; })(), "Pay & working-time settings saved");
    if (ok !== undefined) reload();
  }
  function preset(c: string) {
    setCao(c);
    const pr = PRESETS[c];
    setWml(Object.fromEntries(AGES.map((a) => [a, (pr.wml[a] / 100).toFixed(2)])));
    setNums({ ...nums, ...Object.fromEntries(Object.entries(pr.nums).map(([k, v]) => [k, String(v)])) });
  }
  return (
    <Panel title="Rider pay & working time (direct employment)">
      <div className="mb-2 max-w-xl"><Field label="CAO (choosing one fills its rates; review and save)"><select data-testid="cao-select" className={inputCls} value={cao} onChange={(e) => preset(e.target.value)}>
        <option value="bgv">CAO Beroepsgoederenvervoer (AVV, applies to meal delivery)</option><option value="none">No CAO: statutory WML + ATW only</option></select></Field></div>
      <p className="mb-2 text-xs text-muted">{cao === "bgv" ? "CAO BGV: youth wages as % of WML (16 50% … 20 83%), 21+ = max(WML, scale A1); Sat +50%, Sun/holiday +100%, night 21–05 +19%, overtime +30%; break 30 min after 4.5 h; 24 + 3.5 ATV leave days; Pensioenfonds Vervoer. Check the AVV renewal before " + (texts.cao_avv_until || "2027-01-01") + "." : "No CAO: statutory WML and Working Hours Act minimums only. Only valid if no CAO is generally binding."}</p>
      <p className="mb-2 text-xs text-muted">Minimum hourly wage by age (gross). Riders are paid at least this for every clocked-in hour; the per-delivery fee and tips come on top as a bonus. The weekly summary is indicative: payroll runs at the payroll provider.</p>
      <div className="grid max-w-xl grid-cols-3 gap-2 md:grid-cols-6" data-testid="wml-table">
        {AGES.map((a) => <Field key={a} label={a === "21" ? "21+ (€/h)" : `${a} (€/h)`}><input data-testid={`wml-${a}`} className={inputCls} inputMode="decimal" value={wml[a] ?? ""} onChange={(e) => setWml({ ...wml, [a]: e.target.value })} /></Field>)}
      </div>
      <div className="mt-2 grid max-w-xl gap-2 md:grid-cols-2">
        <Field label="WML effective from"><input type="date" className={inputCls} value={eff} onChange={(e) => setEff(e.target.value)} /></Field>
        {NUMS.map(([k, l]) => <Field key={k} label={l}><input data-testid={`set-${k}`} className={inputCls} inputMode="decimal" value={nums[k] ?? ""} onChange={(e) => setNums({ ...nums, [k]: e.target.value })} /></Field>)}
        {[...TEXTS, ...OPT_NUMS].map(([k, l]) => <Field key={k} label={l}><input data-testid={`set-${k}`} className={inputCls} value={texts[k] ?? ""} onChange={(e) => setTexts({ ...texts, [k]: e.target.value })} /></Field>)}
      </div>
      <div className="mt-3"><SmallBtn tone="brand" onClick={save}>Save pay settings</SmallBtn></div>
    </Panel>
  );
}

export default function SettingsAdmin() {
  const q = useAdminQuery<Row>(async () => sb().from("settings").select("*").maybeSingle(), []);
  const [windowS, setWindowS] = useState("180");
  const [acceptMin, setAcceptMin] = useState("5");
  const [maxActive, setMaxActive] = useState("2");
  const [auction, setAuction] = useState("60");
  const [noBidMin, setNoBidMin] = useState("10");
  const [expiryMin, setExpiryMin] = useState("30");
  useEffect(() => {
    if (!q.data) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setWindowS(String(q.data.bid_window_seconds));
    setAcceptMin(String(q.data.restaurant_accept_minutes));
    setAuction(String(q.data.auction_seconds));
    setMaxActive(String(q.data.max_active_orders ?? 2));
    setNoBidMin(String(q.data.no_bid_alert_minutes));
    setExpiryMin(String(q.data.unpaid_expiry_minutes));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [q.data]);
  async function save() {
    const p = { bid_window_seconds: Number(windowS), restaurant_accept_minutes: Number(acceptMin), auction_seconds: Number(auction), max_active_orders: Number(maxActive), no_bid_alert_minutes: Number(noBidMin), unpaid_expiry_minutes: Number(expiryMin), updated_at: new Date().toISOString() };
    const ok = await act((async () => { const { error } = await sb().from("settings").update(p).eq("id", true); if (error) throw new Error(error.message); return true; })(), "Settings saved");
    if (ok !== undefined) { q.reload(); actions.reloadCatalog(); }
  }
  return (<>
    <BusinessModelSettings data={q.data} reload={() => void q.reload()} />
    <Panel title="Platform settings">
      <ErrorNote error={q.error} />
      <div className="grid max-w-xl gap-3">
        <Field label="Bid window (seconds): riders are re-notified if nobody bid by then — the key metric uses 3 min"><input className={inputCls} type="number" min={30} max={900} step={30} value={windowS} onChange={(e) => setWindowS(e.target.value)} /></Field>
        <Field label="Max active orders per rider (stacked orders: 1 = no stacking, up to 3; a second order is only allowed when its pickup is within ~1 km and the drop-off goes the same way)"><select data-testid="max-active" className={inputCls} value={maxActive} onChange={(e) => setMaxActive(e.target.value)}>{["1", "2", "3"].map((n) => <option key={n}>{n}</option>)}</select></Field>
        <Field label="Bid auction window (seconds after the first bid; lowest ETA wins, ties → earliest bid)"><input className={inputCls} type="number" min={15} max={300} step={5} value={auction} onChange={(e) => setAuction(e.target.value)} /></Field>
        <h3 className="mt-2 text-sm font-bold">Timeouts (checked every minute)</h3>
        <Field label="Restaurant must accept within (min) — else auto-cancel + full refund"><input className={inputCls} type="number" min={1} max={30} value={acceptMin} onChange={(e) => setAcceptMin(e.target.value)} /></Field>
        <Field label="No rider bid after the bid window → riders re-notified; after (min) → alert admin"><input className={inputCls} type="number" min={1} max={60} value={noBidMin} onChange={(e) => setNoBidMin(e.target.value)} /></Field>
        <Field label="Unpaid orders expire after (min)"><input className={inputCls} type="number" min={10} max={240} value={expiryMin} onChange={(e) => setExpiryMin(e.target.value)} /></Field>
        <div><SmallBtn tone="brand" onClick={save}>Save settings</SmallBtn></div>
        <p className="text-xs text-muted">Fees, commission and the zone are under Business model. Addresses are geocoded with PDOK and orders outside the radius (from {Number(q.data?.zone_center_lat ?? 51.5576).toFixed(4)}, {Number(q.data?.zone_center_lng ?? 5.0913).toFixed(4)}, Heuvel) are refused at payment. Last updated {q.data?.updated_at ? new Date(String(q.data.updated_at)).toLocaleString("en-GB") : "—"}.</p>
      </div>
    </Panel>
    <PaySettings data={q.data} reload={() => void q.reload()} />
  </>);
}
