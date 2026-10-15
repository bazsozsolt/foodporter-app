"use client";
import { toast } from "@/components/Toaster";
import { cuisineLabel } from "@/lib/format";
import { useT } from "@/lib/i18n";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, SectionHeader } from "@/components/ui";
import { Clock, LocateFixed, Search, Star } from "lucide-react";
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
    if (!navigator.geolocation) return toast(t("Locatie niet beschikbaar op dit apparaat", "Location not available on this device"));
    toast(t("Locatie zoeken…", "Finding your location…"));
    navigator.geolocation.getCurrentPosition((p) => setHere({ lat: p.coords.latitude, lng: p.coords.longitude, label: t("jouw locatie", "your location") }),
      (e) => toast(e.code === 1 ? t("Locatie geweigerd. Sta locatie toe in je browserinstellingen.", "Location denied. Allow location in your browser settings.") : t("Locatie niet beschikbaar", "Location not available")), { timeout: 8000 });
  }

  const t = useT();
  const chip = (on: boolean) => `min-h-9 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13px] font-semibold ${on ? "border-ink bg-ink text-white" : "border-line bg-white text-ink"}`;
  return (
    <section>
      <div className="relative mb-3"><Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
      <input data-testid="restaurant-search" aria-label={t("Zoeken", "Search")} className="w-full rounded-xl border border-line bg-white py-3 pl-10 pr-3 text-[15px] shadow-[var(--shadow-card)]" placeholder={t("Zoek restaurant of gerecht", "Search restaurants or dishes")}
        value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1" data-testid="cuisine-chips">
        <button className={chip(!cuisine)} aria-pressed={!cuisine} onClick={() => setCuisine(null)}>{t("Alles", "All")}</button>
        {chips.map((c) => <button key={c} aria-pressed={cuisine === c} className={chip(cuisine === c)} onClick={() => setCuisine(cuisine === c ? null : c)}>{cuisineLabel(c)}</button>)}
      </div>
      <SectionHeader action={<span data-testid="result-count" className="text-xs text-muted">{list.length} restaurant{list.length === 1 ? "" : "s"}</span>}>{t("Restaurants bij jou in de buurt", "Restaurants near you")}</SectionHeader>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted">
        <button className={chip(sort === "recommended")} aria-pressed={sort === "recommended"} onClick={() => setSort("recommended")}>{t("Partners eerst", "Partners first")}</button>
        <button className={chip(sort === "distance")} aria-pressed={sort === "distance"} data-testid="sort-distance" onClick={() => (origin ? setSort("distance") : locate())}>{t("Dichtstbij", "Nearest")}{origin ? ` · ${origin.label}` : ""}</button>
        {!origin && <button className="inline-flex min-h-9 items-center gap-1 font-semibold text-brand" onClick={locate}><LocateFixed size={14} aria-hidden />{t("gebruik mijn locatie", "use my location")}</button>}
      </div>
      {list.length === 0 && <p className="text-sm text-muted">{t("Geen restaurants gevonden voor", "No restaurants match")} “{q}”.</p>}
      {list.slice(0, shown).map(({ r, d }, i) => (
        <Link key={r.id} href={`/r?id=${r.id}`} className="mb-4 block overflow-hidden rounded-2xl bg-white shadow-[var(--shadow-card)] ring-1 ring-black/[.04]">
            <Photo src={r.image_url} alt={r.name} emoji={restaurantStyle(r.id).emoji} ratio="16/7" className="w-full text-2xl" sizes="(max-width: 420px) 100vw, 420px" eager={i < 2} />
            <div className="p-3.5">
              <div className="flex items-start justify-between gap-2"><h3 className="truncate text-[16px] font-bold">{r.name}</h3>{(r.rating_count ?? 0) > 0 && <span className="flex shrink-0 items-center gap-1 text-[13px] font-semibold"><Star size={14} className="fill-gold text-gold" aria-hidden />{Number(r.rating_avg).toFixed(1)} <span className="font-normal text-muted">({r.rating_count})</span></span>}</div>
              <div className="text-[13px] text-muted">{cuisineLabel(r.cuisine)} · {r.area}{d != null ? ` · ${d.toFixed(1)} km` : ""}</div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5"><Badge><Clock size={12} aria-hidden />~{r.avg_prep_minutes + 12} min</Badge><Badge>{eur(fee)} {t("bezorging", "delivery")}</Badge>
                {r.is_test ? <Badge tone="warn" className="!font-medium" ><span data-testid="test-label">{t("Testdata · geen partner", "Test data · not a partner")}</span></Badge>
                : <Badge tone="ok"><span data-testid="partner-label">{t("Pilotpartner", "Pilot partner")}</span></Badge>}</div>
            </div>
        </Link>
      ))}
      {shown < list.length && (
        <div ref={sentinel} className="py-2 text-center">
          <button data-testid="show-more" className="min-h-11 rounded-xl border border-line bg-white px-4 py-2 text-sm font-semibold" onClick={more}>{t(`Meer tonen (nog ${list.length - shown})`, `Show more (${list.length - shown} left)`)}</button>
        </div>
      )}
    </section>
  );
}
