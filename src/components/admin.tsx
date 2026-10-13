"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { preset, type Range } from "@/lib/admin";

const sections = [
  { href: "/admin", label: "📊 Overview" },
  { href: "/admin/orders", label: "🧾 Orders" },
  { href: "/admin/restaurants", label: "🍳 Restaurants" },
  { href: "/admin/riders", label: "🚲 Riders" },
  { href: "/admin/customers", label: "👥 Customers" },
  { href: "/admin/reports", label: "📈 Reports" },
  { href: "/admin/settings", label: "⚙️ Settings" },
];

export function AdminNav() {
  const path = usePathname().replace(/\/$/, "") || "/";
  return (
    <nav className="no-print -mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
      {sections.map((s) => {
        const on = s.href === "/admin" ? path === "/admin" : path.startsWith(s.href);
        return (
          <Link key={s.href} href={s.href}
            className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold ${on ? "bg-ink text-white" : "bg-white text-muted shadow-[0_2px_10px_rgba(0,0,0,.05)]"}`}>
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Panel({ title, actions, children }: { title?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-4 rounded-2xl bg-white p-4 shadow-[0_2px_10px_rgba(0,0,0,.05)] print:shadow-none print:border print:border-[#ddd]">
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-base font-bold">{title}</h2>}
          {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Kpi({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-2xl bg-white p-3 shadow-[0_2px_10px_rgba(0,0,0,.05)] print:border print:border-[#ddd]">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-2xl font-extrabold">{value}</div>
      {hint && <div className="text-[11px] text-muted">{hint}</div>}
    </div>
  );
}

export function SmallBtn({ children, onClick, tone = "ghost", disabled, type = "button" }: { children: ReactNode; onClick?: () => void; tone?: "ghost" | "brand" | "dark" | "ok" | "danger"; disabled?: boolean; type?: "button" | "submit" }) {
  const t = { ghost: "border-[1.5px] border-[#e2ded8] bg-white", brand: "bg-brand text-white", dark: "bg-ink text-white", ok: "bg-ok text-white", danger: "bg-[#d92d20] text-white" }[tone];
  return <button type={type} disabled={disabled} onClick={onClick} className={`rounded-xl px-3 py-1.5 text-sm font-semibold disabled:opacity-50 ${t}`}>{children}</button>;
}

export const inputCls = "w-full rounded-xl border-[1.5px] border-[#e2ded8] bg-white px-3 py-2 text-sm";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-xs text-muted">{label}<div className="mt-1 text-ink">{children}</div></label>;
}

export function Table({ head, children, empty }: { head: string[]; children: ReactNode; empty?: boolean }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead><tr className="border-b border-[#eee] text-xs text-muted">{head.map((h) => <th key={h} className="py-2 pr-3 font-semibold">{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
      {empty && <p className="py-6 text-center text-sm text-muted">Nothing here yet.</p>}
    </div>
  );
}
export const Td = ({ children, className = "" }: { children: ReactNode; className?: string }) => <td className={`border-b border-[#f3f1ee] py-2 pr-3 align-top ${className}`}>{children}</td>;

export function StatusBadge({ s }: { s: string }) {
  const tone: Record<string, string> = {
    active: "bg-[#e3f7ee] text-ok", delivered: "bg-[#e3f7ee] text-ok", resolved: "bg-[#e3f7ee] text-ok", paid: "bg-[#e3f7ee] text-ok",
    pending: "bg-[#fff1ea] text-brand-dark", open: "bg-[#fff1ea] text-brand-dark", awaiting_payment: "bg-[#fff1ea] text-brand-dark",
    suspended: "bg-[#fde8e7] text-[#b42318]", blocked: "bg-[#fde8e7] text-[#b42318]", payment_failed: "bg-[#fde8e7] text-[#b42318]", cancelled: "bg-[#fde8e7] text-[#b42318]",
    critical: "bg-[#fde8e7] text-[#b42318]", high: "bg-[#fde8e7] text-[#b42318]", medium: "bg-[#fff1ea] text-brand-dark", low: "bg-[#f1ede8] text-muted",
  };
  return <span className={`inline-block rounded-lg px-2 py-0.5 text-xs font-bold ${tone[s] ?? "bg-[#f1ede8] text-ink"}`}>{s.replace(/_/g, " ")}</span>;
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
  return <p className="mb-3 rounded-xl bg-[#fde8e7] px-3 py-2 text-sm text-[#b42318]">⚠️ {error}</p>;
}
