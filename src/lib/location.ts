"use client";
import { useEffect, useRef, useState } from "react";
import { getSupabase } from "./supabase";

export interface LocPoint { rider_id: string; order_id: number | null; lat: number; lng: number; created_at: string }
const SEND_EVERY_MS = 7000; // 5-10 s window; the DB also drops points faster than 4.5 s

/**
 * Rider side: watch GPS and publish a point every ~7 s while `active` (online or on a job).
 * Stops (and releases the GPS) as soon as `active` turns false, e.g. after delivery when offline.
 */
export function useShareLocation(riderId: string | undefined, active: boolean, orderId: string | null) {
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const last = useRef(0);
  const order = useRef(orderId);
  useEffect(() => { order.current = orderId; }, [orderId]);
  useEffect(() => {
    if (!active || !riderId || typeof navigator === "undefined" || !navigator.geolocation) return;
    const sb = getSupabase();
    let lastPos: GeolocationPosition | null = null;
    const send = () => {
      const pos = lastPos;
      if (!sb || !pos || Date.now() - last.current < SEND_EVERY_MS) return;
      last.current = Date.now();
      void sb.from("rider_locations").insert({
        rider_id: riderId, order_id: order.current ? Number(order.current) : null,
        lat: pos.coords.latitude, lng: pos.coords.longitude,
        accuracy_m: pos.coords.accuracy, heading: pos.coords.heading, speed_mps: pos.coords.speed,
      }).then(({ error: e }) => { if (e) setError(e.message); });
    };
    const id = navigator.geolocation.watchPosition(
      (pos) => { lastPos = pos; setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setError(null); send(); },
      (e) => setError(e.code === 1 ? "Location permission denied — enable it in your browser settings" : e.message),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    // watchPosition is quiet when standing still: keep a heartbeat with the last fix
    const t = setInterval(send, 1000);
    return () => { navigator.geolocation.clearWatch(id); clearInterval(t); };
  }, [active, riderId]);
  return { me: active ? me : null, error: active ? error : null };
}

/** Customer / restaurant / rider: latest rider point for one order, live via Realtime (RLS decides who gets it). */
export function useOrderLocation(orderId: string | null, enabled: boolean) {
  const [pt, setPt] = useState<LocPoint | null>(null);
  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !orderId || !enabled) return;
    let alive = true;
    void sb.from("rider_locations").select("rider_id, order_id, lat, lng, created_at").eq("order_id", Number(orderId))
      .order("created_at", { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => { if (alive && data) setPt(data as LocPoint); });
    const ch = sb.channel(`loc-${orderId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "rider_locations", filter: `order_id=eq.${orderId}` },
        (m) => setPt(m.new as LocPoint))
      .subscribe();
    return () => { alive = false; void sb.removeChannel(ch); };
  }, [orderId, enabled]);
  return enabled ? pt : null;
}

export const navUrl = (to: { lat: number; lng: number }, from?: { lat: number; lng: number } | null) =>
  `https://www.google.com/maps/dir/?api=1${from ? `&origin=${from.lat},${from.lng}` : ""}&destination=${to.lat},${to.lng}&travelmode=bicycling`;
export const osmNavUrl = (to: { lat: number; lng: number }, from?: { lat: number; lng: number } | null) =>
  `https://www.openstreetmap.org/directions?engine=fossgis_osrm_bike&route=${from ? `${from.lat},${from.lng}` : ""};${to.lat},${to.lng}`;
