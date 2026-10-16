"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { act } from "@/lib/act";
import { tx } from "@/lib/i18n";
import type { Order } from "@/lib/types";

/** Restaurant: an item on this order is out. Opens a ticket for ops (refund suggestion = item value) and can mark it sold out. */
export function ItemUnavailable({ o }: { o: Order }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [line, setLine] = useState<string>("");
  const [soldOut, setSoldOut] = useState(true);
  const [note, setNote] = useState("");
  const lines = o.lines.filter((l) => l.line_id);
  if (lines.length === 0) return null;
  async function send() {
    const id = await act((async () => {
      const { data, error } = await getSupabase()!.rpc("support_item_unavailable", { p_order: Number(o.id), p_order_item: line, p_sold_out: soldOut, p_note: note || null });
      if (error) throw new Error(error.message);
      return data as number;
    })(), tx("Gemeld: ons team regelt het met de klant", "Reported: our team will sort it out with the customer"));
    if (id) { setOpen(false); router.push(`/support/?id=${id}`); }
  }
  return (
    <>
      <button data-testid="item-unavailable" onClick={() => { setLine(lines[0].line_id!); setOpen(true); }} className="min-h-11 rounded-xl border border-line bg-white px-3 py-2 text-sm font-semibold">{tx("Item niet beschikbaar", "Item unavailable")}</button>
      {open && (
        <div role="dialog" aria-modal="true" aria-labelledby="iu-title" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setOpen(false)}>
          <div className="w-full max-w-[420px] rounded-t-3xl bg-paper p-4 pb-8" onClick={(e) => e.stopPropagation()}>
            <h2 id="iu-title" className="font-display text-2xl">{tx("Wat is er op?", "What's out?")} · #{o.id}</h2>
            <div className="mt-2 grid gap-2">
              {lines.map((l) => (
                <label key={l.line_id} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm">
                  <input type="radio" name="iu" checked={line === l.line_id} onChange={() => setLine(l.line_id!)} /> {l.qty}× {l.name}
                </label>
              ))}
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={soldOut} onChange={(e) => setSoldOut(e.target.checked)} /> {tx("Ook als uitverkocht markeren op het menu", "Also mark as sold out on the menu")}</label>
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder={tx("Alternatief of opmerking (optioneel)", "Alternative or note (optional)")} className="rounded-xl border border-line px-3 py-2 text-sm" />
              <p className="text-[12px] text-muted">{tx("Ons team neemt contact op met de klant en regelt een eventuele terugbetaling.", "Our team contacts the customer and handles any refund.")}</p>
              <button data-testid="item-unavailable-send" onClick={send} className="rounded-xl bg-brand px-4 py-3 font-bold text-white">{tx("Melden", "Report")}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
