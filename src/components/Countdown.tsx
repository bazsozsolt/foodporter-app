"use client";
import { useEffect, useState } from "react";

/** Seconds left until `iso` (re-renders every second). */
export function useSecondsLeft(iso: string | null | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!iso) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [iso]);
  return iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 1000)) : null;
}
export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
