"use client";
import { Suspense } from "react";
import { Header } from "@/components/ui";
import { GroupView } from "./GroupView";

/** Group order: /group?code=ABC234 (static export, so the code is a query param). */
export default function GroupPage() {
  return (
    <Suspense fallback={<><Header /><p className="p-6 text-center text-muted">Loading…</p></>}>
      <GroupView />
    </Suspense>
  );
}
