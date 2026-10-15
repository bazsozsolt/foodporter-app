"use client";
import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { tx } from "@/lib/i18n";

export type SupportRole = "customer" | "restaurant" | "rider";
export interface Ticket {
  id: number; order_id: number | null; created_by: string; role: SupportRole; category: string; priority: string; status: string;
  subject: string; assigned_to: string | null; refund_requested_cents: number | null; refund_status: string | null; refund_cents: number | null;
  lat: number | null; lng: number | null; sla_due_at: string; first_response_at: string | null; resolved_at: string | null;
  last_message_at: string; created_at: string; is_test: boolean;
}
export interface Message { id: number; ticket_id: number; author_id: string | null; author_role: string; body: string; photo_path: string | null; internal: boolean; created_at: string }

/** Categories per role: [key, Dutch, English, offers a refund request] */
export const CATEGORIES: Record<SupportRole, [string, string, string, boolean][]> = {
  customer: [
    ["late", "⏰ Bestelling is te laat", "⏰ Order is late", false],
    ["missing_item", "🥡 Er ontbreekt iets", "🥡 Something is missing", true],
    ["wrong_item", "🔄 Verkeerd item", "🔄 Wrong item", true],
    ["damaged", "💥 Beschadigd of gemorst", "💥 Damaged or spilled", true],
    ["rider_issue", "🛵 Probleem met de bezorger", "🛵 Problem with the rider", false],
    ["payment", "💳 Betaling", "💳 Payment", false],
    ["refund", "💶 Terugbetaling", "💶 Refund", true],
    ["other", "💬 Iets anders", "💬 Something else", false],
  ],
  restaurant: [
    ["order_problem", "🧾 Probleem met een bestelling", "🧾 Problem with an order", false],
    ["rider_problem", "🛵 Probleem met een bezorger", "🛵 Problem with a rider", false],
    ["help", "🙋 Hulp nodig", "🙋 Need help", false],
    ["other", "💬 Iets anders", "💬 Something else", false],
  ],
  rider: [
    ["address_not_found", "📍 Kan het adres niet vinden", "📍 Can't find the address", false],
    ["customer_unreachable", "📵 Klant onbereikbaar", "📵 Customer unreachable", false],
    ["restaurant_delay", "⏳ Restaurant is laat", "⏳ Restaurant delay", false],
    ["accident", "🚑 Ongeval", "🚑 Accident", false],
    ["safety", "🦺 Ik voel me niet veilig", "🦺 I don't feel safe", false],
    ["payout", "💶 Vraag over uitbetaling", "💶 Payout question", false],
    ["other", "💬 Iets anders", "💬 Something else", false],
  ],
};
export const catLabel = (role: SupportRole, key: string) => {
  const c = CATEGORIES[role]?.find((x) => x[0] === key);
  if (key === "sos") return "🚨 SOS";
  if (key === "item_unavailable") return tx("🚫 Item niet beschikbaar", "🚫 Item unavailable");
  return c ? tx(c[1], c[2]) : key;
};
export const statusLabel = (s: string) => s === "open" ? tx("Open: wij kijken ernaar", "Open: we're on it") : s === "waiting_user" ? tx("Antwoord ontvangen", "We replied") : tx("Opgelost", "Resolved");

/** Shrinks a photo on the phone (max 1600 px JPEG) before upload; keeps uploads small and strips EXIF. */
async function shrink(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("toBlob"))), "image/jpeg", 0.82));
  } catch { return file; }
}

export async function uploadPhoto(file: File): Promise<string> {
  const sb = getSupabase(); if (!sb) throw new Error("offline");
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) && file.type !== "") throw new Error(tx("Alleen foto's (JPG, PNG, WEBP)", "Photos only (JPG, PNG, WEBP)"));
  const { data: u } = await sb.auth.getUser();
  const blob = await shrink(file);
  if (blob.size > 5 * 1024 * 1024) throw new Error(tx("Foto is te groot (max 5 MB)", "Photo is too large (max 5 MB)"));
  const path = `${u.user!.id}/${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}.jpg`;
  const { error } = await sb.storage.from("support-photos").upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw new Error(error.message);
  return path;
}

export async function signedPhoto(path: string): Promise<string | null> {
  const { data } = (await getSupabase()?.storage.from("support-photos").createSignedUrl(path, 600)) ?? { data: null };
  return data?.signedUrl ?? null;
}

export async function createTicket(a: { category: string; body: string; order?: number | null; refundCents?: number | null; photo?: File | null; lat?: number; lng?: number }) {
  const sb = getSupabase(); if (!sb) throw new Error("offline");
  const photo = a.photo ? await uploadPhoto(a.photo) : null;
  const { data, error } = await sb.rpc("support_create", { p_category: a.category, p_body: a.body, p_order: a.order ?? null, p_refund_cents: a.refundCents ?? null, p_photo_path: photo, p_lat: a.lat ?? null, p_lng: a.lng ?? null });
  if (error) {
    if (photo) void sb.storage.from("support-photos").remove([photo]); // no orphan photos when the ticket is refused
    throw new Error(error.message || tx("Melding kon niet worden verstuurd", "Report could not be sent"));
  }
  return data as number;
}

export async function reply(ticket: number, body: string, photo?: File | null, internal = false) {
  const sb = getSupabase(); if (!sb) throw new Error("offline");
  const p = photo ? await uploadPhoto(photo) : null;
  const { error } = await sb.rpc("support_reply", { p_ticket: ticket, p_body: body, p_photo_path: p, p_internal: internal });
  if (error) throw new Error(error.message);
}

/** A ticket with its thread, kept live through realtime. */
export function useTicket(id: number | null) {
  const [t, setT] = useState<Ticket | null>(null);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    const sb = getSupabase(); if (!sb || !id) { setLoading(false); return; }
    const [a, b] = await Promise.all([sb.from("support_tickets").select("*").eq("id", id).maybeSingle(), sb.from("support_messages").select("*").eq("ticket_id", id).order("created_at")]);
    setT((a.data as Ticket) ?? null); setMsgs((b.data as Message[]) ?? []); setLoading(false);
  }, [id]);
  useEffect(() => {
    const sb = getSupabase(); if (!sb || !id) return;
    const first = setTimeout(() => void load(), 0);
    const ch = sb.channel(`ticket-${id}-${Math.random().toString(36).slice(2, 7)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages", filter: `ticket_id=eq.${id}` }, () => void load())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "support_tickets", filter: `id=eq.${id}` }, () => void load())
      .subscribe();
    return () => { clearTimeout(first); void sb.removeChannel(ch); };
  }, [id, load]);
  return { t, msgs, loading, reload: load };
}

export function useMyTickets() {
  const [rows, setRows] = useState<Ticket[] | null>(null);
  useEffect(() => {
    const sb = getSupabase(); if (!sb) return;
    let alive = true;
    // Signed-out visitors (e.g. via the Help tab) have no tickets: skip the query instead of getting a 401.
    const load = async () => {
      const { data: s } = await sb.auth.getSession();
      if (!s.session) { if (alive) setRows([]); return; }
      const { data } = await sb.from("support_tickets").select("*").order("last_message_at", { ascending: false }).limit(50);
      if (alive) setRows((data as Ticket[]) ?? []);
    };
    const first = setTimeout(load, 0);
    const ch = sb.channel(`my-tickets-${Math.random().toString(36).slice(2, 7)}`).on("postgres_changes", { event: "*", schema: "public", table: "support_tickets" }, () => void load()).subscribe();
    return () => { alive = false; clearTimeout(first); void sb.removeChannel(ch); };
  }, []);
  return rows;
}
