"use client";
import { useSyncExternalStore } from "react";
/** Favourite restaurants, kept on this device (no account data, nothing to sync or delete server-side). */
const KEY = "fp-favs";
const subs = new Set<() => void>();
let cache: string | null = null, parsed: string[] = [];
const read = (): string[] => {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(KEY);
  if (raw !== cache) { cache = raw; try { parsed = raw ? (JSON.parse(raw) as string[]) : []; } catch { parsed = []; } }
  return parsed;
};
const EMPTY: string[] = [];
export function useFavourites() {
  return useSyncExternalStore((l) => { subs.add(l); window.addEventListener("storage", l); return () => { subs.delete(l); window.removeEventListener("storage", l); }; }, read, () => EMPTY);
}
export function toggleFavourite(id: string) {
  const cur = read(); const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
  localStorage.setItem(KEY, JSON.stringify(next)); subs.forEach((l) => l());
  return next.includes(id);
}
