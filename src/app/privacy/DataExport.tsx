"use client";
import { tx } from "@/lib/i18n";
import { getSupabase } from "@/lib/supabase";
import { useStore } from "@/lib/store";
import { act } from "@/lib/act";
import { ORDER_COLS } from "@/lib/orders";

export function DataExport() {
  const { profile } = useStore();
  if (!profile) return <p className="text-muted">{tx("Log in om een kopie van je gegevens te downloaden.", "Sign in to download a copy of your data.")}</p>;
  async function run() {
    const sb = getSupabase();
    if (!sb) return;
    const me = profile!.id;
    const [p, o, r, b, e, st, om, la, rs, ws, ra, ps] = await Promise.all([
      sb.from("profiles").select("*").eq("id", profile!.id).maybeSingle(),
      sb.from("orders").select(`${ORDER_COLS}, order_items(*)`).eq("customer_id", profile!.id),
      sb.from("ratings").select("*").eq("customer_id", profile!.id),
      sb.from("bids").select("*").eq("rider_id", profile!.id),
      sb.from("earnings").select("*").eq("rider_id", profile!.id),
      sb.from("support_tickets").select("*, support_messages(*)").eq("created_by", me),
      sb.from("order_messages").select("*").eq("author_id", me),
      sb.from("legal_acceptances").select("*").eq("profile_id", me),
      sb.from("rider_shifts").select("*").eq("rider_id", me),
      sb.from("work_sessions").select("*").eq("rider_id", me),
      sb.from("rider_availability").select("*").eq("rider_id", me),
      sb.from("push_subscriptions").select("id, user_agent, created_at, last_ok_at").eq("profile_id", me),
    ]);
    // v28: every other table a user can read about themselves (GDPR art. 15). Each query is RLS-scoped; a missing table just yields null.
    const own = (t: string, col: string) => sb.from(t).select("*").eq(col, me).then((x) => x.data ?? null);
    const [hr, onb, docs, pay, cred, refc, fb, viol, grp, status] = await Promise.all([
      own("rider_hr", "profile_id"), own("rider_onboarding", "profile_id"), own("rider_documents", "profile_id"), own("payouts", "rider_id"),
      own("customer_credit", "customer_id"), own("referral_codes", "customer_id"), own("feedback", "user_id"), own("work_violations", "rider_id"),
      own("group_members", "user_id"), own("account_status_log", "profile_id"),
    ]);
    const orders = await Promise.all(((o.data ?? []) as { id: number }[]).map(async (x) => ({ ...x, phone: (await sb.rpc("order_phone", { p_order: x.id })).data ?? null })));
    const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), profile: p.data, orders, ratings: r.data, bids: b.data, earnings: e.data, support_tickets: st.data, chat_messages: om.data, legal_acceptances: la.data, rider_shifts: rs.data, work_sessions: ws.data, availability: ra.data, push_devices: ps.data, rider_employment: hr, rider_onboarding: onb, rider_documents: docs, payouts: pay, credit: cred, referral_codes: refc, feedback: fb, work_violations: viol, group_memberships: grp, account_status_log: status }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "foodporter-my-data.json"; a.click();
    return true;
  }
  return <button className="min-h-11 rounded-xl bg-ink px-4 py-2.5 text-sm font-bold text-white" onClick={() => act(run(), tx("Download gestart", "Download started"))} data-testid="data-export">⬇ {tx("Download mijn gegevens (JSON)", "Download my data (JSON)")}</button>;
}

export function DeleteAccount() {
  const { profile } = useStore();
  if (!profile) return null;
  async function run() {
    if (!window.confirm(tx("Weet je het zeker? We verwijderen je account en persoonsgegevens binnen 30 dagen. Gegevens die we wettelijk moeten bewaren (bijv. facturen) blijven geanonimiseerd bewaard.", "Are you sure? We will delete your account and personal data within 30 days. Data we must keep by law (e.g. invoices) is kept anonymised."))) return false;
    const { error } = await getSupabase()!.rpc("fp_request_account_deletion");
    if (error) throw new Error(error.message);
    return true;
  }
  return <button data-testid="delete-account" className="min-h-11 rounded-xl border border-[#c40000] px-4 py-2.5 text-sm font-bold text-[#c40000]" onClick={() => act(run(), tx("Verzoek ontvangen. We nemen binnen 30 dagen contact op.", "Request received. We will follow up within 30 days."))}>{tx("Verwijder mijn account", "Delete my account")}</button>;
}
