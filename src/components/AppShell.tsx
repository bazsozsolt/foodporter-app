"use client";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Phone-width column for the apps; wider workspace for the admin back office on desktop. */
export function AppShell({ children }: { children: ReactNode }) {
  const admin = usePathname().startsWith("/admin");
  return (
    <div className={`relative mx-auto min-h-screen bg-paper pb-24 shadow-2xl print:max-w-none print:pb-0 print:shadow-none ${admin ? "max-w-6xl" : "max-w-[420px]"}`}>
      {children}
    </div>
  );
}
