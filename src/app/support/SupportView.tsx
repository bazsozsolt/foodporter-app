"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Card, Empty, Header } from "@/components/ui";
import { tx } from "@/lib/i18n";
import { act } from "@/lib/act";
import { useStore } from "@/lib/store";
import { catLabel, reply, signedPhoto, statusLabel, useMyTickets, useTicket, type Message } from "@/lib/support";
import { HelpButton } from "@/components/SupportSheet";

const when = (s: string) => new Date(s).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function Photo({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { let alive = true; void signedPhoto(path).then((u) => { if (alive) setUrl(u); }); return () => { alive = false; }; }, [path]);
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <a href={url} target="_blank" rel="noreferrer noopener"><img src={url} alt={tx("Foto bij melding", "Photo attached")} className="mt-2 max-h-48 rounded-lg" /></a> : <p className="mt-1 text-xs text-muted">…</p>;
}

function Bubble({ m, mine }: { m: Message; mine: boolean }) {
  const who = m.author_role === "admin" ? "Food Porter support" : m.author_role === "system" ? "Food Porter" : tx("Jij", "You");
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div data-testid={`msg-${m.author_role}`} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${mine ? "bg-brand text-white" : m.author_role === "system" ? "bg-gold-soft" : "bg-white"}`}>
        <p className={`text-[11px] font-semibold ${mine ? "text-white/80" : "text-muted"}`}>{who} · {when(m.created_at)}</p>
        {/* rendered as text (React escapes it), never as HTML */}
        <p className="whitespace-pre-wrap break-words">{m.body}</p>
        {m.photo_path && <Photo path={m.photo_path} />}
      </div>
    </div>
  );
}

function Thread({ id }: { id: number }) {
  const { t, msgs, loading, reload } = useTicket(id);
  const { profile } = useStore();
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs.length]);
  if (loading) return <Empty icon="⏳">{tx("Laden…", "Loading…")}</Empty>;
  if (!t) return <Empty icon="🔎">{tx("Melding niet gevonden.", "Ticket not found.")}</Empty>;
  async function send() {
    setBusy(true);
    const ok = await act(reply(id, text, photo).then(() => true));
    setBusy(false);
    if (ok) { setText(""); setPhoto(null); void reload(); }
  }
  return (
    <>
      <Card data-testid="ticket-head">
        <p className="text-xs text-muted">#{t.id} · {catLabel(t.role, t.category)}{t.order_id ? <> · <Link className="font-semibold text-brand" href={`/order/?id=${t.order_id}`}>{tx("Bestelling", "Order")} #{t.order_id}</Link></> : null}</p>
        <p className="mt-1 font-semibold" data-testid="ticket-status">{statusLabel(t.status)}</p>
        {t.refund_requested_cents ? <p className="mt-1 text-sm">💶 {tx("Terugbetaling gevraagd", "Refund requested")}: €{(t.refund_requested_cents / 100).toFixed(2).replace(".", ",")}{t.refund_status && t.refund_status !== "requested" ? ` · ${t.refund_status === "simulated" || t.refund_status === "refunded" || t.refund_status === "pending" || t.refund_status === "queued" ? tx("goedgekeurd", "approved") : t.refund_status}` : ""}</p> : null}
      </Card>
      <div className="mt-3 space-y-2" aria-live="polite" data-testid="thread">
        {msgs.map((m) => <Bubble key={m.id} m={m} mine={m.author_id === profile?.id} />)}
        <div ref={end} />
      </div>
      <div className="sticky bottom-20 mt-3 rounded-2xl bg-white p-2 shadow-lg">
        <textarea data-testid="reply-body" value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={2000} placeholder={tx("Typ een bericht…", "Type a message…")} className="w-full resize-none rounded-xl border border-line p-2 text-sm" />
        <div className="mt-1 flex items-center gap-2">
          <label className="text-xs text-muted">📷<input type="file" accept="image/*" className="ml-1 w-40 text-xs" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} /></label>
          <button data-testid="reply-send" disabled={busy || !text.trim()} onClick={send} className="ml-auto rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{tx("Stuur", "Send")}</button>
        </div>
      </div>
    </>
  );
}

export function SupportView() {
  const id = Number(useSearchParams().get("id")) || null;
  const { profile, ready } = useStore();
  const rows = useMyTickets();
  const role = profile?.role === "rider" || profile?.role === "restaurant" ? profile.role : "customer";
  return (
    <>
      <Header subtitle={tx("Hulp & meldingen", "Help & tickets")} />
      <main id="main" className="p-4 pb-40">
        {!ready ? <Empty icon="⏳">{tx("Laden…", "Loading…")}</Empty> : !profile ? <Empty icon="🔐">{tx("Log in om je meldingen te zien.", "Sign in to see your tickets.")}</Empty>
          : id ? <><Link href="/support/" className="mb-2 block text-sm font-semibold text-brand">← {tx("Alle meldingen", "All tickets")}</Link><Thread id={id} /></>
          : (
            <>
              <div className="mb-3 flex items-center justify-between"><h1 className="font-display text-2xl">{tx("Mijn meldingen", "My tickets")}</h1><HelpButton role={role} label={tx("Nieuwe melding", "New ticket")} /></div>
              {rows === null ? <Empty icon="⏳">{tx("Laden…", "Loading…")}</Empty> : rows.length === 0 ? <Empty icon="🙌">{tx("Geen meldingen. Hulp nodig bij een bestelling? Open de bestelling en tik op Hulp.", "No tickets. Need help with an order? Open it and tap Help.")}</Empty> : (
                <div className="space-y-2" data-testid="my-tickets">
                  {rows.map((t) => (
                    <Link key={t.id} href={`/support/?id=${t.id}`} className="block rounded-2xl bg-white p-3 shadow-[0_2px_10px_rgba(0,0,0,.05)]">
                      <p className="text-sm font-semibold">{t.subject}</p>
                      <p className="text-xs text-muted">{statusLabel(t.status)} · {when(t.last_message_at)}</p>
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}
      </main>
    </>
  );
}
