"use client";
/**
 * Keeps an open app (often a phone PWA left in the background) in sync with new deploys.
 * GitHub Pages caches HTML for ~10 minutes and the service worker can still be the old one, so after a deploy a
 * stale page can ask for JS chunks that no longer match. We: register the service worker per build (so every deploy
 * installs a fresh one that takes over at once), check for updates when the app comes back to the foreground, and
 * reload once (guarded) when a chunk fails to load.
 */
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
export const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
const GUARD = "fp-reloaded-at";

export function isChunkError(e: unknown): boolean {
  const s = e instanceof Error ? `${e.name} ${e.message}` : String((e as { message?: string })?.message ?? e ?? "");
  return /ChunkLoadError|Loading (CSS )?chunk|dynamically imported module|Importing a module script failed|error loading dynamically imported|Failed to load chunk/i.test(s);
}

/** Reload at most once per 30 s so a real outage can't cause a reload loop. */
export function reloadOnce(reason: string): boolean {
  try {
    const last = Number(sessionStorage.getItem(GUARD) ?? 0);
    if (Date.now() - last < 30000) return false;
    sessionStorage.setItem(GUARD, String(Date.now()));
  } catch { /* storage blocked: still reload once */ }
  console.warn(`[fp] reloading: ${reason}`);
  location.reload();
  return true;
}

async function newerBuildLive(): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}/version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return false;
    const { build } = (await r.json()) as { build?: string };
    return !!build && build !== BUILD_ID;
  } catch { return false; }
}

let installed = false;
export function installFreshness() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e) => { if (isChunkError(e.error ?? e.message)) reloadOnce("chunk load error"); });
  window.addEventListener("unhandledrejection", (e) => { if (isChunkError(e.reason)) reloadOnce("chunk load error"); });
  if (process.env.NODE_ENV !== "production") return;
  const check = async () => { if (await newerBuildLive()) reloadOnce("new version deployed"); };
  if ("serviceWorker" in navigator) {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register(`${BASE}/sw.js?v=${BUILD_ID}`, { scope: `${BASE}/` })
      .then((reg) => { document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void reg.update().catch(() => {}); }); })
      .catch(() => { /* ignore */ });
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (hadController) void check(); });
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void check(); });
  void check();
}
