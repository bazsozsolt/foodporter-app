"use client";
import { useState } from "react";
import { ALLERGENS, allergenLabel } from "@/lib/allergens";
import { act } from "@/lib/act";
import { getSupabase } from "@/lib/supabase";
import { actions } from "@/lib/store";
import { tx as txLang } from "@/lib/i18n";

/** Toggle the 14 allergens of one dish (restaurant staff for their own menu, or admin). Saved immediately. */
export function AllergenEditor({ itemId, value, english = false }: { itemId: string; value: string[]; english?: boolean }) {
  const tx = (nl: string, en: string) => (english ? en : txLang(nl, en));
  const [sel, setSel] = useState<string[]>(value);
  async function toggle(code: string) {
    const next = sel.includes(code) ? sel.filter((c) => c !== code) : [...sel, code];
    setSel(next);
    const ok = await act((async () => { const { error } = await getSupabase()!.from("menu_items").update({ allergens: next }).eq("id", itemId); if (error) throw new Error(error.message); return true; })(), tx("Allergenen opgeslagen", "Allergens saved"));
    if (ok === undefined) setSel(sel); else actions.reloadCatalog();
  }
  return (
    <div className="flex flex-wrap gap-1" data-testid={`allergen-editor-${itemId}`}>
      {ALLERGENS.map(([c]) => (
        <button key={c} type="button" aria-pressed={sel.includes(c)} data-persist onClick={() => void toggle(c)}
          className={`min-h-11 rounded-full border px-2.5 text-[12px] font-semibold ${sel.includes(c) ? "border-warn bg-gold-soft text-warn" : "border-line bg-white text-muted"}`}>{allergenLabel(c, english || txLang("nl", "en") === "en")}</button>
      ))}
    </div>
  );
}
