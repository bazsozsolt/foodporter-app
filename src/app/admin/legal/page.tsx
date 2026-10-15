"use client";
import { useEffect, useState } from "react";
import { ErrorNote, Field, inputCls, Panel, SmallBtn, Table, Td } from "@/components/admin";
import { fmtDateTime, sb, useAdminQuery, type Row } from "@/lib/admin";
import { act } from "@/lib/act";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const STEPS: [string, string, boolean][] = [
  ["id_checked", "ID checked", true], ["right_to_work", "Right to work", true], ["age_checked", "Age 16+ checked", true],
  ["iban", "IBAN checked (name matches ID)", true], ["loonheffing_form", "Payroll tax form (loonheffingskorting)", true],
  ["bsn_entered", "BSN entered at payroll (flag only, never type the number here)", true], ["safety_briefing", "Safety briefing", true],
  ["licence", "Licence (scooter)", false], ["test_ride", "Test ride", false],
];
const DOCS: [string, string][] = [["id", "ID document"], ["right_to_work", "Right to work"], ["licence", "Driving licence"], ["insurance", "Insurance"]];
const RIDER_TPL = ["rider_employment", "rider_conduct", "platform_transparency", "deactivation_appeal"];
const REST_TPL = ["restaurant_partner", "dpa_restaurant"];
const daysTo = (d: unknown) => d ? Math.ceil((new Date(String(d)).getTime() - Date.now()) / 864e5) : null;

async function run(p: PromiseLike<{ error: { message: string } | null }>, msg: string) {
  return act((async () => { const { error } = await p; if (error) throw new Error(error.message); return true; })(), msg);
}

function StatusChip({ s }: { s: string }) {
  const tone = s === "signed" ? "bg-emerald-100 text-emerald-800" : s === "sent" ? "bg-amber-100 text-amber-800" : s === "expired" ? "bg-red-100 text-red-800" : "bg-subtle text-muted";
  return <span data-testid="contract-status" data-status={s} className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}>{s}</span>;
}

function contractState(tpl: string, partyAcc: Row[], partyReq: Row[], current: Map<string, string>) {
  const req = partyReq.filter((r) => r.template_id === tpl).sort((a, b) => String(b.sent_at).localeCompare(String(a.sent_at)))[0];
  if (req && (req.status === "sent" || req.status === "expired")) return String(req.status);
  return partyAcc.some((a) => a.template_id === tpl && a.version === current.get(tpl)) ? "signed" : "—";
}

