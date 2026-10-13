"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "🍽️ Customer", match: (p: string) => !p.startsWith("/restaurant") && !p.startsWith("/rider") && !p.startsWith("/admin") },
  { href: "/restaurant", label: "👩‍🍳 Restaurant", match: (p: string) => p.startsWith("/restaurant") },
  { href: "/rider", label: "🚲 Rider", match: (p: string) => p.startsWith("/rider") },
  { href: "/admin", label: "📊 Admin", match: (p: string) => p.startsWith("/admin") },
];

export function RoleNav() {
  const path = usePathname();
  return (
    <nav className="fixed bottom-0 left-1/2 z-40 flex w-full max-w-[420px] -translate-x-1/2 gap-1.5 border-t border-black/5 bg-white p-2">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href}
          className={`flex-1 rounded-xl px-1 py-2.5 text-center text-xs font-semibold ${t.match(path) ? "bg-ink text-white" : "bg-[#f3f1ee] text-muted"}`}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
