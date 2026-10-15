"use client";
import Link from "next/link";
import { useT, tx } from "@/lib/i18n";
import { FeedbackButton } from "@/components/FeedbackButton";
import { COMPANY } from "@/lib/company";

export function Footer() {
  const t = useT();
  return (
    <footer className="mt-8 border-t border-line pb-4 pt-5 text-center text-xs text-muted print:hidden">
      <FeedbackButton className="mb-4" />
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
        <Link href="/welcome" className="underline">{t("Over ons", "About")}</Link>
        <Link href="/terms" className="underline">{t("Voorwaarden", "Terms")}</Link>
        <Link href="/privacy" className="underline">Privacy</Link>
        <Link href="/cookies" className="underline">Cookies</Link>
        <Link href="/accessibility" className="underline">{t("Toegankelijkheid", "Accessibility")}</Link>
        <Link href="/rider-info" className="underline">{t("Voor riders", "For riders")}</Link>
      </div>
      <p className="mt-2">Food Porter · {t("Tilburg-pilot", "Tilburg pilot")} · © 2026</p>
      <p className="mt-1" data-testid="company">{COMPANY.name} · KvK {COMPANY.kvk} · {t("btw", "VAT")} {COMPANY.vat} · {COMPANY.address} · {COMPANY.email}</p>
      <p className="mt-1" data-testid="osm-attribution">{tx("Kaarten en testrestaurantdata ©", "Maps and test restaurant data ©")} <a className="underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">{tx("OpenStreetMap-bijdragers", "OpenStreetMap contributors")}</a> (ODbL) · {tx("Adressen", "Addresses")}: PDOK/BAG</p>
    </footer>
  );
}
