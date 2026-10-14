"use client";
import { tx } from "@/lib/i18n";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useStore } from "@/lib/store";

const KEY = "foodporter-alerts";
let ctx: AudioContext | null = null;

/**
 * Original synthesized "beep-beep" (cartoon style): two short chirps that bend upwards, layered square + triangle
 * oscillators through a compressor so it is loud but not clipped. Generated in code, no audio files.
 */
export function beep() {
  try {
    ctx ??= new AudioContext();
    void ctx.resume();
    const c = ctx, t0 = c.currentTime + 0.02;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -10; comp.ratio.value = 4;
    const master = c.createGain(); master.gain.value = 0.9;
    master.connect(comp).connect(c.destination);
    const chirp = (start: number, f0: number, f1: number) => {
      for (const [type, vol] of [["square", 0.35], ["triangle", 0.6]] as const) {
        const o = c.createOscillator(), g = c.createGain();
        o.type = type;
        o.frequency.setValueAtTime(f0, start);
        o.frequency.exponentialRampToValueAtTime(f1, start + 0.11);   // upward "boing" bend
        o.frequency.exponentialRampToValueAtTime(f1 * 0.97, start + 0.16);
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(vol, start + 0.012);
        g.gain.setValueAtTime(vol, start + 0.12);
        g.gain.exponentialRampToValueAtTime(0.0001, start + 0.17);
        o.connect(g).connect(master);
        o.start(start); o.stop(start + 0.18);
      }
    };
    chirp(t0, 740, 1180);          // "beep"
    chirp(t0 + 0.22, 880, 1480);   // "beep!" (higher)
    (window as unknown as { __fpBeeps?: number }).__fpBeeps = ((window as unknown as { __fpBeeps?: number }).__fpBeeps ?? 0) + 1;
  } catch { /* audio not available */ }
}

export function TestSoundButton() {
  return (
    <button data-testid="test-sound" onClick={() => { beep(); navigator.vibrate?.([120, 80, 120]); }}
      className="mb-3 w-full rounded-xl border-[1.5px] border-[#e2ded8] bg-white px-3 py-2 text-sm font-semibold">🔊 {tx("Testgeluid afspelen", "Test alert sound")}</button>
  );
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
