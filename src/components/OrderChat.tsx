"use client";
import { ChevronDown, ChevronUp, Phone } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { tx } from "@/lib/i18n";
import { act } from "@/lib/act";
import { QUICK, callOther, sendChat, useChat, type ChatChannel } from "@/lib/chat";

const ACTIVE = ["assigned", "ready", "picked_up"];

/** "Bel rider/klant": only during an active delivery; the number comes from a secured, audited RPC. */
export function CallButton({ orderId, status, side, asAdmin = false }: { orderId: number; status: string; side: "customer" | "rider"; asAdmin?: boolean }) {
  const [busy, setBusy] = useState(false);
  if (!ACTIVE.includes(status)) return null;
  return (
    <button data-testid="call-btn" disabled={busy} onClick={async () => { setBusy(true); await act(callOther(orderId, asAdmin ? (side === "customer" ? "rider" : "customer") : undefined)); setBusy(false); }}
      className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-line bg-white px-3 text-sm font-semibold text-ink disabled:opacity-50">
      <Phone size={16} className="text-brand" aria-hidden />{side === "customer" ? tx("Bel bezorger", "Call rider") : tx("Bel klant", "Call customer")}
    </button>
  );
}

/** Per-order chat. side = who I am in this conversation; readOnly for admins. */
/** Mirrors the server lock (fp_chat_open): closed when cancelled, 2 h after delivery, or (rider chat) without a rider. */
export function chatClosed(channel: ChatChannel, o?: { status: string; delivered_at?: string | null; rider_id?: string | null } | null, lockMinutes = 120) {
  if (!o) return false;
  if (o.status === "delivered") return !o.delivered_at || Date.now() - Date.parse(o.delivered_at) > lockMinutes * 60000;
  if (["cancelled", "payment_failed", "awaiting_payment"].includes(o.status)) return true;
  return channel === "rider" ? !o.rider_id || !["assigned", "ready", "picked_up"].includes(o.status) : !["placed", "accepted", "assigned", "ready", "picked_up"].includes(o.status);
}

export function OrderChat({ orderId, channel, side, readOnly, title, order }: { orderId: number; channel: ChatChannel; side: "customer" | "rider" | "restaurant" | "admin"; readOnly?: boolean; title?: string; order?: { status: string; delivered_at?: string | null; rider_id?: string | null } | null }) {
  const rows = useChat(orderId, channel);
  const [open, setOpen] = useState(!!readOnly);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [serverClosed, setServerClosed] = useState(false);
  const closed = !readOnly && (serverClosed || chatClosed(channel, order));
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [rows?.length, open]);
  const label = title ?? (channel === "rider"
    ? (side === "customer" ? tx("Chat met bezorger", "Chat with rider") : tx("Chat met klant", "Chat with customer"))
    : (side === "customer" ? tx("Chat met restaurant", "Chat with restaurant") : tx("Chat met klant", "Chat with customer")));
  const unread = (rows ?? []).filter((m) => m.author_role !== side).length;
  async function send(body: string, quick = false) {
    if (!body.trim()) return;
    setBusy(true);
    const ok = await act(sendChat(orderId, channel, body, quick).catch((e: Error) => { if (/gesloten|closed/i.test(e.message)) setServerClosed(true); throw e; }));
    setBusy(false);
    if (ok) setText("");
  }
  const mine = (r: string) => r === side;
  const who = (r: string) => ({ customer: tx("Klant", "Customer"), rider: tx("Bezorger", "Rider"), restaurant: tx("Restaurant", "Restaurant"), admin: "Admin" } as Record<string, string>)[r] ?? r;
  return (
    <div className="rounded-2xl border border-line bg-white" data-testid={`chat-${channel}`}>
      <button onClick={() => setOpen(!open)} className="flex min-h-12 w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold" data-testid={`chat-toggle-${channel}`}>
        <span>💬 {label}</span>
        <span className="text-xs text-muted">{unread > 0 && !open ? `${unread} ${tx("bericht(en)", "message(s)")}` : open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="border-t border-line p-3">
          <div className="max-h-64 space-y-2 overflow-y-auto" data-testid="chat-list">
            {rows === null && <p className="text-xs text-muted">{tx("Laden…", "Loading…")}</p>}
            {rows?.length === 0 && <p className="text-xs text-muted">{readOnly ? "No messages" : tx("Nog geen berichten. Je telefoonnummer blijft privé.", "No messages yet. Your phone number stays private.")}</p>}
            {rows?.map((m) => (
              <div key={m.id} className={`flex ${mine(m.author_role) ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-sm ${mine(m.author_role) ? "bg-brand text-white" : "bg-subtle"}`}>
                  {!mine(m.author_role) && <div className="text-[10px] font-semibold opacity-70">{who(m.author_role)}</div>}
                  {m.body}
                  <div className="text-right text-[10px] opacity-60">{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                </div>
              </div>
            ))}
            <div ref={end} />
          </div>
          {closed && <p className="mt-2 rounded-xl bg-subtle p-2 text-xs text-muted" data-testid="chat-closed">{tx("Deze chat is gesloten. Hulp nodig? Gebruik de Hulp-knop.", "This chat is closed. Need help? Use the Help button.")}</p>}
          {!readOnly && !closed && (
            <>
              <div className="mt-2 flex flex-wrap gap-1.5" data-testid="chat-quick">
                {(QUICK[side] ?? []).map(([nl, en]) => (
                  <button key={nl} disabled={busy} onClick={() => send(tx(nl, en), true)} className="min-h-9 rounded-full border border-line bg-subtle px-3 py-1.5 text-xs font-semibold">{tx(nl, en)}</button>
                ))}
              </div>
              <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
                <input data-testid="chat-input" value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder={tx("Typ een bericht…", "Type a message…")}
                  className="min-w-0 flex-1 rounded-xl border border-line px-3 py-2 text-sm" />
                <button data-testid="chat-send" disabled={busy || !text.trim()} className="rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{tx("Stuur", "Send")}</button>
              </form>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Admin (English UI): both chats of an order read-only, plus the call audit log. */
export function AdminOrderContact({ orderId }: { orderId: number }) {
  const [calls, setCalls] = useState<{ id: number; caller_role: string; callee_role: string; provider: string; created_at: string }[] | null>(null);
  useEffect(() => {
    void import("@/lib/supabase").then(({ getSupabase }) => getSupabase()?.from("call_audit").select("id, caller_role, callee_role, provider, created_at").eq("order_id", orderId).order("created_at")
      .then(({ data }) => setCalls(data ?? [])));
  }, [orderId]);
  return (
    <div className="space-y-2" data-testid="admin-contact">
      <OrderChat orderId={orderId} channel="rider" side="admin" readOnly title="Chat customer ↔ rider" />
      <OrderChat orderId={orderId} channel="restaurant" side="admin" readOnly title="Chat customer ↔ restaurant" />
      <div className="text-xs text-muted" data-testid="call-audit">📞 Calls: {calls === null ? "…" : calls.length === 0 ? "none" : calls.map((c) => `${c.caller_role}→${c.callee_role} ${new Date(c.created_at).toLocaleString()} (${c.provider})`).join(" · ")}</div>
    </div>
  );
}
