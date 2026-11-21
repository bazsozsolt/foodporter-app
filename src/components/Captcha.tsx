"use client";
import { useEffect, useRef, useState } from "react";
import { tx } from "@/lib/i18n";
import { captchaMode, turnstileSiteKey } from "@/lib/captcha";

type Props = { onToken: (token: string | null) => void };

/**
 * Login/sign-up captcha. Hidden when the config flag is off.
 * Turnstile loads from Cloudflare when a site key is present. Mock mode is a labelled checkbox for tests.
 */
export function Captcha({ onToken }: Props) {
  const mode = captchaMode();
  const host = useRef<HTMLDivElement>(null);
  const [checked, setChecked] = useState(false);
  const lang = typeof document !== "undefined" && document.documentElement.lang === "en" ? "en" : "nl";

  useEffect(() => {
    if (mode !== "turnstile") return;
    const key = turnstileSiteKey();
    if (!key || !host.current) return;
    const w = window as unknown as { turnstile?: { render: (el: HTMLElement, opts: Record<string, unknown>) => string; remove: (id: string) => void } };
    let widgetId: string | null = null;
    const render = () => {
      if (!host.current || !w.turnstile) return;
      widgetId = w.turnstile.render(host.current, {
        sitekey: key,
        theme: "light",
        language: lang,
        appearance: "always",
        callback: (t: string) => onToken(t),
        "expired-callback": () => onToken(null),
        "error-callback": () => onToken(null),
      });
    };
    if (w.turnstile) { render(); }
    else {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.onload = render;
      document.head.appendChild(s);
    }
    return () => { if (widgetId && w.turnstile) w.turnstile.remove(widgetId); };
  }, [mode, lang, onToken]);

  if (mode === "off") return null;

  if (mode === "mock") {
    return (
      <label data-testid="captcha" className="mb-3 flex min-h-11 items-center gap-2 rounded-xl border border-line p-3 text-sm">
        <input
          type="checkbox"
          data-testid="captcha-mock"
          checked={checked}
          onChange={(e) => { setChecked(e.target.checked); onToken(e.target.checked ? "mock-ok" : null); }}
        />
        <span>{tx("Ik ben geen robot", "I am not a robot")}</span>
      </label>
    );
  }

  return (
    <div className="mb-3">
      <p className="mb-1 text-xs text-muted">{tx("Bevestig dat je geen robot bent", "Confirm you are not a robot")}</p>
      <div data-testid="captcha" ref={host} />
    </div>
  );
}