function Library({ tpls }: { tpls: Row[] }) {
  const [view, setView] = useState<string | null>(null);
  const [html, setHtml] = useState("");
  useEffect(() => { if (view) void fetch(`${BASE}/${view}`).then((r) => r.text()).then(setHtml); }, [view]);
  return (
    <Panel title={`Template library (${tpls.length})`}>
      <p className="mb-2 text-xs text-muted">Drafts only: “Concept – laat beoordelen door een Nederlandse jurist voor gebruik”. Not legal advice. Source: legal/templates/*.md → legal/render.py.</p>
      <Table head={["Template", "Audience", "Version", "Effective", "Signature", "Status", "SHA-256", ""]}>
        {tpls.map((t) => (
          <tr key={`${t.id}-${t.version}`} data-testid="tpl-row" data-template={String(t.id)}>
            <Td><b>{String(t.title)}</b><div className="text-xs text-muted">{String(t.id)}</div></Td>
            <Td>{String(t.audience)}</Td><Td>{String(t.version)}</Td><Td>{String(t.effective_date)}</Td>
            <Td>{t.requires_acceptance ? "required" : "info"}</Td>
            <Td>{t.status === "archived" ? <span data-testid="tpl-archived" className="rounded-full bg-subtle px-2 py-0.5 text-xs font-semibold text-muted">not used</span> : "active"}</Td>
            <Td><code className="text-xs">{String(t.sha256).slice(0, 10)}…</code></Td>
            <Td><div className="flex gap-1"><SmallBtn onClick={() => setView(view === t.html_path ? null : String(t.html_path))}>{view === t.html_path ? "Hide" : "View"}</SmallBtn>
              <a className="rounded-lg bg-subtle px-2 py-1 text-xs font-semibold" href={`${BASE}/${String(t.pdf_path)}`} target="_blank" rel="noreferrer">PDF</a></div></Td>
          </tr>
        ))}
      </Table>
      {view && <div data-testid="tpl-view" className="legal-doc mt-3 max-h-[480px] overflow-y-auto rounded-lg border border-line p-4 text-sm" dangerouslySetInnerHTML={{ __html: html }} />}
    </Panel>
  );
}

/** Contract kind (7:628a BW): 0-hours on-call or min-max, start date (12-month fixed-hours offer) and reference days/hours (information duty). */
function ContractTerms({ id, hr, reload }: { id: string; hr: Row | null; reload: () => void }) {
  const [kind, setKind] = useState(String(hr?.contract_kind ?? "on_call"));
  const [min, setMin] = useState(hr?.min_hours_week == null ? "6" : String(hr.min_hours_week));
  const [max, setMax] = useState(hr?.max_hours_week == null ? "12" : String(hr.max_hours_week));
  const [start, setStart] = useState(String(hr?.start_date ?? ""));
  const [refd, setRefd] = useState(String(hr?.reference_days ?? ""));
  const [avg, setAvg] = useState<number | null>(null);
  const [today] = useState(() => Date.now());
  useEffect(() => { void sb().rpc("fp_avg_week_hours", { p_rider: id }).then(({ data }) => setAvg(data == null ? null : Number(data))); }, [id]);
  const due = start && !hr?.fixed_offer_at && new Date(start).getTime() <= today - 365 * 864e5;
  async function save() {
    const p: Row = { profile_id: id, contract_type: "employment", contract_kind: kind, start_date: start || null, reference_days: refd || null,
      min_hours_week: kind === "min_max" ? Number(min) : null, max_hours_week: kind === "min_max" ? Number(max) : null };
    if (await run(sb().from("rider_hr").upsert(p), "Contract terms saved")) reload();
  }
  return (
    <div data-testid="contract-terms" className="mt-2 grid gap-2">
      <Field label="Contract kind"><select data-testid="contract-kind" className={inputCls} value={kind} onChange={(e) => setKind(e.target.value)}><option value="on_call">0-hours on-call (min 3 h per call-in)</option><option value="min_max">Min-max (minimum paid weekly)</option></select></Field>
      {kind === "min_max" && <div className="grid grid-cols-2 gap-2"><Field label="Min h/week"><input data-testid="min-hours" className={inputCls} inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} /></Field><Field label="Max h/week (≤ 40)"><input data-testid="max-hours" className={inputCls} inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} /></Field></div>}
      <Field label="Start date"><input data-testid="start-date" type="date" className={inputCls} value={start} onChange={(e) => setStart(e.target.value)} /></Field>
      <Field label="Reference days/hours (when call-ins can happen)"><input data-testid="reference-days" className={inputCls} placeholder="e.g. Mon–Sun 11:00–23:00" value={refd} onChange={(e) => setRefd(e.target.value)} /></Field>
      <div className="flex flex-wrap items-center gap-2"><SmallBtn tone="brand" onClick={save}>Save contract terms</SmallBtn>
        <span className="text-xs text-muted">Avg {avg ?? "–"} h/week (52 wk)</span>
        {due && <span data-testid="offer-due" className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">Fixed-hours offer due ({avg ?? "?"} h/wk)</span>}
        {hr?.fixed_offer_at ? <span className="text-xs text-muted">Offer made {String(hr.fixed_offer_at)}</span> : start ? <SmallBtn onClick={async () => { if (await run(sb().from("rider_hr").update({ fixed_offer_at: new Date().toISOString().slice(0, 10) }).eq("profile_id", id), "Offer recorded")) reload(); }}>Offer made</SmallBtn> : null}</div>
    </div>
  );
}

function RiderDetail({ rider, current, onChange }: { rider: Row; current: Map<string, string>; onChange: () => void }) {
  const id = String(rider.id);
  const q = useAdminQuery<Row>(async () => {
    const c = sb();
    const [hr, steps, docs, st] = await Promise.all([
      c.from("rider_hr").select("*").eq("profile_id", id).maybeSingle(),
      c.from("rider_onboarding").select("step, done_at, note").eq("profile_id", id),
      c.from("rider_documents").select("kind, expires_on, verified_at").eq("profile_id", id),
      c.rpc("fp_rider_legal_status", { p_rider: id }),
    ]);
    return { data: { hr: hr.data, steps: steps.data ?? [], docs: docs.data ?? [], st: st.data }, error: hr.error ?? steps.error ?? docs.error ?? st.error };
  }, [id]);
  const d = q.data as { hr: Row | null; steps: Row[]; docs: Row[]; st: { ready: boolean; missing: string[] } } | null;
  const reload = () => { void q.reload(); onChange(); };
  if (!d) return <ErrorNote error={q.error} />;
  const ctype = String(d.hr?.contract_type ?? "employment");
  return (
    <div data-testid="rider-detail" className="mt-3 rounded-xl border border-line p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2"><b>{String(rider.full_name || rider.email)}</b>
        <span data-testid="rider-ready" data-ready={String(d.st?.ready)} className={`rounded-full px-2 py-0.5 text-xs font-semibold ${d.st?.ready ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>{d.st?.ready ? "may go online" : "blocked"}</span>
        {!d.st?.ready && <span className="text-xs text-muted">{d.st?.missing.join(", ")}</span>}</div>
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <Field label="Contract type"><span data-testid="contract-type" className="text-sm font-semibold">Direct employment (only option since v19)</span></Field>
          <div className="mt-2"><Field label="Date of birth (youth rules)"><input type="date" className={inputCls} defaultValue={String(d.hr?.birthdate ?? "")} onBlur={async (e) => { if (e.target.value !== String(d.hr?.birthdate ?? "") && await run(sb().from("rider_hr").upsert({ profile_id: id, contract_type: ctype, birthdate: e.target.value || null }), "Birthdate saved")) reload(); }} /></Field></div>
          <ContractTerms key={String(d.hr?.contract_kind) + String(d.hr?.start_date) + String(d.hr?.fixed_offer_at)} id={id} hr={d.hr} reload={reload} />
        </div>
        <div data-testid="checklist"><p className="mb-1 text-xs text-muted">Onboarding checklist</p>
          {STEPS.map(([k, l, req]) => { const done = d.steps.find((s) => s.step === k);
            return <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" data-testid={`step-${k}`} checked={Boolean(done)} onChange={async (e) => {
              const ok = e.target.checked ? await run(sb().from("rider_onboarding").insert({ profile_id: id, step: k }), `${l}: done`) : await run(sb().from("rider_onboarding").delete().eq("profile_id", id).eq("step", k), `${l}: undone`);
              if (ok) reload(); }} />{l}{req && <span className="text-red-600">*</span>}{done && <span className="text-xs text-muted">{fmtDateTime(done.done_at)}</span>}</label>; })}
        </div>
        <div><p className="mb-1 text-xs text-muted">Documents (expiry only, no copies stored)</p>
          {DOCS.map(([k, l]) => { const doc = d.docs.find((x) => x.kind === k); const n = daysTo(doc?.expires_on);
            return <div key={k} className="mb-1 flex items-center gap-2 text-sm"><span className="w-28">{l}</span>
              <input type="date" data-testid={`doc-${k}`} className="rounded border border-line px-1 py-0.5 text-xs" defaultValue={String(doc?.expires_on ?? "")} onBlur={async (e) => {
                if (e.target.value === String(doc?.expires_on ?? "")) return;
                if (await run(sb().from("rider_documents").upsert({ profile_id: id, kind: k, expires_on: e.target.value || null, verified_at: new Date().toISOString() }), `${l} saved`)) reload(); }} />
              {n != null && <span className={`text-xs ${n < 0 ? "font-bold text-red-600" : n <= 30 ? "text-amber-700" : "text-muted"}`}>{n < 0 ? "expired" : `${n} d`}</span>}</div>; })}
        </div>
      </div>
      <p className="mt-2 text-xs text-muted">Current versions: {[...current].filter(([k]) => RIDER_TPL.includes(k)).map(([k, v]) => `${k} v${v}`).join(" · ")}</p>
    </div>
  );
}

export default function AdminLegal() {
  const [sel, setSel] = useState<string | null>(null);
  const [send, setSend] = useState<{ party: string; kind: "rider" | "restaurant"; tpl: string } | null>(null);
  const q = useAdminQuery<Row>(async () => {
    const c = sb();
    const [t, riders, staff, acc, req, docs] = await Promise.all([
      c.from("legal_templates").select("*").order("id").order("effective_date", { ascending: false }).order("version_key", { ascending: false }),
      c.from("profiles").select("id, full_name, email, online, status, is_test").eq("role", "rider").order("full_name"),
      c.from("profiles").select("restaurant_id").eq("role", "restaurant").not("restaurant_id", "is", null),
      c.from("legal_acceptances").select("*").order("accepted_at", { ascending: false }).limit(1000),
      c.from("legal_requests").select("*").order("sent_at", { ascending: false }).limit(1000),
      c.from("rider_documents").select("profile_id, kind, expires_on").not("expires_on", "is", null).order("expires_on"),
    ]);
    const rids = [...new Set((staff.data ?? []).map((s) => s.restaurant_id as string))];
    const rests = rids.length ? await c.from("restaurants").select("id, name, is_test").in("id", rids) : { data: [] as Row[], error: null };
    return { data: { tpls: t.data ?? [], riders: riders.data ?? [], rests: rests.data ?? [], acc: acc.data ?? [], req: req.data ?? [], docs: docs.data ?? [] },
      error: t.error ?? riders.error ?? acc.error ?? req.error ?? docs.error ?? rests.error };
  }, []);
  const d = (q.data ?? { tpls: [], riders: [], rests: [], acc: [], req: [], docs: [] }) as Record<string, Row[]>;
  const today = new Date().toISOString().slice(0, 10);
  const current = new Map<string, string>();
  for (const t of d.tpls) if (String(t.effective_date) <= today && !current.has(String(t.id))) current.set(String(t.id), String(t.version));
  const nameOf = new Map(d.riders.map((r) => [String(r.id), String(r.full_name || r.email)]));
  const expiring = d.docs.filter((x) => (daysTo(x.expires_on) ?? 99) <= 30);

  async function doSend() {
    if (!send) return;
    const row = { template_id: send.tpl, version: current.get(send.tpl), [send.kind === "rider" ? "profile_id" : "restaurant_id"]: send.party };
    if (await run(sb().from("legal_requests").insert(row), "Contract sent for signature (in-app)")) { setSend(null); void q.reload(); }
  }
  async function revoke(id: unknown) {
    if (await run(sb().from("legal_requests").update({ status: "revoked" }).eq("id", Number(id)), "Request revoked")) void q.reload();
  }
  const SendBox = ({ party, kind }: { party: string; kind: "rider" | "restaurant" }) => send?.party === party ? (
    <div className="flex gap-1"><select data-testid="send-template" className="rounded border border-line text-xs" value={send.tpl} onChange={(e) => setSend({ ...send, tpl: e.target.value })}>
      {(kind === "rider" ? RIDER_TPL : REST_TPL).map((x) => <option key={x} value={x}>{x}</option>)}</select>
      <SmallBtn tone="brand" onClick={doSend}>Send</SmallBtn><SmallBtn onClick={() => setSend(null)}>×</SmallBtn></div>
  ) : <SmallBtn onClick={() => setSend({ party, kind, tpl: (kind === "rider" ? RIDER_TPL : REST_TPL)[0] })}>Send contract</SmallBtn>;
  const openReqs = (k: "profile_id" | "restaurant_id", id: unknown) => d.req.filter((r) => r[k] === id && (r.status === "sent" || r.status === "expired"));

  return (<>
    <ErrorNote error={q.error} />
    <Library tpls={d.tpls} />
    {expiring.length > 0 && (
      <Panel title={`Documents expiring within 30 days (${expiring.length})`}>
        <ul data-testid="expiring-docs" className="text-sm">{expiring.map((x) => { const n = daysTo(x.expires_on)!; return <li key={`${x.profile_id}-${x.kind}`}><b>{nameOf.get(String(x.profile_id)) ?? "rider"}</b>: {String(x.kind)} {n < 0 ? <span className="font-bold text-red-600">expired {String(x.expires_on)}</span> : `expires ${String(x.expires_on)} (${n} d)`}</li>; })}</ul>
        <p className="mt-1 text-xs text-muted">An ops alert is raised once per document (cron every 10 min). An expired ID / right-to-work blocks going online.</p>
      </Panel>
    )}
    <Panel title={`Riders (${d.riders.length})`}>
      <Table head={["Rider", "Employment contract", "Conduct", "Transparency", "Open requests", ""]}>
        {d.riders.map((r) => { const acc = d.acc.filter((a) => a.profile_id === r.id && !a.restaurant_id); const req = d.req.filter((x) => x.profile_id === r.id);
          const main = contractState("rider_employment", acc, req, current);
          return (<tr key={String(r.id)} data-testid="legal-rider-row" data-id={String(r.id)}>
            <Td><button className="text-left font-semibold underline" onClick={() => setSel(sel === r.id ? null : String(r.id))}>{String(r.full_name || r.email)}</button>{r.is_test ? <span className="ml-1 text-xs text-muted">test</span> : null}{r.online ? <span className="ml-1 text-xs text-emerald-700">online</span> : null}</Td>
            <Td><StatusChip s={main} /></Td><Td><StatusChip s={contractState("rider_conduct", acc, req, current)} /></Td><Td><StatusChip s={contractState("platform_transparency", acc, req, current)} /></Td>
            <Td>{openReqs("profile_id", r.id).map((x) => <div key={String(x.id)} className="text-xs">{String(x.template_id)} · {String(x.status)} <button className="underline" onClick={() => revoke(x.id)}>revoke</button></div>)}</Td>
            <Td><SendBox party={String(r.id)} kind="rider" /></Td></tr>); })}
      </Table>
      {sel && <RiderDetail key={sel} rider={d.riders.find((r) => r.id === sel)!} current={current} onChange={() => void q.reload()} />}
    </Panel>
    <Panel title={`Restaurants with staff accounts (${d.rests.length})`}>
      <p className="mb-2 text-xs text-muted">A restaurant with staff can only receive orders after restaurant_partner + dpa_restaurant are signed (current version) and no request is open. Catalogue restaurants without staff are not gated.</p>
      <Table head={["Restaurant", "Partner agreement", "DPA", "Open requests", ""]}>
        {d.rests.map((r) => { const acc = d.acc.filter((a) => a.restaurant_id === r.id); const req = d.req.filter((x) => x.restaurant_id === r.id);
          return (<tr key={String(r.id)} data-testid="legal-rest-row" data-id={String(r.id)}><Td><b>{String(r.name)}</b></Td>
            <Td><StatusChip s={contractState("restaurant_partner", acc, req, current)} /></Td><Td><StatusChip s={contractState("dpa_restaurant", acc, req, current)} /></Td>
            <Td>{openReqs("restaurant_id", r.id).map((x) => <div key={String(x.id)} className="text-xs">{String(x.template_id)} · {String(x.status)} <button className="underline" onClick={() => revoke(x.id)}>revoke</button></div>)}</Td>
            <Td><SendBox party={String(r.id)} kind="restaurant" /></Td></tr>); })}
      </Table>
    </Panel>
    <Panel title="Signature log (append-only)">
      <Table head={["When", "Party", "Document", "Lang", "IP", "Method", "Text hash"]} empty={d.acc.length === 0}>
        {d.acc.slice(0, 100).map((a) => (<tr key={String(a.id)} data-testid="acc-row">
          <Td>{fmtDateTime(a.accepted_at)}</Td><Td>{a.restaurant_id ? (d.rests.find((r) => r.id === a.restaurant_id)?.name as string ?? "restaurant") : nameOf.get(String(a.profile_id)) ?? String(a.profile_id).slice(0, 8)}</Td>
          <Td>{String(a.template_id)} v{String(a.version)}</Td><Td>{String(a.lang ?? "")}</Td><Td>{String(a.ip ?? "—")}</Td><Td>{String(a.method)}</Td><Td><code className="text-xs">{String(a.text_sha256).slice(0, 10)}…</code></Td></tr>))}
      </Table>
    </Panel>
  </>);
}
