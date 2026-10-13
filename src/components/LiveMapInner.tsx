"use client";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef } from "react";

export interface MapMarker { id: string; lat: number; lng: number; kind: "rider" | "restaurant" | "dropoff" | "me"; label: string }

const EMOJI: Record<MapMarker["kind"], string> = { rider: "🚲", me: "🚲", restaurant: "🍳", dropoff: "🏠" };
const icon = (k: MapMarker["kind"]) => L.divIcon({
  className: "",
  html: `<div style="font-size:22px;line-height:30px;width:34px;height:34px;text-align:center;border-radius:50%;background:${k === "rider" || k === "me" ? "#ff5a1f" : "#fff"};border:2px solid #1d1b19;box-shadow:0 2px 6px rgba(0,0,0,.3)">${EMOJI[k]}</div>`,
  iconSize: [34, 34], iconAnchor: [17, 17],
});

/** Leaflet + OpenStreetMap tiles. Markers are diffed so realtime updates just move the rider. */
export default function LiveMapInner({ markers, height = 220 }: { markers: MapMarker[]; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef(new Map<string, L.Marker>());
  const fitted = useRef("");
  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([51.5576, 5.0913], 13);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map.current);
    const ls = layers.current;
    return () => { map.current?.remove(); map.current = null; ls.clear(); };
  }, []);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const seen = new Set<string>();
    for (const k of markers) {
      seen.add(k.id);
      const ex = layers.current.get(k.id);
      if (ex) ex.setLatLng([k.lat, k.lng]);
      else layers.current.set(k.id, L.marker([k.lat, k.lng], { icon: icon(k.kind), title: k.label }).bindTooltip(k.label).addTo(m));
    }
    for (const [id, mk] of layers.current) if (!seen.has(id)) { mk.remove(); layers.current.delete(id); }
    // fit once per set of marker ids (not on every rider move)
    const key = markers.map((k) => k.id).sort().join(",");
    if (key && key !== fitted.current) {
      fitted.current = key;
      const b = L.latLngBounds(markers.map((k) => [k.lat, k.lng] as [number, number]));
      if (markers.length === 1) m.setView(b.getCenter(), 15); else m.fitBounds(b.pad(0.25), { maxZoom: 16 });
    }
  }, [markers]);
  return <div ref={el} data-testid="live-map" className="z-0 overflow-hidden rounded-2xl border border-[#e2ded8]" style={{ height }} />;
}
