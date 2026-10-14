"use client";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/i18n";

export const TEST_MODE = process.env.NEXT_PUBLIC_TEST_MODE !== "0";

/** Thin sticky banner on every customer/restaurant/rider screen while payments run in Mollie test mode. */
export function TestModeBanner() {
  const path = usePathname();
  const t = useT();
  if (!TEST_MODE || path.startsWith("/admin")) return null;
  return (
    <div data-testid="test-mode-banner" className="sticky top-0 z-30 bg-gold px-3 py-1.5 text-center text-[12px] font-bold leading-tight text-ink print:hidden">
      {t("TESTMODUS: geen echt geld. Kies op de Mollie-pagina ", "TEST MODE: no real money. On the Mollie page choose ")}<u>Paid</u>.{t(" Restaurants met 🧪 zijn testdata.", " Restaurants marked 🧪 are test data.")}
    </div>
  );
}

/** Bigger explanation for the checkout. */
export function TestModeCheckoutNote() {
  const t = useT();
  if (!TEST_MODE) return null;
  return (
    <div data-testid="test-mode-checkout" className="mb-3 rounded-2xl border-2 border-gold bg-gold-soft p-3 text-sm">
      <b>{t("TESTMODUS: er wordt geen echt geld afgeschreven.", "TEST MODE: no real money is charged.")}</b>
      <ol className="mt-1 list-decimal pl-5 text-[13px]">
        <li>{t("Tik op Betalen: je gaat naar de testkassa van Mollie.", "Tap Pay: you go to Mollie's test checkout.")}</li>
        <li>{t("Kies iDEAL en een willekeurige bank (of een kaart), kies dan de status Paid en ga verder.", "Choose iDEAL and any bank (or a card), then select the status Paid and continue.")}</li>
        <li>{t("Je komt hier terug en kunt je (test)bestelling volgen.", "You come back here and can follow your (test) order.")}</li>
      </ol>
      <p className="mt-1 text-[12px] text-muted">{t("Niemand gaat echt koken of bezorgen. Failed of Expired kiezen mag ook als je dat wilt testen.", "Nobody will actually cook or deliver it. Choosing Failed or Expired is fine too if you want to test that.")}</p>
    </div>
  );
}
