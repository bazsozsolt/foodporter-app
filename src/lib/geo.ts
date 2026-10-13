// Free Dutch geocoder (PDOK Locatieserver, Kadaster). No key needed, CORS enabled.
const PDOK = "https://api.pdok.nl/bzk/locatieserver/search/v3_1";

export interface Suggestion { id: string; label: string }
export interface Point { lat: number; lng: number; label: string }

const stripTest = (q: string) => q.replace(/^FP TEST\s*[:\-–]?\s*/i, "").trim();

function parsePoint(wkt: string | undefined) {
  const m = /POINT\(([\d.]+) ([\d.]+)\)/.exec(wkt ?? "");
  return m ? { lng: Number(m[1]), lat: Number(m[2]) } : null;
}

/** Address suggestions, biased towards the zone centre. */
export async function suggest(q: string, near: { lat: number; lng: number }): Promise<Suggestion[]> {
  const s = stripTest(q);
  if (s.length < 3) return [];
  const r = await fetch(`${PDOK}/suggest?q=${encodeURIComponent(s)}&fq=type:adres&rows=6&lat=${near.lat}&lon=${near.lng}`);
  if (!r.ok) return [];
  const d = await r.json();
  return (d?.response?.docs ?? []).map((x: { id: string; weergavenaam: string }) => ({ id: x.id, label: x.weergavenaam }));
}

export async function lookup(id: string): Promise<Point | null> {
  const r = await fetch(`${PDOK}/lookup?id=${encodeURIComponent(id)}&fl=weergavenaam,centroide_ll`);
  if (!r.ok) return null;
  const d = (await r.json())?.response?.docs?.[0];
  const p = parsePoint(d?.centroide_ll);
  return p ? { ...p, label: d.weergavenaam } : null;
}

/** Free-text geocode (same query the server runs in create-payment). */
export async function geocode(q: string): Promise<Point | null> {
  const s = stripTest(q);
  if (s.length < 4) return null;
  const r = await fetch(`${PDOK}/free?q=${encodeURIComponent(s)}&fq=type:adres&rows=1&fl=weergavenaam,centroide_ll`);
  if (!r.ok) return null;
  const d = (await r.json())?.response?.docs?.[0];
  const p = parsePoint(d?.centroide_ll);
  return p ? { ...p, label: d.weergavenaam } : null;
}

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
