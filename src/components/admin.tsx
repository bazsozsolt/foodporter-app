"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BarChart3, Bike, ClipboardList, LayoutDashboard, LifeBuoy, Map, MessageSquare, Receipt, Settings, Store, Users, Wallet, Tag, Scale } from "lucide-react";
import { preset, type Range } from "@/lib/admin";

const groups: { title: string; items: { href: string; label: string; icon: ReactNode }[] }[] = [
  { title: "Operations", items: [
    { href: "/admin", label: "Overview & alerts", icon: <LayoutDashboard size={16} /> },
    { href: "/admin/orders", label: "Live orders", icon: <ClipboardList size={16} /> },
    { href: "/admin/map", label: "Live map", icon: <Map size={16} /> },
  ] },
  { title: "Support", items: [
    { href: "/admin/support", label: "Support inbox", icon: <LifeBuoy size={16} /> },
    { href: "/admin/feedback", label: "Feedback", icon: <MessageSquare size={16} /> },
  ] },
  { title: "Partners", items: [
    { href: "/admin/restaurants", label: "Restaurants", icon: <Store size={16} /> },
    { href: "/admin/riders", label: "Riders", icon: <Bike size={16} /> },
    { href: "/admin/customers", label: "Customers", icon: <Users size={16} /> },
  ] },
  { title: "HR & Legal", items: [
    { href: "/admin/legal", label: "Contracts & onboarding", icon: <Scale size={16} /> },
  ] },
  { title: "Finance", items: [
    { href: "/admin/payments", label: "Payments", icon: <Receipt size={16} /> },
    { href: "/admin/payouts", label: "Rider payouts", icon: <Wallet size={16} /> },
    { href: "/admin/promos", label: "Promo codes", icon: <Tag size={16} /> },
  ] },
  { title: "Reports", items: [
    { href: "/admin/reports", label: "Reports", icon: <BarChart3 size={16} /> },
    { href: "/admin/settings", label: "Settings", icon: <Settings size={16} /> },
  ] },
];

/** Grouped admin navigation: a sidebar on desktop, a scrollable bar on small screens. */
export function AdminNav() {
  const path = usePathname().replace(/\/$/, "") || "/";
  const isOn = (href: string) => {
    const p = href;
    if (p === "/admin") return path === "/admin";
    return path.startsWith(p);
  };
  return (
    <nav aria-label="Admin" className="no-print -mx-4 mb-4 flex gap-4 overflow-x-auto px-4 pb-1 lg:sticky lg:top-4 lg:mx-0 lg:mb-0 lg:block lg:overflow-visible lg:px-0">
      {groups.map((g) => (
        <div key={g.title} className="shrink-0 lg:mb-4">
          <p className="mb-1 px-2 text-[11px] font-bold uppercase tracking-wider text-muted">{g.title}</p>
          <div className="flex gap-1 lg:flex-col">
            {g.items.map((s) => (
              <Link key={s.href} href={s.href} aria-current={isOn(s.href) ? "page" : undefined}
                className={`flex min-h-9 items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm font-medium ${isOn(s.href) ? "bg-ink text-white" : "text-ink hover:bg-white"}`}>
                <span className={isOn(s.href) ? "text-white" : "text-muted"}>{s.icon}</span>{s.label}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function Panel({ title, actions, children }: { title?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-4 rounded-2xl bg-white p-4 shadow-[var(--shadow-card)] ring-1 ring-black/[.04] print:shadow-none print:border print:border-[#ddd]">
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="!font-sans !text-base font-bold !tracking-normal">{title}</h2>}
          {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Kpi({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-2xl bg-white p-3 shadow-[var(--shadow-card)] ring-1 ring-black/[.04] print:border print:border-[#ddd]">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-0.5 text-2xl font-bold tabular-nums">{value}</div>
      {hint && <div className="text-[11px] text-muted">{hint}</div>}
    </div>
  );
}

export function SmallBtn({ children, onClick, tone = "ghost", disabled, type = "button" }: { children: ReactNode; onClick?: () => void; tone?: "ghost" | "brand" | "dark" | "ok" | "danger"; disabled?: boolean; type?: "button" | "submit" }) {
  const t = { ghost: "border border-line bg-white hover:bg-subtle", brand: "bg-brand text-white", dark: "bg-ink text-white", ok: "bg-ok text-white", danger: "bg-[#d92d20] text-white" }[tone];
  return <button type={type} disabled={disabled} onClick={onClick} className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-50 ${t}`}>{children}</button>;
}

export const inputCls = "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-xs text-muted">{label}<div className="mt-1 text-ink">{children}</div></label>;
}

export function Table({ head, children, empty }: { head: string[]; children: ReactNode; empty?: boolean }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4" tabIndex={0} role="region" aria-label={head.join(", ")}>
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-muted">{head.map((h) => <th key={h} className="py-2.5 pr-3 font-semibold">{h}</th>)}</tr></thead>
        <tbody className="[&_tr:hover]:bg-subtle/60">{children}</tbody>
      </table>
      {empty && <p className="py-6 text-center text-sm text-muted">Nothing here yet.</p>}
    </div>
  );
}
export const Td = ({ children, className = "" }: { children: ReactNode; className?: string }) => <td className={`border-b border-line/70 py-2.5 pr-3 align-top ${className}`}>{children}</td>;

export function StatusBadge({ s }: { s: string }) {
  const tone: Record<string, string> = {
    active: "bg-[#e3f7ee] text-ok", delivered: "bg-[#e3f7ee] text-ok", resolved: "bg-[#e3f7ee] text-ok", paid: "bg-[#e3f7ee] text-ok",
    pending: "bg-brand-soft text-brand-dark", open: "bg-brand-soft text-brand-dark", awaiting_payment: "bg-brand-soft text-brand-dark",
    suspended: "bg-[#fde8e7] text-[#b42318]", blocked: "bg-[#fde8e7] text-[#b42318]", payment_failed: "bg-[#fde8e7] text-[#b42318]", cancelled: "bg-[#fde8e7] text-[#b42318]",
    critical: "bg-[#fde8e7] text-[#b42318]", high: "bg-[#fde8e7] text-[#b42318]", medium: "bg-brand-soft text-brand-dark", low: "bg-subtle text-muted",
  };
  return <span className={`inline-block rounded-lg px-2 py-0.5 text-xs font-bold ${tone[s] ?? "bg-subtle text-ink"}`}>{s.replace(/_/g, " ")}</span>;
}

export function RangePicker({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  const presets: [Parameters<typeof preset>[0], string][] = [["today", "Today"], ["7d", "7 days"], ["week", "This week"], ["lastweek", "Last week"], ["30d", "30 days"], ["month", "This month"]];
  return (
    <div className="no-print flex flex-wrap items-end gap-2">
      <Field label="From"><input type="date" className={inputCls} value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} /></Field>
      <Field label="To"><input type="date" className={inputCls} value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} /></Field>
      <div className="flex flex-wrap gap-1.5">
        {presets.map(([k, l]) => <SmallBtn key={k} onClick={() => onChange(preset(k))}>{l}</SmallBtn>)}
      </div>
    </div>
  );
}

export function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return <p className="mb-3 rounded-xl bg-[#fde8e7] px-3 py-2 text-sm text-[#b42318]">{error}</p>;
}
