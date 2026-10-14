"use client";
/** Web push subscription for this browser. The server picks recipients; we only register/unregister this device. */
import { getSupabase } from "@/lib/supabase";

const FLAG = "foodporter-push";
export const pushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && typeof Notification !== "undefined";
export const pushOn = () => typeof window !== "undefined" && localStorage.getItem(FLAG) === "on";

function keyBytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Subscribe this device (permission must already be granted). Returns true when the server has it. */
export async function enablePush(): Promise<boolean> {
  const sb = getSupabase();
  if (!sb || !pushSupported() || Notification.permission !== "granted") return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const { data: key, error } = await sb.rpc("push_public_key");
    if (error || !key) return false;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key as string) });
    const j = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    if (!j.endpoint || !j.keys?.p256dh || !j.keys.auth) return false;
    const r = await sb.rpc("push_subscribe", { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_user_agent: navigator.userAgent });
    if (r.error) return false;
    localStorage.setItem(FLAG, "on");
    return true;
  } catch { return false; }
}

/** Remove this device (on logout or when alerts are turned off). Never throws. */
export async function disablePush() {
  try {
    localStorage.removeItem(FLAG);
    if (!pushSupported()) return;
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await getSupabase()?.rpc("push_unsubscribe", { p_endpoint: sub.endpoint });
    await sub.unsubscribe();
  } catch { /* ignore */ }
}
