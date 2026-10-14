import Link from "next/link";
import type { ReactNode } from "react";
import { LangToggle } from "@/components/LangToggle";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Brand header: Zsolt's mark (scooter + route) on a white badge, the yellow FOODPORTER wordmark on red. */
export function Header({ subtitle = "Tilburg Centrum", tagline }: { subtitle?: ReactNode; tagline?: ReactNode }) {
  return (
    <header className="print:hidden rounded-b-3xl bg-gradient-to-br from-brand to-brand-dark px-5 pb-5 pt-4 text-white">
      <div className="flex items-center justify-between gap-3">
        <Link href="/" className="flex min-w-0 items-center gap-2.5" aria-label="Food Porter, home" data-testid="brand-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${BASE}/brand/mark-badge.png`} alt="" width={44} height={44} className="h-12 w-12 shrink-0 rounded-full bg-white p-0.5 shadow" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${BASE}/brand/wordmark.png`} alt="FOODPORTER" width={150} height={25} className="h-[25px] w-auto" />
        </Link>
        <LangToggle />
      </div>
      {tagline && <p className="mt-2 text-[14px] font-semibold leading-snug text-gold" data-testid="tagline">{tagline}</p>}
      <p className="mt-1 text-[13px] opacity-90">{subtitle}</p>
    </header>
  );
}

export function Card({ children, className = "", "data-testid": testId }: { children: ReactNode; className?: string; "data-testid"?: string }) {
  return <div data-testid={testId} className={`mb-3 rounded-2xl ${/(^|\s)bg-/.test(className) ? "" : "bg-white"} p-4 shadow-[0_2px_10px_rgba(0,0,0,.05)] ${className}`}>{children}</div>;
}

type BtnVariant = "brand" | "dark" | "ghost" | "ok";
const variants: Record<BtnVariant, string> = {
  brand: "bg-brand text-white hover:bg-brand-dark",
  dark: "bg-ink text-white",
  ghost: "border-[1.5px] border-[#e2ded8] bg-white text-ink",
  ok: "bg-ok text-white",
};
export function Button({ children, onClick, variant = "brand", disabled }: { children: ReactNode; onClick?: () => void; variant?: BtnVariant; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`mt-2 block w-full rounded-2xl px-4 py-3.5 text-[15px] font-bold disabled:opacity-50 ${variants[variant]}`}>
      {children}
    </button>
  );
}

export function Chips<T extends number | string>({ options, value, onChange, render }: { options: T[]; value: T; onChange: (v: T) => void; render?: (v: T) => string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={String(o)} onClick={() => onChange(o)}
          className={`rounded-full border-[1.5px] px-3.5 py-2 font-semibold ${o === value ? "border-ink bg-ink text-white" : "border-[#e2ded8] bg-white"}`}>
          {render ? render(o) : String(o)}
        </button>
      ))}
    </div>
  );
}

export function Pill({ children, tone = "brand" }: { children: ReactNode; tone?: "brand" | "ok" }) {
  return <span className={`inline-block rounded-lg px-2 py-0.5 text-xs font-bold ${tone === "ok" ? "bg-[#e3f7ee] text-ok" : "bg-brand-soft text-brand"}`}>{children}</span>;
}

export function Empty({ icon, children }: { icon: string; children: ReactNode }) {
  return <div className="px-3 py-10 text-center text-muted [&_a]:underline"><div className="text-3xl">{icon}</div>{children}</div>;
}

export function Stat({ value, label }: { value: string; label: string }) {
  return <div className="flex-1 rounded-2xl bg-white p-3 text-center shadow-[0_2px_10px_rgba(0,0,0,.05)]"><b className="block text-xl">{value}</b><span className="text-xs text-muted">{label}</span></div>;
}
