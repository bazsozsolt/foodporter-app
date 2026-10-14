"use client";
import { tx } from "@/lib/i18n";
import { useEffect, useState } from "react";

interface BIPEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

/** "Install app" banner (Android/desktop Chrome); iOS users get a short hint. */
export function InstallPrompt() {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone;
    if (standalone || localStorage.getItem("fp-install-dismissed")) return;
    const h = (e: Event) => { e.preventDefault(); setEvt(e as BIPEvent); setHidden(false); };
    window.addEventListener("beforeinstallprompt", h);
    const t = setTimeout(() => { if (/iphone|ipad/i.test(navigator.userAgent)) { setIos(true); setHidden(false); } }, 0);
    return () => { window.removeEventListener("beforeinstallprompt", h); clearTimeout(t); };
  }, []);
  if (hidden) return null;
  const close = () => { localStorage.setItem("fp-install-dismissed", "1"); setHidden(true); };
  return (
    <div className="mb-3 flex items-center gap-2 rounded-2xl border-[1.5px] border-[#e2ded8] bg-white p-3 text-sm">
      <span className="flex-1">📲 {ios ? <>{tx("Installeren: tik op", "Install: tap")} <b>{tx("Deel", "Share")}</b> → <b>{tx("Zet op beginscherm", "Add to Home Screen")}</b></> : tx("Installeer Food Porter op je telefoon", "Install Food Porter on your phone")}</span>
      {evt && <button className="rounded-xl bg-brand px-3 py-1.5 font-bold text-white" onClick={async () => { await evt.prompt(); close(); }}>{tx("Installeren", "Install")}</button>}
      <button aria-label={tx("Sluiten", "Dismiss")} className="px-1 text-muted" onClick={close}>✕</button>
    </div>
  );
}
