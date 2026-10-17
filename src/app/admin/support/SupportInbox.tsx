"use client";
import { DeliveryPhoto } from "@/components/DeliveryProof";
import { AdminOrderContact } from "@/components/OrderChat";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ErrorNote, Field, inputCls, Panel, SmallBtn, StatusBadge, Table, Td } from "@/components/admin";
import { fmtDateTime, sb, useAdminQuery, type Row } from "@/lib/admin";
import { act } from "@/lib/act";
import { getSupabase } from "@/lib/supabase";
import { reply, signedPhoto, useTicket, type Ticket } from "@/lib/support";
import { useStore } from "@/lib/store";

const CANNED: [string, string][] = [
  ["Sorry + refund", "Sorry dat het misging! We hebben een terugbetaling gestart; je ziet het bedrag binnen 1–3 werkdagen terug."],
  ["Looking into it", "Bedankt voor je melding. We zoeken het uit en laten je zo snel mogelijk iets weten."],
  ["Rider on the way", "We hebben contact gehad met de bezorger: je bestelling is onderweg. Excuses voor het wachten!"],
  ["Need photo", "Kun je een foto sturen van wat er mis is? Dan kunnen we het sneller oplossen."],
  ["Pay schedule", "Je loon, bezorgbonussen en fooien worden via de loonadministratie uitbetaald; je ziet ze op je loonstrook. Een indicatief weekoverzicht staat in de app onder Uren & loon."],
  ["Item unavailable → customer", "Het restaurant liet weten dat een item op was. We betalen dat deel terug."],
];
const PRI_ORDER: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
const priTone = (p: string) => (p === "urgent" ? "bg-[#c40000] text-white" : p === "high" ? "bg-brand-soft text-brand" : p === "normal" ? "bg-subtle text-ink" : "bg-white text-muted");

function useNow(ms = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}
function Sla({ t, now }: { t: Ticket; now: number }) {
  if (t.status === "resolved") return <span className="text-muted">done</span>;
  if (t.first_response_at) return <span className="text-ok">answered</span>;
  const m = Math.round((Date.parse(t.sla_due_at) - now) / 60000);
  return <span data-testid="sla" className={m < 0 ? "font-bold text-[#c40000]" : m < 15 ? "font-semibold text-brand" : ""}>{m < 0 ? `overdue ${-m}m` : `due in ${m < 120 ? `${m}m` : `${Math.round(m / 60)}h`}`}</span>;
}

