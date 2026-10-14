"use client";
import { useEffect, useRef, useState } from "react";
import { distanceKm, geocode, lookup, suggest, type Suggestion } from "@/lib/geo";
import type { Geo } from "@/lib/store";

/** Address input with PDOK suggestions and a live delivery-zone check. */
export function AddressField({ value, onChange, geo, onGeo, center, radiusKm }: {
  value: string; onChange: (v: string) => void; geo: Geo | null; onGeo: (g: Geo | null) => void;
  center: { lat: number; lng: number }; radiusKm: number;
}) {
  const [list, setList] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const picked = useRef(false);
  const toGeo = (p: { lat: number; lng: number; label: string }): Geo => ({ ...p, distance_km: distanceKm(center, p) });

  useEffect(() => {
    if (picked.current) { picked.current = false; return; }
    const t = setTimeout(async () => { try { setList(await suggest(value, center)); } catch { setList([]); } }, 250);
    return () => clearTimeout(t);
  }, [value, center]);

  // Typed (not picked) addresses are geocoded after a pause so the zone check still works.
  useEffect(() => {
    if (geo) return;
    const t = setTimeout(async () => {
      if (value.trim().length < 6) return;
      setChecking(true);
      try { const p = await geocode(value); if (p) onGeo(toGeo(p)); } catch { /* ignore */ }
      setChecking(false);
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, geo]);

  async function pick(s: Suggestion) {
    picked.current = true;
    setOpen(false);
    onChange(s.label);
    setChecking(true);
    try { const p = await lookup(s.id); onGeo(p ? toGeo(p) : null); } catch { onGeo(null); }
    setChecking(false);
  }
  const inZone = geo ? geo.distance_km <= radiusKm : null;
  return (
    <div className="relative">
      <input data-testid="address" className="mb-1 mt-1 w-full rounded-xl border-[1.5px] border-[#e2ded8] p-3" value={value} autoComplete="street-address"
        placeholder="Street + number, Tilburg"
        onChange={(e) => { onChange(e.target.value); onGeo(null); setOpen(true); }} onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)} />
      {open && list.length > 0 && (
        <ul className="absolute z-30 w-full overflow-hidden rounded-xl border border-[#e2ded8] bg-white shadow-lg">
          {list.map((s) => (
            <li key={s.id}><button type="button" className="w-full px-3 py-2.5 text-left text-sm hover:bg-brand-soft" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(s)}>📍 {s.label}</button></li>
          ))}
        </ul>
      )}
      <p data-testid="zone" className={`mb-2.5 text-[13px] ${inZone === false ? "font-semibold text-red-600" : inZone ? "text-ok" : "text-muted"}`}>
        {checking ? "Checking address…"
          : inZone === null ? `We deliver within ${radiusKm} km of central Tilburg.`
          : inZone ? `✓ ${geo!.label} · ${geo!.distance_km.toFixed(1)} km from the centre`
          : `✗ ${geo!.label} is ${geo!.distance_km.toFixed(1)} km away. During the pilot we deliver within ${radiusKm} km of central Tilburg.`}
      </p>
    </div>
  );
}
