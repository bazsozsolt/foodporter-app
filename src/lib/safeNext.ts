/**
 * Post-login `?next=` target. Only a same-origin relative path is returned;
 * protocol-relative URLs, backslashes and control characters (which browsers
 * collapse into `//host`) become "/".
 */
const CONTROL_OR_SLASH = /[\\\u0000-\u001F\u007F]/;
/** Percent-encoded backslash, tab, CR, LF or NUL — a second decode must not revive them. */
const ENCODED_TRICK = /%(?:5c|09|0a|0d|00)/i;

function unsafe(s: string): boolean {
  return s.charAt(0) !== "/" || s.startsWith("//") || CONTROL_OR_SLASH.test(s) || ENCODED_TRICK.test(s);
}

export function safeNext(next: string | null | undefined, origin?: string): string {
  const fallback = "/";
  if (!next) return fallback;
  const base = origin || (typeof window !== "undefined" ? window.location.origin : "http://localhost");
  let decoded = next;
  try { decoded = decodeURIComponent(next); } catch { return fallback; }
  if (unsafe(next) || unsafe(decoded)) return fallback;
  try {
    const u = new URL(decoded, base);
    if (u.origin !== base) return fallback;
    const path = u.pathname + u.search + u.hash;
    if (unsafe(path)) return fallback;
    return path;
  } catch {
    return fallback;
  }
}
