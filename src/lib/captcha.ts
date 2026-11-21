/** Captcha is off until a Turnstile site key exists. Mock mode is for UI tests only. Do not enable Supabase Auth captcha until the secret key is set in the dashboard. */
export type CaptchaMode = "off" | "turnstile" | "mock";

export function captchaMode(): CaptchaMode {
  if (process.env.NEXT_PUBLIC_CAPTCHA_MOCK === "1") return "mock";
  if (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) return "turnstile";
  return "off";
}

export function captchaEnabled(): boolean {
  return captchaMode() !== "off";
}

export function turnstileSiteKey(): string {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
}
