import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight, X } from "lucide-react";
import { LangToggle } from "@/components/LangToggle";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Design tokens in Tailwind terms (v15). Red is the accent; surfaces are white on a neutral canvas. */
export const tok = {
  card: "rounded-2xl bg-white shadow-[var(--shadow-card)] ring-1 ring-black/[.04]",
  input: "w-full rounded-xl border border-line bg-white px-3 py-2.5 text-[15px] placeholder:text-muted/80 focus:border-brand focus:outline-none",
  tap: "min-h-11",
};

/** Slim brand header: mark + wordmark on red, an optional one-line subtitle and an optional right-hand slot. */
export function Header({ subtitle, tagline, right }: { subtitle?: ReactNode; tagline?: ReactNode; right?: ReactNode }) {
  return (
    <header className="print:hidden border-b-[3px] border-gold bg-white px-4 pb-3 pt-3 text-ink">
      <div className="flex items-center justify-between gap-3">
        <Link href="/" className="flex min-w-0 items-center gap-2" aria-label="Food Porter, home" data-testid="brand-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${BASE}/brand/mark-badge.png`} alt="" width={36} height={36} className="h-9 w-9 shrink-0" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${BASE}/brand/wordmark-red.png`} alt="FOODPORTER" width={120} height={20} className="h-5 w-auto" />
        </Link>
        <div className="flex items-center gap-2">{right}<LangToggle tone="light" /></div>
      </div>
      {tagline && <p className="mt-2 text-[14px] font-semibold leading-snug text-brand" data-testid="tagline">{tagline}</p>}
      {subtitle && <p className="mt-1 truncate text-[13px] text-muted">{subtitle}</p>}
    </header>
  );
}

export function Card({ children, className = "", "data-testid": testId }: { children: ReactNode; className?: string; "data-testid"?: string }) {
  return <div data-testid={testId} className={`mb-3 rounded-2xl ${/(^|\s)bg-/.test(className) ? "" : "bg-white"} p-4 shadow-[var(--shadow-card)] ring-1 ring-black/[.04] ${className}`}>{children}</div>;
}

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "brand" | "dark" | "ok";
export const btn: Record<BtnVariant, string> = {
  primary: "bg-brand text-white hover:bg-brand-dark",
  brand: "bg-brand text-white hover:bg-brand-dark",
  secondary: "border border-line bg-white text-ink hover:bg-subtle",
  ghost: "border border-line bg-white text-ink hover:bg-subtle",
  danger: "bg-danger text-white hover:brightness-95",
  dark: "bg-ink text-white hover:bg-black",
  ok: "bg-ok text-white hover:brightness-95",
};
export const btnBase = "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";
export function Button({ children, onClick, variant = "primary", disabled, size = "lg", className = "", icon, "data-testid": testId, type = "button", "data-persist": persist }: {
  children: ReactNode; onClick?: () => void; variant?: BtnVariant; disabled?: boolean; size?: "sm" | "md" | "lg"; className?: string; icon?: ReactNode; "data-testid"?: string; type?: "button" | "submit"; "data-persist"?: boolean;
}) {
  const sz = size === "sm" ? "px-3 py-2 text-sm" : size === "md" ? "px-4 py-2.5 text-[15px]" : "mt-2 w-full px-4 py-3.5 text-[15px]";
  return (
    <button type={type} data-testid={testId} data-persist={persist ? "" : undefined} onClick={onClick} disabled={disabled} className={`${btnBase} ${sz} ${btn[variant]} ${className}`}>
      {icon}{children}
    </button>
  );
}

export function Chips<T extends number | string>({ options, value, onChange, render }: { options: T[]; value: T; onChange: (v: T) => void; render?: (v: T) => string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={String(o)} onClick={() => onChange(o)} aria-pressed={o === value}
          className={`min-h-11 rounded-full border px-4 py-2 font-semibold ${o === value ? "border-ink bg-ink text-white" : "border-line bg-white"}`}>
          {render ? render(o) : String(o)}
        </button>
      ))}
    </div>
  );
}

type Tone = "brand" | "ok" | "neutral" | "warn" | "danger";
const tones: Record<Tone, string> = {
  brand: "bg-brand-soft text-brand", ok: "bg-[#e3f7ee] text-ok", neutral: "bg-subtle text-muted", warn: "bg-gold-soft text-warn", danger: "bg-[#fde8e7] text-danger",
};
export function Badge({ children, tone = "neutral", className = "" }: { children: ReactNode; tone?: Tone; className?: string }) {
  return <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${tones[tone]} ${className}`}>{children}</span>;
}
export function Pill({ children, tone = "brand" }: { children: ReactNode; tone?: Tone }) {
  return <Badge tone={tone}>{children}</Badge>;
}

/** Section header: small caps label with an optional action on the right. */
export function SectionHeader({ children, action, className = "" }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return <div className={`mb-2 mt-5 flex items-center justify-between gap-2 ${className}`}><h2 className="t-label !font-sans !text-[12px] !tracking-[.06em]">{children}</h2>{action}</div>;
}

/** Tappable list row: icon, title, optional meta, chevron. */
export function ListRow({ href, onClick, icon, title, meta, right, "data-testid": testId }: { href?: string; onClick?: () => void; icon?: ReactNode; title: ReactNode; meta?: ReactNode; right?: ReactNode; "data-testid"?: string }) {
  const inner = (<>
    {icon && <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-subtle text-ink">{icon}</span>}
    <span className="min-w-0 flex-1 text-left"><span className="block truncate text-[15px] font-semibold">{title}</span>{meta && <span className="block truncate text-[13px] text-muted">{meta}</span>}</span>
    {right ?? <ChevronRight size={18} className="shrink-0 text-muted" aria-hidden />}
  </>);
  const cls = "flex min-h-14 w-full items-center gap-3 px-4 py-2.5 hover:bg-subtle";
  return href ? <Link data-testid={testId} href={href} className={cls}>{inner}</Link> : <button data-testid={testId} onClick={onClick} className={cls}>{inner}</button>;
}

/** Bottom sheet (mobile) / centred dialog (desktop). */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-modal className="max-h-[90vh] w-full max-w-[420px] overflow-y-auto rounded-t-3xl bg-white p-5 shadow-[var(--shadow-pop)] sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between"><h3 className="text-lg font-bold">{title}</h3><button aria-label="Close" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-subtle"><X size={18} /></button></div>
        {children}
      </div>
    </div>
  );
}

export function Empty({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <div className="px-3 py-10 text-center text-muted [&_a]:underline"><div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-subtle text-2xl text-muted">{icon}</div>{children}</div>;
}

export function Stat({ value, label }: { value: string; label: string }) {
  return <div className="flex-1 rounded-2xl bg-white p-3 text-center shadow-[var(--shadow-card)] ring-1 ring-black/[.04]"><b className="block text-xl">{value}</b><span className="text-xs text-muted">{label}</span></div>;
}
