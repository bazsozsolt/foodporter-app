"use client";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { useStore } from "@/lib/store";
import { act } from "@/lib/act";
import { useT } from "@/lib/i18n";

/** Floating "Give feedback" button: saves to the feedback table (admin can read it under Admin → Feedback). */
export function FeedbackButton() {
  const path = usePathname();
  const { signedIn } = useStore();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [email, setEmail] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const t = useT();
  if (path.startsWith("/admin")) return null;
  async function send() {
    const sb = getSupabase();
    if (!sb) throw new Error("Feedback needs Supabase");
    const { error } = await sb.from("feedback").insert({
      message: msg.trim(), rating, page: path.slice(0, 200), user_agent: navigator.userAgent.slice(0, 400),
      email: signedIn ? null : email.trim().slice(0, 200) || null,
    });
    if (error) throw new Error(error.message);
    setMsg(""); setRating(null); setOpen(false);
    return true;
  }
  return (
    <>
      <button data-testid="feedback-open" onClick={() => setOpen(true)}
        aria-label={t("Feedback geven", "Give feedback")}
        className="fixed bottom-[76px] right-3 z-40 grid h-11 min-w-11 place-items-center rounded-full bg-ink px-3 text-xs font-bold text-white shadow-lg ring-2 ring-gold print:hidden min-[400px]:bottom-24 min-[400px]:h-auto min-[400px]:py-2"><span className="min-[400px]:hidden">💬</span><span className="hidden min-[400px]:inline">💬 Feedback</span></button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center" onClick={() => setOpen(false)}>
          <div className="w-full max-w-[400px] rounded-2xl bg-white p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-1 font-bold">{t("Feedback geven", "Give feedback")}</h3>
            <p className="mb-2 text-xs text-muted">{t("Wat werkte, wat was onduidelijk, wat ging mis? Dit gaat direct naar het Food Porter-team.", "What worked, what was confusing, what broke? This goes straight to the Food Porter team.")}</p>
            <div className="mb-2 flex gap-1" aria-label={t("Hoe was het?", "How was it?")}>
              {[1, 2, 3, 4, 5].map((n) => <button key={n} aria-label={t(`${n} sterren`, `${n} stars`)} onClick={() => setRating(n)} className={`text-2xl ${rating && n <= rating ? "" : "opacity-30"}`}>★</button>)}
            </div>
            <textarea data-testid="feedback-message" className="mb-2 h-28 w-full rounded-xl border-[1.5px] border-[#e2ded8] p-2.5 text-sm" maxLength={4000}
              placeholder={t("Je feedback…", "Your feedback…")} value={msg} onChange={(e) => setMsg(e.target.value)} />
            {!signedIn && <input className="mb-2 w-full rounded-xl border-[1.5px] border-[#e2ded8] p-2.5 text-sm" type="email" maxLength={200}
              placeholder={t("Je e-mail (optioneel, voor een reactie)", "Your email (optional, if you want a reply)")} value={email} onChange={(e) => setEmail(e.target.value)} />}
            <div className="flex gap-2">
              <button className="flex-1 rounded-xl bg-[#f1ede8] py-2.5 text-sm font-semibold" onClick={() => setOpen(false)}>{t("Annuleren", "Cancel")}</button>
              <button data-testid="feedback-send" disabled={busy || msg.trim().length < 3} className="flex-1 rounded-xl bg-brand py-2.5 text-sm font-bold text-white disabled:opacity-50"
                onClick={async () => { setBusy(true); await act(send(), t("Bedankt voor je feedback!", "Thanks for your feedback!")); setBusy(false); }}>{t("Versturen", "Send")}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
