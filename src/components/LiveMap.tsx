"use client";
import dynamic from "next/dynamic";
export type { MapMarker } from "./LiveMapInner";

/** Client-only wrapper (Leaflet needs window). */
export const LiveMap = dynamic(() => import("./LiveMapInner"), {
  ssr: false,
  loading: () => <div className="grid h-[220px] place-items-center rounded-2xl bg-[#eee] text-sm text-muted">Loading map…</div>,
});
