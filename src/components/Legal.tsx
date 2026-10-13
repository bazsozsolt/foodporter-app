import Link from "next/link";
import type { ReactNode } from "react";
import { Footer } from "./Footer";
import { Card, Header } from "./ui";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <>
      <Header subtitle={title} />
      <main className="p-4">
        <Link href="/" className="text-sm text-muted">← Home</Link>
        <Card className="mt-2.5">
          <h1 className="text-xl font-extrabold">{title}</h1>
          <p className="mb-3 text-xs text-muted">Last updated {updated} · Pilot version: to be reviewed by a lawyer before public launch.</p>
          <div className="legal space-y-3 text-sm leading-relaxed [&_h2]:mt-4 [&_h2]:font-bold [&_li]:ml-4 [&_li]:list-disc">{children}</div>
        </Card>
        <Footer />
      </main>
    </>
  );
}
