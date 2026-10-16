"use client";
import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { act } from "@/lib/act";
import { tx, useLang } from "@/lib/i18n";
import { Card, SectionHeader } from "@/components/ui";

type Item = { id: string; name: string; available: boolean; sold_out_until: string | null };
/** Tomorrow 06:00 local: a dish marked "sold out today" comes back on its own the next morning. */
const tomorrow6 = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(6, 0, 0, 0); return d.toISOString(); };

/** Restaurant quick edit: one tap to mark a dish sold out until tomorrow (cron restores it), one tap to bring it back. */
export function SoldOutPanel({ restaurantId }: { restaurantId: string }) {
  const lang = useLang();
  const [items, setItems] = useState<Item[] | null>(null);
  const [rev, setRev] = useState(0);
  useEffect(() => {
    const sb = getSupabase(); if (!sb) return;
    let alive = true;
    void sb.from("menu_items").select("id, name, available, sold_out_until").eq("restaurant_id", restaurantId).order("name")
      .then(({ data }) => { if (alive) setItems((data ?? []) as Item[]); });
    return () => { alive = false; };
  }, [restaurantId, rev]);
  async function set(m: Item, soldOut: boolean) {
    const sb = getSupabase(); if (!sb) return;
    const ok = await act((async () => {
      const { error } = await sb.from("menu_items").update(soldOut ? { available: false, sold_out_until: tomorrow6() } : { available: true, sold_out_until: null }).eq("id", m.id);
      if (error) throw new Error(error.message); return true;
    })(), soldOut ? tx(`${m.name}: uitverkocht tot morgen 06:00`, `${m.name}: sold out until tomorrow 06:00`) : tx(`${m.name} is weer te bestellen`, `${m.name} is back on the menu`));
    if (ok) setRev((r) => r + 1);
  }
  const t = (iso: string) => new Date(iso).toLocaleString(lang === "en" ? "en-GB" : "nl-NL", { weekday: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <section data-testid="sold-out-panel">
      <SectionHeader>{tx("Snel aanpassen: uitverkocht", "Quick edit: sold out")}</SectionHeader>
      <p className="mb-2 text-[13px] text-muted">{tx("Op? Eén tik en klanten kunnen het gerecht tot morgenochtend niet bestellen. Daarna staat het vanzelf weer aan.", "Ran out? One tap and customers can't order the dish until tomorrow morning. It comes back on its own.")}</p>
      {items === null ? <p className="text-[13px] text-muted">{tx("Laden…", "Loading…")}</p> : items.length === 0 ? <p className="text-[13px] text-muted">{tx("Nog geen gerechten.", "No dishes yet.")}</p> : (
        <Card className="!p-2">
          <ul className="divide-y divide-line">{items.map((m) => (
            <li key={m.id} data-testid="sold-out-row" className="flex items-center justify-between gap-2 px-2 py-1">
              <span className="min-w-0"><span className="block truncate text-sm font-semibold">{m.name}</span>
                {!m.available && <span className="text-[12px] text-warn">{m.sold_out_until ? tx(`Uitverkocht tot ${t(m.sold_out_until)}`, `Sold out until ${t(m.sold_out_until)}`) : tx("Niet beschikbaar", "Unavailable")}</span>}</span>
              {m.available
                ? <button type="button" data-testid="sold-out-btn" onClick={() => set(m, true)} className="min-h-11 shrink-0 rounded-xl border border-line bg-white px-3 text-sm font-semibold">{tx("Uitverkocht", "Sold out")}</button>
                : <button type="button" data-testid="back-on-btn" onClick={() => set(m, false)} className="min-h-11 shrink-0 rounded-xl bg-ok px-3 text-sm font-semibold text-white">{tx("Weer aan", "Back on")}</button>}
            </li>))}</ul>
        </Card>
      )}
    </section>
  );
}
