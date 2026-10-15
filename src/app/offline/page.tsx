"use client";
import { WifiOff } from "lucide-react";
import { tx } from "@/lib/i18n";
import { Card, Header } from "@/components/ui";

export default function Offline() {
  return (
    <>
      <Header />
      <main id="main" className="p-4"><Card className="text-center"><WifiOff size={40} className="mx-auto text-muted" aria-hidden /><h2 className="text-lg font-bold">{tx("Je bent offline", "You’re offline")}</h2><p className="text-sm text-muted">{tx("Food Porter heeft een verbinding nodig om live bestellingen te tonen. We zijn er weer zodra je terug bent.", "Food Porter needs a connection to show live orders. We’ll be right here when you’re back.")}</p></Card></main>
    </>
  );
}
