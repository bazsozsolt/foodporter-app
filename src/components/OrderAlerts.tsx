"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useStore } from "@/lib/store";

const KEY = "foodporter-alerts";
let ctx: AudioContext | null = null;

function beep() {
  try {
    ctx ??= new AudioContext();
    void ctx.resume();
    const t = ctx.currentTime;
    [0, 0.22].forEach((d, i) => {
      const o = ctx!.createOscillator(), g = ctx!.createGain();
      o.type = "sine"; o.frequency.value = i ? 1175 : 880;
      g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.35, t + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.2);
      o.connect(g).connect(ctx!.destination); o.start(t + d); o.stop(t + d + 0.21);
    });
  } catch { /* audio not available */ }
}

async function notify(title: string, body: string) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const opts = { body, icon: (process.env.NEXT_PUBLIC_BASE_PATH ?? "") + "/icons/icon-192.png", tag: title };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, opts); else new Notification(title, opts);
  } catch { try { new Notification(title, opts); } catch { /* ignore */ } }
}

const subs = new Set<() => void>();
const enabled = () => typeof window !== "undefined" && localStorage.getItem(KEY) === "on";

/** Beep + vibrate + system notification whenever a new key shows up (after the first render). */
export function useOrderAlerts(keys: string[], title: string, body: (n: number) => string) {
  const seen = useRef<Set<string> | null>(null);
  const { ready, profile } = useStore();
  const sig = keys.join("|");
  useEffect(() => {
    if (!ready || !profile) return; // baseline only once the user's orders are loaded
    const now = new Set(sig ? sig.split("|") : []);
    if (seen.current === null) { seen.current = now; return; }
    const fresh = [...now].filter((k) => !seen.current!.has(k));
    seen.current = now;
    if (fresh.length === 0 || !enabled()) return;
    beep();
    navigator.vibrate?.([200, 100, 200]);
    void notify(title, body(fresh.length));
    (window as unknown as { __fpAlerts?: number }).__fpAlerts = ((window as unknown as { __fpAlerts?: number }).__fpAlerts ?? 0) + 1;
  }, [sig, title, body, ready, profile]);
}

export function AlertsToggle() {
  const on = useSyncExternalStore((l) => { subs.add(l); return () => { subs.delete(l); }; }, enabled, () => false);
  const [perm, setPerm] = useState<string>(() => (typeof Notification !== "undefined" ? Notification.permission : "default"));
  async function toggle() {
    if (on) localStorage.setItem(KEY, "off");
    else {
      localStorage.setItem(KEY, "on");
      beep(); // unlocks audio on iOS (needs a tap)
      if (typeof Notification !== "undefined" && Notification.permission === "default") setPerm(await Notification.requestPermission());
    }
    subs.forEach((l) => l());
  }
  return (
    <button onClick={toggle} data-testid="alerts-toggle"
      className={`mb-3 w-full rounded-xl border-[1.5px] px-3 py-2 text-sm font-semibold ${on ? "border-ok bg-[#eaf8ef] text-ok" : "border-[#e2ded8] bg-white text-muted"}`}>
      {on ? `🔔 Order alerts on${perm === "denied" ? " (sound only — notifications blocked)" : ""}` : "🔕 Turn on sound + notifications for new orders"}
    </button>
  );
}
