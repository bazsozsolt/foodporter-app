"use client";
import { tx } from "@/lib/i18n";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Header } from "@/components/ui";
import { TrackingView } from "../orders/[id]/TrackingView";

function OrderById() {
  const id = useSearchParams().get("id") ?? "";
  return <TrackingView id={id} />;
}

/** Canonical tracking URL: /order?id=N (works for any order id, unlike pre-built /orders/N pages). */
export default function OrderPage() {
  return (
    <Suspense fallback={<><Header /><p className="p-6 text-center text-muted">{tx("Laden…", "Loading…")}</p></>}>
      <OrderById />
    </Suspense>
  );
}
