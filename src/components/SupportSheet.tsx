"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { tx } from "@/lib/i18n";
import { act } from "@/lib/act";
import { CATEGORIES, catLabel, createTicket, type SupportRole } from "@/lib/support";

const FAQ: [string, string, string, string][] = [
  ["Waar blijft mijn bestelling?", "Where is my order?", "Op de bestelpagina zie je de status en de bezorger live op de kaart. Is hij later dan de beloofde tijd? Meld het hieronder.", "The order page shows the status and the rider live on the map. Later than promised? Report it below."],
  ["Wanneer krijg ik mijn geld terug?", "When do I get my money back?", "Een goedgekeurde terugbetaling zie je binnen 1–3 werkdagen terug op je rekening (iDEAL/kaart).", "An approved refund shows up within 1–3 working days (iDEAL/card)."],
  ["Kan ik mijn bestelling nog annuleren?", "Can I still cancel?", "Zolang het restaurant de bestelling nog niet heeft geaccepteerd, krijg je bij annuleren automatisch alles terug.", "Until the restaurant accepts it, cancelling refunds you in full automatically."],
];

/** "Hulp" sheet: pick an issue, describe it, optional photo, optional refund request. Creates a ticket for the order. */
export function SupportSheet({ role, orderId, orderTotalCents, onClose }: { role: SupportRole; orderId?: number | null; orderTotalCents?: number | null; onClose: () => void }) {
  const router = useRouter();
  const [cat, setCat] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [refund, setRefund] = useState<"none" | "partial" | "full">("none");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const refundable = role === "customer" && !!orderTotalCents && CATEGORIES.customer.find((c) => c[0] === cat)?.[3];
  const euros = Math.round(Number(amount.replace(",", ".")) * 100);
  async function submit() {
    setBusy(true);
    const refundCents = refundable ? (refund === "full" ? orderTotalCents : refund === "partial" && euros > 0 ? euros : null) : null;
    const id = await act(createTicket({ category: cat!, body, order: orderId ?? null, refundCents, photo }), tx("Melding verstuurd, we reageren zo snel mogelijk", "Sent, we'll get back to you as soon as possible"));
    setBusy(false);
    if (id) { onClose(); router.push(`/support/?id=${id}`); }
  }
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="sup-title" data-testid="support-sheet" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-[420px] overflow-y-auto rounded-t-3xl bg-paper p-4 pb-8" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <h2 id="sup-title" className="font-display text-2xl">🛟 {tx("Hulp", "Help")}{orderId ? ` · #${orderId}` : ""}</h2>
          <button onClick={onClose} aria-label={tx("Sluiten", "Close")} className="rounded-full bg-white px-3 py-1 text-lg">✕</button>
        </div>
        {role === "customer" && !cat && (
          <div className="mb-3 space-y-1">
            {FAQ.map(([qn, qe, an, ae]) => (
              <details key={qn} className="rounded-xl bg-white px-3 py-2 text-sm"><summary className="cursor-pointer font-semibold">{tx(qn, qe)}</summary><p className="mt-1 text-muted">{tx(an, ae)}</p></details>
            ))}
          </div>
        )}
        {!cat ? (
          <div className="grid gap-2" data-testid="support-categories">
            <p className="text-sm font-semibold">{tx("Waar kunnen we mee helpen?", "What can we help with?")}</p>
            {CATEGORIES[role].map(([k, nl, en]) => (
              <button key={k} data-testid={`cat-${k}`} onClick={() => setCat(k)} className="rounded-xl border-[1.5px] border-[#e2ded8] bg-white px-3 py-3 text-left text-sm font-semibold">{tx(nl, en)}</button>
            ))}
          </div>
        ) : (
          <div className="grid gap-3">
            <button onClick={() => setCat(null)} className="text-left text-sm font-semibold text-brand">← {catLabel(role, cat)}</button>
            <label className="text-sm font-semibold">{tx("Wat is er gebeurd?", "What happened?")}
              <textarea data-testid="support-body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} rows={4}
                className="mt-1 w-full rounded-xl border-[1.5px] border-[#e2ded8] bg-white p-3 text-sm font-normal" placeholder={tx("Vertel het kort in je eigen woorden", "Tell us briefly in your own words")} />
            </label>
            <label className="text-sm font-semibold">📷 {tx("Foto (optioneel)", "Photo (optional)")}
              <input data-testid="support-photo" type="file" accept="image/*" capture="environment" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-sm font-normal" />
            </label>
            {refundable && (
              <fieldset className="rounded-xl bg-white p-3 text-sm" data-testid="support-refund">
                <legend className="font-semibold">💶 {tx("Wil je geld terug?", "Would you like a refund?")}</legend>
                {(["none", "partial", "full"] as const).map((v) => (
                  <label key={v} className="mr-3 inline-flex items-center gap-1"><input type="radio" name="refund" checked={refund === v} onChange={() => setRefund(v)} />
                    {v === "none" ? tx("Nee", "No") : v === "partial" ? tx("Deels", "Partly") : tx(`Alles (€${(orderTotalCents! / 100).toFixed(2).replace(".", ",")})`, `All (€${(orderTotalCents! / 100).toFixed(2)})`)}</label>
                ))}
                {refund === "partial" && <input data-testid="support-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="€ 0,00" className="mt-2 w-full rounded-xl border-[1.5px] border-[#e2ded8] px-3 py-2" />}
                <p className="mt-1 text-[12px] text-muted">{tx("Ons team beoordeelt je verzoek, meestal binnen een paar uur.", "Our team reviews your request, usually within a few hours.")}</p>
              </fieldset>
            )}
            <button data-testid="support-submit" disabled={busy || body.trim().length < 3 || (refund === "partial" && refundable && !(euros > 0))} onClick={submit}
              className="rounded-xl bg-brand px-4 py-3 font-bold text-white disabled:opacity-50">{busy ? tx("Versturen…", "Sending…") : tx("Versturen", "Send")}</button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Small "Hulp" button that opens the sheet. */
export function HelpButton({ role, orderId, orderTotalCents, label }: { role: SupportRole; orderId?: number | null; orderTotalCents?: number | null; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button data-testid="help-button" onClick={() => setOpen(true)} className="rounded-xl border-[1.5px] border-[#e2ded8] bg-white px-3 py-2 text-sm font-semibold">🛟 {label ?? tx("Hulp", "Help")}</button>
      {open && <SupportSheet role={role} orderId={orderId} orderTotalCents={orderTotalCents} onClose={() => setOpen(false)} />}
    </>
  );
}
