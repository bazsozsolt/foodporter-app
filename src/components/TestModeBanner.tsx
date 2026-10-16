"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronDown, FlaskConical } from "lucide-react";
import { useT } from "@/lib/i18n";

const ADMIN_STRIP = "Test mode · no real money"; // admin back office is English-only
export const TEST_MODE = process.env.NEXT_PUBLIC_TEST_MODE !== "0";

const ROLES: { href: string; label: [string, string]; match: (p: string) => boolean }[] = [
  { href: "/", label: ["Klant", "Customer"], match: (p) => !/^\/(restaurant|rider|admin)/.test(p) },
  { href: "/restaurant", label: ["Restaurant", "Restaurant"], match: (p) => p.startsWith("/restaurant") },
  { href: "/rider", label: ["Rider", "Rider"], match: (p) => p.startsWith("/rider") },
  { href: "/admin", label: ["Admin", "Admin"], match: (p) => p.startsWith("/admin") },
];

/** One-line test strip with a small Demo menu (role switcher), kept out of the main flow. */
export function TestModeBanner() {
  const path = usePathname();
  const t = useT();
  const [open, setOpen] = useState(false);
  if (!TEST_MODE) return null;
  return (
    <div data-testid="test-mode-banner" className="relative z-30 flex items-center justify-between gap-2 bg-ink px-3 py-1 text-[11px] text-white/85 print:hidden">
      <span className="flex min-w-0 items-center gap-1.5 truncate"><FlaskConical size={13} className="shrink-0 text-gold" aria-hidden />{path.startsWith("/admin") ? ADMIN_STRIP : t("Testmodus · geen echt geld", "Test mode · no real money")}</span>
      <button data-testid="demo-menu" aria-expanded={open} onClick={() => setOpen(!open)} className="flex min-h-11 items-center gap-1 rounded-full bg-white/10 px-2.5 font-semibold text-white">
        Demo <ChevronDown size={13} aria-hidden />
      </button>
      {open && (
        <nav aria-label={t("Demo: wissel van rol", "Demo: switch role")} className="absolute right-2 top-full mt-1 w-48 overflow-hidden rounded-xl bg-white text-[14px] text-ink shadow-[var(--shadow-pop)] ring-1 ring-black/5">
          <p className="px-3 pb-1 pt-2 text-[11px] text-muted">{t("Wissel van rol om de flow te testen", "Switch role to test the flow")}</p>
          {ROLES.map((r) => (
            <Link key={r.href} href={r.href} onClick={() => setOpen(false)} className={`block px-3 py-2.5 ${r.match(path) ? "bg-brand-soft font-semibold text-brand" : "hover:bg-subtle"}`}>{t(r.label[0], r.label[1])}</Link>
          ))}
        </nav>
      )}
    </div>
  );
}

/** Explanation for the checkout. */
export function TestModeCheckoutNote() {
  const t = useT();
  if (!TEST_MODE) return null;
  return (
    <details data-testid="test-mode-checkout" className="mb-3 rounded-2xl border border-gold bg-gold-soft p-3 text-sm">
      <summary className="cursor-pointer font-semibold">{t("Testmodus: er wordt geen echt geld afgeschreven", "Test mode: no real money is charged")}</summary>
      <ol className="mt-2 list-decimal pl-5 text-[13px]">
        <li>{t("Tik op Betalen: je gaat naar de testkassa van Mollie.", "Tap Pay: you go to Mollie's test checkout.")}</li>
        <li>{t("Kies iDEAL en een willekeurige bank (of een kaart), kies dan de status Paid en ga verder.", "Choose iDEAL and any bank (or a card), then select the status Paid and continue.")}</li>
        <li>{t("Je komt hier terug en kunt je (test)bestelling volgen.", "You come back here and can follow your (test) order.")}</li>
      </ol>
      <p className="mt-1 text-[12px] text-muted">{t("Niemand gaat echt koken of bezorgen. Failed of Expired kiezen mag ook als je dat wilt testen.", "Nobody will actually cook or deliver it. Choosing Failed or Expired is fine too if you want to test that.")}</p>
    </details>
  );
}
