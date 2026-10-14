"use client";
import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { tx } from "@/lib/i18n";

export type ChatChannel = "rider" | "restaurant";
export interface ChatMessage { id: number; order_id: number; channel: ChatChannel; author_id: string | null; author_role: string; body: string; quick: boolean; created_at: string }

/** Quick replies per sender side: [Dutch, English]. The Dutch text is what gets sent when the UI is Dutch. */
export const QUICK: Record<string, [string, string][]> = {
  customer: [["Ik sta beneden", "I'm downstairs"], ["Bel aan", "Ring the bell"], ["Ik ben er over 2 min", "I'll be there in 2 min"], ["Laat het bij de deur", "Leave it at the door"]],
  admin: [["Je bezorger is onderweg", "Your rider is on the way"], ["We kijken mee, even geduld", "We're on it, one moment"]],
  rider: [["Ik ben er over 2 min", "I'll be there in 2 min"], ["Ik sta voor de deur", "I'm at the door"], ["Ik kan het adres niet vinden", "I can't find the address"], ["Kom je naar beneden?", "Can you come down?"]],
  restaurant: [["Je bestelling is bijna klaar", "Your order is almost ready"], ["Een item is op, we bellen je", "An item is sold out, we'll contact you"]],
};

export async function sendChat(order: number, channel: ChatChannel, body: string, quick = false) {
  const sb = getSupabase(); if (!sb) throw new Error("offline");
  const { data, error } = await sb.rpc("order_chat_send", { p_order: order, p_channel: channel, p_body: body, p_quick: quick });
  if (error) throw new Error(error.message || tx("Bericht niet verstuurd", "Message not sent"));
  return data as number;
}

/** Messages of one order channel, live via realtime. Empty list when the chat is locked or not yours (RLS). */
export function useChat(order: number | null, channel: ChatChannel) {
  const [rows, setRows] = useState<ChatMessage[] | null>(null);
  useEffect(() => {
    const sb = getSupabase(); if (!sb || !order) return;
    let alive = true;
    const load = () => sb.from("order_messages").select("*").eq("order_id", order).eq("channel", channel).order("created_at").limit(200)
      .then(({ data }) => { if (alive) setRows((data as ChatMessage[]) ?? []); });
    const first = setTimeout(load, 0);
    const ch = sb.channel(`chat-${order}-${channel}-${Math.random().toString(36).slice(2, 7)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "order_messages", filter: `order_id=eq.${order}` }, load).subscribe();
    const poll = setInterval(load, 15000); // safety net when realtime drops on mobile
    return () => { alive = false; clearTimeout(first); clearInterval(poll); void sb.removeChannel(ch); };
  }, [order, channel]);
  return rows;
}

/** Ask the server for the counterpart's number (only during an active delivery, audited) and dial it. */
export async function callOther(order: number, target?: "rider" | "customer") {
  const sb = getSupabase(); if (!sb) throw new Error("offline");
  const { data, error } = await sb.rpc("order_call", { p_order: order, p_target: target ?? null });
  if (error) throw new Error(error.message);
  const n = (data as { number?: string } | null)?.number;
  if (!n) throw new Error("Geen telefoonnummer beschikbaar");
  window.location.href = `tel:${n}`;
  return data as { provider: string; number: string };
}
