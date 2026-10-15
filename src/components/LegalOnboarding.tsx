"use client";
import { useCallback, useEffect, useState } from "react";
import { FileText, ShieldCheck } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { tx, useLang } from "@/lib/i18n";
import { act } from "@/lib/act";
import { Button, Card } from "@/components/ui";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
export type LegalStatus = { ready: boolean; missing: string[]; contract_type?: string; gated?: boolean };
type Tpl = { id: string; version: string; title: string; pdf_path: string; html_path: string; sha256: string; effective_date: string };

const STEP_LABEL: Record<string, [string, string]> = {
  id_checked: ["Identiteitsbewijs gecontroleerd", "ID document checked"],
  right_to_work: ["Recht om in NL te werken gecontroleerd", "Right to work in NL checked"],
  age_checked: ["Leeftijd gecontroleerd (min. 16)", "Age checked (16+)"],
  iban: ["IBAN gecontroleerd", "IBAN checked"],
  loonheffing_form: ["Opgaaf loonheffingen (loonheffingskorting) ingeleverd", "Payroll tax form (loonheffingskorting) handed in"],
  bsn_entered: ["BSN ingevoerd bij de loonadministratie (beveiligd)", "BSN entered with the payroll provider (secure)"],
  safety_briefing: ["Veiligheidsinstructie gevolgd", "Safety briefing completed"],
};
const label = (m: string) => {
  if (m.startsWith("step:")) { const s = STEP_LABEL[m.slice(5)]; return s ? tx(s[0], s[1]) : m; }
  if (m.startsWith("doc_expired:")) return tx(`Document verlopen: ${m.slice(12)} — lever een nieuw exemplaar aan`, `Document expired: ${m.slice(12)}: please provide a new one`);
  if (m === "age_under_16") return tx("Je moet minimaal 16 jaar zijn", "You must be at least 16");
  if (m === "atw_break") return tx("Je hebt lang achter elkaar gewerkt: neem eerst minstens 15 minuten pauze", "You've worked a long stretch: take a break of at least 15 minutes first");
  if (m.startsWith("atw_rest:")) {
    const t = new Date(m.slice(9));
    const when = t.toLocaleString(tx("nl-NL", "en-GB"), { weekday: "short", hour: "2-digit", minute: "2-digit" });
    return tx(`Je hebt 12 uur rust nodig tussen twee diensten. Je kunt weer inklokken vanaf ${when}.`, `You need 12 hours' rest between shifts. You can clock in again from ${when}.`);
  }
  if (m === "atw_max_shift") return tx("Maximale dienstduur voor vandaag bereikt", "Maximum shift length for today reached");
  if (m === "atw_week_max") return tx("Maximaal aantal uren deze week bereikt", "Maximum hours for this week reached");
  if (m === "youth_night") return tx("Onder 18 mag je niet werken tussen 23:00 en 06:00", "Under 18 you may not work between 23:00 and 06:00");
  return m;
};

/** Which template ids the caller still has to sign, derived from the server status. */
function toSign(st: LegalStatus): string[] {
  const out = new Set<string>();
  for (const m of st.missing) {
    if (m === "contract") out.add("rider_employment");
    else if (m === "conduct") out.add("rider_conduct");
    else if (m === "transparency") out.add("platform_transparency");
    else if (m === "restaurant_partner" || m === "dpa_restaurant") out.add(m);
    else if (m.startsWith("pending:")) out.add(m.slice(8));
  }
  return [...out];
}

export function useLegalStatus() {
  const [st, setSt] = useState<LegalStatus | null>(null);
  const reload = useCallback(async () => {
    const sb = getSupabase();
    const { data } = sb ? await sb.rpc("my_legal_status") : { data: null };
    setSt((data as LegalStatus) ?? { ready: true, missing: [] });
  }, []);
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    void sb.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return; // signed out: RoleGate shows the login prompt
      const { data } = await sb.rpc("my_legal_status");
      setSt((data as LegalStatus) ?? { ready: true, missing: [] });
    });
  }, []);
  return { st, reload };
}

