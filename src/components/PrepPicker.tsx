"use client";
import { tx } from "@/lib/i18n";
import { useState } from "react";

export const PREP_MIN = 5;
export const PREP_MAX = 120;
const PRESETS = [10, 15, 20, 30];
const clamp = (n: number) => Math.min(PREP_MAX, Math.max(PREP_MIN, Math.round(n)));

/** Preset prep times plus a "Custom" option with a ±5 stepper (5–120 min) for rush hour. */
export function PrepPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [custom, setCustom] = useState(!PRESETS.includes(value));
  const chip = (on: boolean) =>
    `rounded-full border-[1.5px] px-3.5 py-2 font-semibold ${on ? "border-ink bg-ink text-white" : "border-[#e2ded8] bg-white"}`;
  const step = "grid h-12 w-12 place-items-center rounded-2xl bg-[#f1ede8] text-xl font-bold active:scale-95 disabled:opacity-40";
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((m) => (
          <button key={m} className={chip(!custom && value === m)} onClick={() => { setCustom(false); onChange(m); }}>{m} min</button>
        ))}
        <button className={chip(custom)} onClick={() => setCustom(true)}>⏱ {tx("Anders", "Custom")}</button>
      </div>
      {custom && (
        <div className="mt-3 flex items-center justify-between rounded-2xl border-[1.5px] border-[#e2ded8] bg-white p-2">
          <button aria-label={tx("5 minuten minder", "5 minutes less")} className={step} disabled={value <= PREP_MIN} onClick={() => onChange(clamp(value - 5))}>−5</button>
          <label className="flex items-baseline gap-1">
            <input aria-label={tx("Eigen bereidingstijd in minuten", "Custom prep minutes")} type="number" inputMode="numeric" min={PREP_MIN} max={PREP_MAX} step={5}
              className="w-20 bg-transparent text-center text-3xl font-extrabold outline-none"
              value={value} onChange={(e) => onChange(clamp(Number(e.target.value) || PREP_MIN))} />
            <span className="text-muted">min</span>
          </label>
          <button aria-label={tx("5 minuten meer", "5 minutes more")} className={step} disabled={value >= PREP_MAX} onClick={() => onChange(clamp(value + 5))}>+5</button>
        </div>
      )}
    </div>
  );
}
