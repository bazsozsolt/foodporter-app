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
    const [p, o, r, b, e] = await Promise.all([
      sb.from("profiles").select("*").eq("id", profile!.id).maybeSingle(),
      sb.from("orders").select(`${ORDER_COLS}, order_items(*)`).eq("customer_id", profile!.id),
      sb.from("ratings").select("*").eq("customer_id", profile!.id),
      sb.from("bids").select("*").eq("rider_id", profile!.id),
      sb.from("earnings").select("*").eq("rider_id", profile!.id),
    ]);
    const orders = await Promise.all(((o.data ?? []) as { id: number }[]).map(async (x) => ({ ...x, phone: (await sb.rpc("order_phone", { p_order: x.id })).data ?? null })));
    const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), profile: p.data, orders, ratings: r.data, bids: b.data, earnings: e.data }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "foodporter-my-data.json"; a.click();
    return true;
  }
  return <button className="rounded-xl bg-ink px-4 py-2.5 text-sm font-bold text-white" onClick={() => act(run(), "Download started")}>⬇ Download my data (JSON)</button>;
}