function SignDoc({ tpl, onDone }: { tpl: Tpl; onDone: () => void }) {
  const lang = useLang();
  const [html, setHtml] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [agree, setAgree] = useState(false);
  useEffect(() => {
    if (!open || html) return;
    void fetch(`${BASE}/${tpl.html_path}`).then((r) => r.text()).then(setHtml).catch(() => setHtml(""));
  }, [open, html, tpl.html_path]);
  async function accept() {
    const sb = getSupabase();
    if (!sb) return;
    const ok = await act((async () => {
      const { error } = await sb.rpc("legal_accept", { p_template: tpl.id, p_sha256: tpl.sha256, p_lang: lang });
      if (error) throw new Error(error.message);
      return true;
    })(), tx("Akkoord vastgelegd", "Acceptance recorded"));
    if (ok) onDone();
  }
  return (
    <div data-testid="legal-doc" data-template={tpl.id} className="mt-3 rounded-xl border border-line p-3">
      <div className="flex items-start gap-2"><FileText size={18} className="mt-0.5 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1"><b className="block">{tpl.title}</b><span className="text-xs text-muted">{tx("Versie", "Version")} {tpl.version} · {tx("geldig vanaf", "effective")} {tpl.effective_date}</span></div></div>
      <div className="mt-2 flex flex-wrap gap-2 text-sm">
        <button className="rounded-lg bg-subtle px-3 py-1.5 font-semibold" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? tx("Verbergen", "Hide") : tx("Lezen", "Read")}</button>
        <a className="rounded-lg bg-subtle px-3 py-1.5 font-semibold" href={`${BASE}/${tpl.pdf_path}`} target="_blank" rel="noreferrer">{tx("PDF downloaden", "Download PDF")}</a>
      </div>
      {open && <div data-testid="legal-text" className="legal-doc mt-2 max-h-80 overflow-y-auto rounded-lg bg-subtle/60 p-3 text-[13px]" dangerouslySetInnerHTML={{ __html: html ?? tx("Laden…", "Loading…") }} />}
      <p className="mt-2 text-xs text-muted">{tx("De Nederlandse tekst is bindend; onderaan staat een Engelse samenvatting.", "The Dutch text is binding; an English summary is at the end of the document.")}</p>
      <label className="mt-2 flex items-start gap-2 text-sm"><input data-testid="legal-agree" type="checkbox" className="mt-1" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        <span>{tx("Ik heb dit document gelezen en ga akkoord.", "I have read this document and agree.")}</span></label>
      <Button data-testid="legal-accept" disabled={!agree} onClick={accept}>{tx("Akkoord en ondertekenen", "Agree and sign")}</Button>
    </div>
  );
}

/** Onboarding gate card for riders and restaurant staff. Hidden once everything is signed and done. */
export function LegalOnboarding({ st, reload, who }: { st: LegalStatus | null; reload: () => void; who: "rider" | "restaurant" }) {
  const [tpls, setTpls] = useState<Tpl[]>([]);
  const ids = st ? toSign(st) : [];
  const key = ids.join(",");
  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !key) return;
    void sb.from("legal_templates").select("id, version, title, pdf_path, html_path, sha256, effective_date").in("id", key.split(","))
      .lte("effective_date", new Date().toISOString().slice(0, 10)).order("effective_date", { ascending: false }).order("created_at", { ascending: false }).order("created_at", { ascending: false })
      .then(({ data }) => { const seen = new Set<string>(); setTpls(((data ?? []) as Tpl[]).filter((x) => !seen.has(x.id) && seen.add(x.id))); });
  }, [key]);
  if (!st || st.ready) return null;
  const other = st.missing.filter((m) => m.startsWith("step:") || m.startsWith("doc_expired:") || m.startsWith("age") || m === "youth_night" || m.startsWith("atw_"));
  return (
    <Card data-testid="legal-onboarding" className="mb-3 !border-2 !border-brand">
      <b className="flex items-center gap-2 text-[16px]"><ShieldCheck size={18} aria-hidden />{who === "rider" ? (st.missing.every((m) => m.startsWith("atw_") || m === "youth_night") ? tx("Inklokken kan nu niet (Arbeidstijdenwet)", "You can't clock in right now (Working Hours Act)") : tx("Rond je onboarding af om in te klokken", "Finish onboarding to clock in")) : tx("Onderteken je overeenkomst om bestellingen te ontvangen", "Sign your agreement to receive orders")}</b>
      <p className="mt-1 text-[13px] text-muted">{who === "rider" ? tx("Je kunt pas inklokken als alles hieronder klaar is.", "You can clock in once everything below is done.") : tx("Tot dan staat je restaurant voor klanten op gesloten.", "Until then your restaurant shows as closed to customers.")}</p>
      {tpls.filter((x) => ids.includes(x.id)).map((x) => <SignDoc key={x.id} tpl={x} onDone={reload} />)}
      {other.length > 0 && (<>
        <p className="mt-3 text-sm font-semibold">{tx("Nog af te ronden met Food Porter:", "Still to complete with Food Porter:")}</p>
        <ul data-testid="legal-steps" className="ml-5 list-disc text-[13px]">{other.map((m) => <li key={m}>{label(m)}</li>)}</ul>
      </>)}
    </Card>
  );
}