function Inbox() {
  const router = useRouter();
  const now = useNow();
  const [status, setStatus] = useState<"active" | "open" | "waiting_user" | "resolved" | "all">("active");
  const [role, setRole] = useState("all");
  const [pri, setPri] = useState("all");
  const [real, setReal] = useState(false);
  const q = useAdminQuery<Ticket[]>(async () => {
    let x = sb().from("support_tickets").select("*").order("created_at", { ascending: false }).limit(300);
    if (status === "active") x = x.neq("status", "resolved"); else if (status !== "all") x = x.eq("status", status);
    if (role !== "all") x = x.eq("role", role);
    if (pri !== "all") x = x.eq("priority", pri);
    if (real) x = x.eq("is_test", false);
    const r = await x; return { data: (r.data as Ticket[]) ?? [], error: r.error };
  }, [status, role, pri, real]);
  const { reload } = q;
  useEffect(() => {
    const c = getSupabase(); if (!c) return;
    const ch = c.channel(`admin-support-${Math.random().toString(36).slice(2, 7)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets" }, () => void reload())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages" }, () => void reload()).subscribe();
    return () => { void c.removeChannel(ch); };
  }, [reload]);
  const rows = [...(q.data ?? [])].sort((a, b) => (a.status === "resolved" ? 1 : 0) - (b.status === "resolved" ? 1 : 0) || PRI_ORDER[a.priority] - PRI_ORDER[b.priority] || Date.parse(a.sla_due_at) - Date.parse(b.sla_due_at));
  const sel = (v: string, set: (v: string) => void, opts: string[], label: string) => (
    <label className="text-sm">{label} <select aria-label={label} className="rounded-lg border px-2 py-1" value={v} onChange={(e) => set(e.target.value)}>{opts.map((o) => <option key={o}>{o}</option>)}</select></label>
  );
  return (
    <Panel title={`Support inbox (${rows.length})`} actions={<>
      {sel(status, (v) => setStatus(v as typeof status), ["active", "open", "waiting_user", "resolved", "all"], "Status")}
      {sel(role, setRole, ["all", "customer", "restaurant", "rider"], "Role")}
      {sel(pri, setPri, ["all", "urgent", "high", "normal", "low"], "Priority")}
      <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={real} onChange={(e) => setReal(e.target.checked)} /> real only</label></>}>
      <ErrorNote error={q.error} />
      <Table head={["#", "Priority", "Subject", "Role", "Status", "SLA", "Refund", "Last activity"]} empty={!q.loading && rows.length === 0}>
        {rows.map((t) => (
          <tr key={t.id} data-testid="ticket-row" className="cursor-pointer hover:bg-[#faf8f5]" onClick={() => router.push(`/admin/support?id=${t.id}`)}>
            <Td><Link className="font-semibold text-brand" href={`/admin/support?id=${t.id}`}>#{t.id}</Link>{t.is_test ? " 🧪" : ""}</Td>
            <Td><span className={`rounded px-1.5 py-0.5 text-xs font-bold ${priTone(t.priority)}`}>{t.priority}</span></Td>
            <Td>{t.subject}</Td><Td>{t.role}</Td><Td><StatusBadge s={t.status} /></Td><Td><Sla t={t} now={now} /></Td>
            <Td>{t.refund_requested_cents ? `€${(t.refund_requested_cents / 100).toFixed(2)} · ${t.refund_status}` : ""}</Td>
            <Td>{fmtDateTime(t.last_message_at)}</Td>
          </tr>
        ))}
      </Table>
    </Panel>
  );
}

function AdminPhoto({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { let a = true; void signedPhoto(path).then((u) => { if (a) setUrl(u); }); return () => { a = false; }; }, [path]);
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <a href={url} target="_blank" rel="noreferrer noopener"><img data-testid="ticket-photo" src={url} alt="attachment" className="mt-1 max-h-56 rounded-lg" /></a> : <span className="text-xs text-muted">loading photo…</span>;
}

function Detail({ id }: { id: number }) {
  const { t, msgs, reload } = useTicket(id);
  const { profile } = useStore();
  const now = useNow();
  const [text, setText] = useState("");
  const [internal, setInternal] = useState(false);
  const [amount, setAmount] = useState("");
  const extra = useAdminQuery<Row>(async () => {
    if (!t) return { data: null, error: null };
    const c = sb();
    const [who, ord, ev] = await Promise.all([
      c.from("profiles").select("full_name, email, role").eq("id", t.created_by).maybeSingle(),
      t.order_id ? c.from("order_facts").select("*").eq("id", t.order_id).maybeSingle() : Promise.resolve({ data: null }),
      t.order_id ? c.from("audit_events").select("type, from_value, to_value, created_at").eq("order_id", t.order_id).order("created_at") : Promise.resolve({ data: [] }),
    ]);
    // abuse signal: how many tickets / approved refunds this sender had in the last 90 days
    const since = new Date(Date.now() - 90 * 86400000).toISOString();
    const hist = (await c.from("support_tickets").select("id, refund_status, refund_cents").eq("created_by", t.created_by).gte("created_at", since)).data ?? [];
    const o2 = t.order_id ? (await c.from("orders").select("lat, lng, address, subtotal_cents, delivery_fee_cents, service_fee_cents, tip_cents, discount_cents, credit_cents, refund_cents, mollie_payment_id, leave_at_door, delivery_photo_path").eq("id", t.order_id).maybeSingle()).data : null;
    return { data: { who: who.data, fact: ord.data, events: ev.data ?? [], order: o2, hist: { tickets: hist.length, refunds: hist.filter((h) => ['refunded', 'pending', 'queued', 'simulated'].includes(String(h.refund_status))).length, cents: hist.reduce((a, h) => a + Number(h.refund_cents ?? 0), 0) } }, error: null };
  }, [t?.id, t?.order_id]);
  if (!t) return <Panel title={`Ticket #${id}`}><p className="text-sm text-muted">Loading…</p></Panel>;
  const x = extra.data as { who?: Row; fact?: Row; events?: Row[]; order?: Row; hist?: { tickets: number; refunds: number; cents: number } } | null;
  const o = x?.order as Row | undefined;
  const mapAt = t.lat != null ? { lat: t.lat, lng: t.lng } : o?.lat ? { lat: o.lat, lng: o.lng } : null;
  const upd = (args: Record<string, unknown>, msg: string) => act((async () => { const { error } = await sb().rpc("support_admin_update", { p_ticket: id, ...args }); if (error) throw new Error(error.message); return true; })(), msg).then(() => reload());
  async function send() {
    const ok = await act(reply(id, text, null, internal).then(() => true), internal ? "Note added" : "Reply sent");
    if (ok) { setText(""); setInternal(false); void reload(); }
  }
  async function refund() {
    const cents = Math.round(Number((amount || String((t!.refund_requested_cents ?? 0) / 100)).replace(",", ".")) * 100);
    if (!(cents > 0) || !confirm(`Refund €${(cents / 100).toFixed(2)} for order #${t!.order_id}?`)) return;
    await act((async () => {
      const { data, error } = await getSupabase()!.functions.invoke("order-refund", { body: { ticket_id: id, amount_cents: cents } });
      if (error) { const body = await (error as { context?: Response }).context?.json?.().catch(() => null); throw new Error(body?.error ?? error.message); }
      return data;
    })(), (d: { status?: string }) => `Refund ${d?.status ?? "started"}`);
    void reload();
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <Panel title={<span data-testid="ticket-title">#{t.id} · {t.subject}</span>} actions={<>
        <Link href="/admin/support" className="text-sm font-semibold text-brand">← Inbox</Link></>}>
        <div className="space-y-2" data-testid="admin-thread">
          {msgs.map((m) => (
            <div key={m.id} className={`rounded-xl p-2 text-sm ${m.internal ? "border border-dashed border-gold bg-gold-soft" : m.author_role === "admin" ? "bg-brand-soft" : m.author_role === "system" ? "bg-subtle" : "bg-white"}`}>
              <p className="text-[11px] font-semibold text-muted">{m.internal ? "internal note · " : ""}{m.author_role} · {fmtDateTime(m.created_at)}</p>
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
              {m.photo_path && <AdminPhoto path={m.photo_path} />}
            </div>
          ))}
        </div>
        <div className="mt-3 grid gap-2">
          <select aria-label="Canned replies" className={inputCls} value="" onChange={(e) => setText(e.target.value)}>
            <option value="">Canned reply…</option>{CANNED.map(([k, v]) => <option key={k} value={v}>{k}</option>)}
          </select>
          <textarea data-testid="admin-reply" className={inputCls} rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Reply to the user (Dutch)…" />
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> internal note</label>
            <span className="ml-auto" /><SmallBtn tone="brand" disabled={!text.trim()} onClick={send}>{internal ? "Add note" : "Send reply"}</SmallBtn>
          </div>
        </div>
      </Panel>
      <div className="grid content-start gap-4">
        <Panel title="Ticket">
          <dl className="grid grid-cols-[110px_1fr] gap-y-1 text-sm">
            <dt className="text-muted">From</dt><dd>{String((x?.who as Row)?.full_name ?? "")} · {t.role}{t.is_test ? " 🧪" : ""}</dd>
            {x?.hist && <><dt className="text-muted">Last 90 days</dt><dd data-testid="abuse-signal" className={x.hist.refunds >= 3 ? "font-bold text-[#c40000]" : ""}>{x.hist.tickets} tickets · {x.hist.refunds} refunds (€{(x.hist.cents / 100).toFixed(2)}){x.hist.refunds >= 3 ? " check for abuse" : ""}</dd></>}
            <dt className="text-muted">Category</dt><dd>{t.category}</dd>
            <dt className="text-muted">Status</dt><dd><StatusBadge s={t.status} /></dd>
            <dt className="text-muted">SLA</dt><dd><Sla t={t} now={now} /></dd>
            <dt className="text-muted">Assigned</dt><dd data-testid="assigned">{t.assigned_to ? (t.assigned_to === profile?.id ? "me" : "someone") : "—"}</dd>
            {t.order_id && <><dt className="text-muted">Order</dt><dd><Link className="font-semibold text-brand" href={`/admin/orders?id=${t.order_id}`}>#{t.order_id}</Link> · {String((x?.fact as Row)?.status ?? "")}</dd></>}
            {mapAt && <><dt className="text-muted">Map</dt><dd><a data-testid="map-link" className="font-semibold text-brand" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${mapAt.lat},${mapAt.lng}`}>{t.lat != null ? "reported location" : "delivery address"}</a></dd></>}
          </dl>
          <div className="mt-3 flex flex-wrap gap-2">
            <SmallBtn onClick={() => upd({ p_assign: profile?.id }, "Assigned to you")}>Assign to me</SmallBtn>
            {t.status !== "resolved" ? <SmallBtn tone="ok" onClick={() => upd({ p_status: "resolved" }, "Resolved")}>Resolve</SmallBtn> : <SmallBtn onClick={() => upd({ p_status: "open" }, "Reopened")}>Reopen</SmallBtn>}
            <select data-persist aria-label="Priority" className="rounded-lg border px-2 py-1 text-sm" value={t.priority} onChange={(e) => upd({ p_priority: e.target.value }, "Priority changed")}>
              {["urgent", "high", "normal", "low"].map((p) => <option key={p}>{p}</option>)}
            </select>
            {t.category === "privacy" && <SmallBtn tone="danger" onClick={() => { if (window.confirm("Anonymise this profile and delete the login? This cannot be undone. Financial records are kept.")) act((async () => { const { error } = await sb().rpc("fp_erase_account", { p_id: (t as unknown as Row).created_by }); if (error) throw new Error(error.message); return true; })(), "Profile anonymised, login deleted").then(() => reload()); }}>Anonymise &amp; delete login</SmallBtn>}
          </div>
        </Panel>
        {o && (o.leave_at_door || o.delivery_photo_path) ? <Panel title="Proof of delivery"><p className="text-sm">{o.leave_at_door ? "Customer chose leave at the door." : "Handed over in person."}</p>{o.delivery_photo_path ? <DeliveryPhoto path={String(o.delivery_photo_path)} english /> : <p className="text-xs text-muted">No photo.</p>}</Panel> : null}
        {t.order_id && <Panel title="Order chat & calls"><AdminOrderContact orderId={t.order_id} /></Panel>}
        {t.order_id && (
          <Panel title="Refund">
            <p className="text-sm">Requested: <b>{t.refund_requested_cents ? `€${(t.refund_requested_cents / 100).toFixed(2)}` : "—"}</b>{t.refund_status ? ` · ${t.refund_status}` : ""}{t.refund_cents ? ` · refunded €${(t.refund_cents / 100).toFixed(2)}` : ""}</p>
            {o && <p className="text-xs text-muted">Order total €{((Number(o.subtotal_cents) + Number(o.delivery_fee_cents) + Number(o.service_fee_cents ?? 0) + Number(o.tip_cents ?? 0) - Number(o.discount_cents ?? 0) - Number(o.credit_cents ?? 0)) / 100).toFixed(2)}{o.refund_cents ? ` · already refunded €${(Number(o.refund_cents) / 100).toFixed(2)}` : ""}</p>}
            {!["processing", "refunded", "pending", "queued", "simulated"].includes(t.refund_status ?? "") && (
              <div className="mt-2 flex gap-2"><Field label="Amount (€)"><input data-testid="refund-amount" className={inputCls} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={t.refund_requested_cents ? (t.refund_requested_cents / 100).toFixed(2) : "0.00"} /></Field>
                <div className="self-end"><SmallBtn tone="danger" onClick={refund}>Refund via Mollie</SmallBtn></div></div>
            )}
          </Panel>
        )}
        {(x?.events?.length ?? 0) > 0 && (
          <Panel title="Order timeline">
            <ol className="space-y-1 text-xs" data-testid="order-timeline">
              {x!.events!.map((e, i) => <li key={i}><span className="text-muted">{fmtDateTime(String(e.created_at))}</span> · {String(e.type)} {e.from_value ? `${String(e.from_value)} → ` : ""}{String(e.to_value ?? "")}</li>)}
            </ol>
          </Panel>
        )}
      </div>
    </div>
  );
}

export function SupportInbox() {
  const id = Number(useSearchParams().get("id")) || null;
  return id ? <Detail id={id} /> : <Inbox />;
}
