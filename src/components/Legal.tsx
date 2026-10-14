import Link from "next/link";
import type { ReactNode } from "react";
import { Bilingual } from "./Bilingual";
import { Footer } from "./Footer";
import { Card, Header } from "./ui";

/** Legal page with a full Dutch and English version (Dutch first). */
export function LegalPage({ title, updated, nl, en }: { title: [string, string]; updated: [string, string]; nl: ReactNode; en: ReactNode }) {
  const body = "legal space-y-3 text-sm leading-relaxed [&_h2]:mt-4 [&_h2]:font-bold [&_li]:ml-4 [&_li]:list-disc";
  return (
    <>
      <Header subtitle={title[0]} />
      <main className="p-4">
        <Link href="/" className="text-sm text-muted">← Home</Link>
        <Card className="mt-2.5">
          <Bilingual
            nl={<><h1 className="text-xl font-extrabold">{title[0]}</h1><p className="mb-3 text-xs text-muted">Laatst bijgewerkt {updated[0]} · Pilotversie: wordt vóór de publieke lancering door een jurist nagekeken.</p><div className={body}>{nl}</div></>}
            en={<><h1 className="text-xl font-extrabold">{title[1]}</h1><p className="mb-3 text-xs text-muted">Last updated {updated[1]} · Pilot version: to be reviewed by a lawyer before public launch.</p><div className={body}>{en}</div></>} />
        </Card>
        <Footer />
      </main>
    </>
  );
}
