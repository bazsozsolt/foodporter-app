"use client";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Button, Card, Header } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { isChunkError, reloadOnce } from "@/lib/freshness";

/** Friendly fallback instead of a blank screen when a page crashes. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  useEffect(() => { console.error(error); if (isChunkError(error)) reloadOnce("chunk load error"); }, [error]);
  return (
    <><Header />
      <main id="main" className="p-4" data-testid="error-page"><Card className="text-center">
        <AlertTriangle size={40} className="mx-auto text-brand" aria-hidden />
        <h1 className="font-display mt-1 text-2xl">{t("Oeps, er ging iets mis", "Oops, something went wrong")}</h1>
        <p className="mt-1 text-sm text-muted">{t("Je bestelling en betaling zijn veilig. Probeer het opnieuw of ga terug naar de startpagina.", "Your order and payment are safe. Try again or go back home.")}</p>
        <Button onClick={reset}>{t("Opnieuw proberen", "Try again")}</Button>
        <Link href="/" className="mt-3 block text-sm font-semibold text-brand">← {t("Naar de startpagina", "Back home")}</Link>
      </Card></main></>
  );
}
