"use client";
import { AlertCircle } from "lucide-react";
import { allergenLabel } from "@/lib/allergens";
import { useLang } from "@/lib/i18n";

/** Allergen line under a dish: what it contains, or that none were declared; seeded test values are flagged. */
export function AllergenInfo({ allergens, test, english }: { allergens?: string[] | null; test?: boolean; english?: boolean }) {
  const lang = useLang();
  const en = english || lang === "en";
  const tx = (nl: string, eng: string) => (en ? eng : nl);
  const a = allergens ?? [];
  return (
    <p data-testid="allergens" className="mt-1 flex flex-wrap items-center gap-1 text-[12px] text-muted">
      <AlertCircle size={12} aria-hidden />
      {a.length ? <>{tx("Bevat", "Contains")}: {a.map((c) => <span key={c} className="rounded bg-gold-soft px-1.5 py-px font-semibold text-warn">{allergenLabel(c, en)}</span>)}</> : <>{tx("Geen allergenen opgegeven", "No allergens declared")}</>}
      {test && <span className="italic">({tx("testwaarden", "test values")})</span>}
    </p>
  );
}
