"use client";
import { useEffect, useState } from "react";

export function toast(msg: string) {
  window.dispatchEvent(new CustomEvent("fp-toast", { detail: msg }));
}

export function Toaster() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const h = (e: Event) => { setMsg((e as CustomEvent<string>).detail); clearTimeout(t); t = setTimeout(() => setMsg(null), 2600); };
    window.addEventListener("fp-toast", h);
    return () => window.removeEventListener("fp-toast", h);
  }, []);
  return (
    <div className={`fixed bottom-24 left-1/2 z-50 max-w-[380px] -translate-x-1/2 rounded-xl bg-ink px-4 py-2.5 text-sm text-white transition-opacity ${msg ? "opacity-100" : "pointer-events-none opacity-0"}`}>
      {msg}
    </div>
  );
}
