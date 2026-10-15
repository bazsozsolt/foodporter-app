"use client";
import { setLang, useLang } from "@/lib/i18n";

export function LangToggle({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const l = useLang();
  return (
    <div className={`flex overflow-hidden rounded-full border text-[11px] font-bold ${tone === "dark" ? "border-white/40" : "border-line"}`} data-testid="lang-toggle">
      {(["nl", "en"] as const).map((x) => (
        <button key={x} onClick={() => setLang(x)} aria-pressed={l === x}
          className={`min-h-8 px-2.5 uppercase ${l === x ? (tone === "dark" ? "bg-white text-brand" : "bg-ink text-white") : tone === "dark" ? "text-white" : "text-muted"}`}>{x}</button>
      ))}
    </div>
  );
}

export function T({ nl, en }: { nl: string; en: string }) {
  return <>{useLang() === "en" ? en : nl}</>;
}
