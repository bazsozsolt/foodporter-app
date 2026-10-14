"use client";
import { cuisineLabel } from "@/lib/format";
import { useT } from "@/lib/i18n";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, Pill } from "@/components/ui";
import { restaurantStyle } from "@/lib/mock-data";
import { eur } from "@/lib/format";
import type { Order, Restaurant } from "@/lib/types";
import { Photo } from "@/components/Photo";

const PAGE = 20;
const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Search (name/cuisine/area), cuisine chips, partners first, distance sort, and lazy loading in pages of 20. */
export function RestaurantList({ restaurants, orders, profileId, fee }: { restaurants: Restaurant[]; orders: Order[]; profileId?: string; fee: number }) {
  const [q, setQ] = useState("");
  const [cuisine, setCuisine] = useState<string | null>(null);
  const [sortPref, setSort] = useState<"recommended" | "distance" | null>(null);
  const [page, setPage] = useState({ key: "", n: PAGE });
  const [here, setHere] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  // Known address: the customer's latest order with coordinates
  const last = useMemo(() => [...orders].filter((o) => o.customer_id === profileId && o.lat != null && o.lng != null)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0], [orders, profileId]);
  const origin = useMemo(() => here ?? (last ? { lat: Number(last.lat), lng: Number(last.lng), label: last.address.split(",")[0] } : null), [here, last]);
  const sort = sortPref ?? (origin ? "distance" : "recommended");

  const active = restaurants.filter((r) => r.active);
  const chips = useMemo(() => {
    const n = new Map<string, number>();
    for (const r of active) if (r.cuisine && r.cuisine !== "Restaurant") n.set(r.cuisine, (n.get(r.cuisine) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([c]) => c);
  }, [active]);

  const list = useMemo(() => {
    const t = norm(q.trim());
    const rows = active.filter((r) => (!cuisine || r.cuisine === cuisine) && (!t || norm(`${r.name} ${r.cuisine ?? ""} ${r.area ?? ""}`).includes(t)))
      .map((r) => ({ r, d: origin && r.lat != null && r.lng != null ? km(origin, { lat: Number(r.lat), lng: Number(r.lng) }) : null }));
    rows.sort((a, b) => Number(Boolean(a.r.is_test)) - Number(Boolean(b.r.is_test))
      || (sort === "distance" ? (a.d ?? 1e9) - (b.d ?? 1e9) : (b.r.rating_count ?? 0) - (a.r.rating_count ?? 0) || a.r.name.localeCompare(b.r.name)));
    return rows;
  }, [active, q, cuisine, sort, origin]);

  const key = `${q}|${cuisine}|${sort}`;
  const shown = page.key === key ? page.n : PAGE;
  const more = () => setPage((p) => ({ key, n: (p.key === key ? p.n : PAGE) + PAGE }));
  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((e) => { if (e[0]?.isIntersecting) more(); }, { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [list.length, key]); // eslint-disable-line react-hooks/exhaustive-deps

  function locate() {
    navigator.geolocation?.getCurrentPosition((p) => setHere({ lat: p.coords.latitude, lng: p.coords.longitude, label: t("jouw locatie", "your location") }), () => alert(t("Locatie niet beschikbaar", "Location not available")), { timeout: 8000 });
  }

  const t = useT();
  const chip = (on: boolean) => `whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold ${on ? "border-brand bg-brand text-white" : "border-[#e6dfd7] bg-white text-ink"}`;
  return (
    <section>
      <input data-testid="restaurant-search" className="mb-2 w-full rounded-xl border border-[#e6dfd7] bg-white px-3 py-2.5 text-sm" placeholder={t("Zoek restaurant of keuken (pizza, sushi, kebab…)", "Search restaurants or cuisine (pizza, sushi, kebab…)")}
        value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1" data-testid="cuisine-chips">
        <button className={chip(!cuisine)} onClick={() => setCuisine(null)}>{t("Alles", "All")}</button>
        {chips.map((c) => <button key={c} className={chip(cuisine === c)} onClick={() => setCuisine(cuisine === c ? null : c)}>{cuisineLabel(c)}</button>)}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted">
        <span data-testid="result-count">{list.length} restaurant{list.length === 1 ? "" : "s"}</span>
        <span>·</span>
        <button className={chip(sort === "recommended")} onClick={() => setSort("recommended")}>{t("Partners eerst", "Partners first")}</button>
        <button className={chip(sort === "distance")} data-testid="sort-distance" onClick={() => (origin ? setSort("distance") : locate())}>{t("Dichtstbij", "Nearest")}{origin ? ` · ${origin.label}` : ""}</button>
        {!origin && <button className="font-semibold text-brand underline" onClick={locate}>{t("gebruik mijn locatie", "use my location")}</button>}
      </div>
      {list.length === 0 && <p className="text-sm text-muted">{t("Geen restaurants gevonden voor", "No restaurants match")} “{q}”.</p>}
      {list.slice(0, shown).map(({ r, d }, i) => (
        <Link key={r.id} href={`/r?id=${r.id}`}>
          <Card className="flex items-center gap-3">
            <Photo src={r.image_url} alt={r.name} emoji={restaurantStyle(r.id).emoji} className="w-24 shrink-0 rounded-2xl text-xl" sizes="96px" eager={i < 3} />
            <div className="min-w-0 flex-1">
              <h3 className="font-bold">{r.name}</h3>
              <div className="text-[13px] text-muted">{cuisineLabel(r.cuisine)} · {r.area}{d != null ? ` · ${d.toFixed(1)} km` : ""}</div>
              {r.is_test ? <div className="text-[11px] font-semibold text-[#8a5a00]" data-testid="test-label">🧪 {t("Testdata van OpenStreetMap, geen partner", "Test data from OpenStreetMap, not a partner")}</div>
                : <div className="text-[11px] font-semibold text-emerald-700" data-testid="partner-label">✓ {t("Pilotpartner", "Pilot partner")}</div>}
              <div className="mt-1.5 flex flex-wrap gap-1.5">{(r.rating_count ?? 0) > 0 && <Pill>★ {Number(r.rating_avg).toFixed(1)} ({r.rating_count})</Pill>}<Pill>~{r.avg_prep_minutes + 12} min</Pill><Pill tone="ok">{eur(fee)} {t("bezorging", "delivery")}</Pill></div>
            </div>
          </Card>
        </Link>
      ))}
      {shown < list.length && (
        <div ref={sentinel} className="py-2 text-center">
          <button data-testid="show-more" className="rounded-xl bg-white px-4 py-2 text-sm font-semibold" onClick={more}>{t(`Meer tonen (nog ${list.length - shown})`, `Show more (${list.length - shown} left)`)}</button>
        </div>
      )}
    </section>
  );
}
