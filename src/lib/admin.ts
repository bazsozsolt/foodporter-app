"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase } from "./supabase";

export type Row = Record<string, unknown>;

/** Run an admin query; returns data, error, loading and a reload function. */
export function useAdminQuery<T>(fn: () => Promise<{ data: T | null; error: { message: string } | null }>, deps: unknown[]) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true });
  const fnRef = useRef(fn);
  useEffect(() => { fnRef.current = fn; });
  const key = JSON.stringify(deps);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(() => fnRef.current(), [key]);
  const reload = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const { data, error } = await run();
      setState({ data, error: error?.message ?? null, loading: false });
    } catch (e) {
      setState({ data: null, error: e instanceof Error ? e.message : String(e), loading: false });
    }
  }, [run]);
  useEffect(() => {
    let alive = true;
    run().then(
      ({ data, error }) => { if (alive) setState({ data, error: error?.message ?? null, loading: false }); },
      (e) => { if (alive) setState({ data: null, error: String(e), loading: false }); },
    );
    return () => { alive = false; };
  }, [run]);
  return { ...state, reload };
}

export const sb = () => {
  const c = getSupabase();
  if (!c) throw new Error("Admin needs Supabase (no keys configured)");
  return c;
};

// ---------- date ranges (local time, half-open [from, to)) ----------
export interface Range { from: string; to: string } // yyyy-mm-dd, inclusive end date in the UI
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export function preset(name: "today" | "7d" | "30d" | "week" | "lastweek" | "month"): Range {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (name === "today") return { from: ymd(d), to: ymd(d) };
  if (name === "7d") return { from: ymd(new Date(d.getTime() - 6 * 864e5)), to: ymd(d) };
  if (name === "30d") return { from: ymd(new Date(d.getTime() - 29 * 864e5)), to: ymd(d) };
  if (name === "month") return { from: ymd(new Date(d.getFullYear(), d.getMonth(), 1)), to: ymd(d) };
  const monday = new Date(d.getTime() - ((d.getDay() + 6) % 7) * 864e5);
  if (name === "week") return { from: ymd(monday), to: ymd(d) };
  const lastMon = new Date(monday.getTime() - 7 * 864e5);
  return { from: ymd(lastMon), to: ymd(new Date(monday.getTime() - 864e5)) };
}
/** Convert UI range to ISO timestamps for RPCs: from 00:00 local to next day 00:00 local. */
export function toIso(r: Range) {
  const [fy, fm, fd] = r.from.split("-").map(Number);
  const [ty, tm, td] = r.to.split("-").map(Number);
  return { p_from: new Date(fy, fm - 1, fd).toISOString(), p_to: new Date(ty, tm - 1, td + 1).toISOString() };
}

// ---------- CSV ----------
export function downloadCsv(filename: string, rows: Row[], columns?: string[]) {
  const cols = columns ?? Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const esc = (v: unknown) => {
    const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export const fmtDateTime = (iso?: unknown) =>
  iso ? new Date(String(iso)).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
