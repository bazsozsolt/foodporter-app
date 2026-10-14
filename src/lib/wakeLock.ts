"use client";
import { useEffect, useState } from "react";

type Sentinel = { released: boolean; release: () => Promise<void>; addEventListener: (t: "release", f: () => void) => void };
/**
 * Keeps the phone screen on while `active` (rider online or on a delivery), so the app stays in the foreground and
 * the live location + beep keep working. Re-acquired when the app comes back to the front. No-op where unsupported.
 */
export function useWakeLock(active: boolean): "on" | "off" | "unsupported" {
  const supported = typeof navigator !== "undefined" && "wakeLock" in navigator;
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!active || !supported) return;
    let lock: Sentinel | null = null, dead = false;
    const get = async () => {
      if (document.visibilityState !== "visible" || (lock && !lock.released)) return;
      try {
        lock = await (navigator as unknown as { wakeLock: { request: (t: "screen") => Promise<Sentinel> } }).wakeLock.request("screen");
        if (dead) { void lock.release(); return; }
        setOn(true); lock.addEventListener("release", () => setOn(false));
      } catch { setOn(false); }
    };
    void get();
    const vis = () => { void get(); };
    document.addEventListener("visibilitychange", vis);
    return () => { dead = true; document.removeEventListener("visibilitychange", vis); void lock?.release().catch(() => {}); setOn(false); };
  }, [active, supported]);
  return !supported ? "unsupported" : on ? "on" : "off";
}
