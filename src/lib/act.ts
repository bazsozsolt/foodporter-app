"use client";
import { toast } from "@/components/Toaster";

/** Run an async action and toast success or the error message. */
export async function act<T>(p: Promise<T>, ok?: string | ((v: T) => string)): Promise<T | undefined> {
  try {
    const v = await p;
    const msg = typeof ok === "function" ? ok(v) : ok;
    if (msg) toast(msg);
    return v;
  } catch (e) {
    toast("⚠️ " + (e instanceof Error ? e.message : String(e)));
    return undefined;
  }
}
