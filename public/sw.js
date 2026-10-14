// Food Porter service worker: offline shell + fast repeat loads. Never caches API/Supabase/Mollie traffic.
const VERSION = "fp-v7";
const BASE = new URL(self.registration.scope).pathname.replace(/\/$/, "");
const SHELL = [`${BASE}/`, `${BASE}/offline/`, `${BASE}/icons/icon-192.png`];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  if (req.mode === "navigate") {
    // Network first for pages; fall back to the cached page, then the offline page.
    e.respondWith(fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(req, copy));
      return res;
    }).catch(async () => (await caches.match(req)) || (await caches.match(`${BASE}/offline/`))));
    return;
  }
  if (url.pathname.includes("/_next/static/") || url.pathname.includes("/icons/")) {
    // Immutable build assets: cache first.
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(req, copy));
      return res;
    })));
  }
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window" }).then((cs) => (cs[0] ? cs[0].focus() : self.clients.openWindow(`${BASE}/`))));
});
