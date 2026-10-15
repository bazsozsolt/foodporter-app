"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bike, ClipboardList, Home, LifeBuoy, Users, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { useT } from "@/lib/i18n";
import { useStore } from "@/lib/store";

type Tab = { href: string; label: [string, string]; icon: ReactNode; match: (p: string) => boolean; testid?: string };
const CUSTOMER: Tab[] = [
  { href: "/", label: ["Home", "Home"], icon: <Home size={22} />, match: (p) => p === "/" || p.startsWith("/r") || p.startsWith("/cart") || p.startsWith("/checkout") },
  { href: "/my-orders", label: ["Bestellingen", "Orders"], icon: <ClipboardList size={22} />, match: (p) => p.startsWith("/my-orders") || p.startsWith("/order") },
  { href: "/group", label: ["Samen", "Together"], icon: <Users size={22} />, match: (p) => p.startsWith("/group") },
  { href: "/support", label: ["Hulp", "Help"], icon: <LifeBuoy size={22} />, match: (p) => p.startsWith("/support") },
];
const RIDER: Tab[] = [
  { href: "/rider", label: ["Opdrachten", "Jobs"], icon: <Bike size={22} />, match: (p) => p === "/rider" || p === "/rider/" },
  { href: "/rider/earnings", label: ["Uren & loon", "Hours & pay"], icon: <Wallet size={22} />, match: (p) => p.startsWith("/rider/earnings") },
  { href: "/support", label: ["Hulp", "Help"], icon: <LifeBuoy size={22} />, match: (p) => p.startsWith("/support") },
];
const HIDE = /^\/(login|welcome|privacy|terms|cookies|offline)/;

/** Role-aware bottom tab bar (customer and rider apps). Restaurant and admin use in-page navigation. The old
 *  role switcher lives in the Demo menu of the test strip (TestModeBanner). */
export function RoleNav() {
  const path = usePathname();
  const t = useT();
  const role = useStore().profile?.role;
  if (path.startsWith("/admin") || path.startsWith("/restaurant") || HIDE.test(path)) return null;
  const tabs = path.startsWith("/rider") || (path.startsWith("/support") && role === "rider") ? RIDER : CUSTOMER;
  return (
    <nav aria-label={t("Hoofdmenu", "Main menu")} data-testid="tabbar" className="print:hidden fixed bottom-0 left-1/2 z-40 flex w-full max-w-[420px] -translate-x-1/2 border-t border-line bg-white/95 px-2 pb-[max(env(safe-area-inset-bottom),6px)] pt-1.5 backdrop-blur">
      {tabs.map((x) => {
        const on = x.match(path);
        return (
          <Link key={x.href} href={x.href} aria-current={on ? "page" : undefined}
            className={`flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-semibold ${on ? "text-brand" : "text-muted"}`}>
            {x.icon}{t(x.label[0], x.label[1])}
          </Link>
        );
      })}
    </nav>
  );
}
