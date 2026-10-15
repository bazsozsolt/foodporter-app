"use client";
import { MapPinOff } from "lucide-react";
import Link from "next/link";
import { Card, Header } from "@/components/ui";
import { useT } from "@/lib/i18n";

export default function NotFound() {
  const t = useT();
  return (
    <><Header />
      <main id="main" className="p-4" data-testid="not-found"><Card className="text-center">
        <MapPinOff size={40} className="mx-auto text-brand" aria-hidden />
        <h1 className="font-display mt-1 text-2xl">{t("Deze pagina bestaat niet", "This page doesn't exist")}</h1>
        <p className="mt-1 text-sm text-muted">{t("Misschien is de link verlopen of verkeerd gekopieerd.", "The link may have expired or been copied incorrectly.")}</p>
        <Link href="/" className="mt-3 inline-block rounded-2xl bg-brand px-5 py-3 font-bold text-white">{t("Naar de restaurants", "Browse restaurants")}</Link>
      </Card></main></>
  );
}
