"use client";
import { useSyncExternalStore } from "react";

/** Dutch-first UI with an English toggle. Choice is stored per device. */
export type Lang = "nl" | "en";
const KEY = "fp-lang";
const subs = new Set<() => void>();
function get(): Lang {
  try { return localStorage.getItem(KEY) === "en" ? "en" : "nl"; } catch { return "nl"; }
}
export function setLang(l: Lang) {
  try { localStorage.setItem(KEY, l); } catch { /* private mode */ }
  document.documentElement.lang = l;
  subs.forEach((f) => f());
}
export function useLang(): Lang {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, get, () => "nl");
}
/** t("Dutch", "English") picks the string for the current language. */
export function useT() {
  const l = useLang();
  return (nl: string, en: string) => (l === "en" ? en : nl);
}
