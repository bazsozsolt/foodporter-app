"use client";
import { usePathname } from "next/navigation";
import { Fragment, useEffect, type ReactNode } from "react";
import { setCurrentLang, useLang } from "@/lib/i18n";
import { installFreshness } from "@/lib/freshness";
import { unlockAudioOnFirstTap } from "@/components/OrderAlerts";

/** Phone-width column for the apps; wider workspace for the admin back office on desktop. */
export function AppShell({ children }: { children: ReactNode }) {
  const admin = usePathname().startsWith("/admin");
  const lang = useLang();
  setCurrentLang(lang);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  useEffect(() => { installFreshness(); unlockAudioOnFirstTap(); }, []);
  return (
    <div className={`relative mx-auto min-h-screen bg-paper pb-36 shadow-2xl print:max-w-none print:pb-0 print:shadow-none ${admin ? "max-w-6xl" : "max-w-[420px]"}`}>
      <Fragment key={lang}>{children}</Fragment>
    </div>
  );
}
