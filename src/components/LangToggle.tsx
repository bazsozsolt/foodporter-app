"use client";
import { setLang, useLang } from "@/lib/i18n";

export function LangToggle() {
  const l = useLang();
  return (
    <div className="flex overflow-hidden rounded-full border border-white/40 text-[11px] font-bold" data-testid="lang-toggle">
      {(["nl", "en"] as const).map((x) => (
        <button key={x} onClick={() => setLang(x)} aria-pressed={l === x}
          className={`px-2.5 py-1 uppercase ${l === x ? "bg-gold text-brand-dark" : "text-white"}`}>{x}</button>
      ))}
    </div>
  );
}

export function T({ nl, en }: { nl: string; en: string }) {
  return <>{useLang() === "en" ? en : nl}</>;
}
