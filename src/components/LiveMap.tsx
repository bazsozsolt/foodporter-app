"use client";
import { tx } from "@/lib/i18n";
import dynamic from "next/dynamic";
export type { MapMarker } from "./LiveMapInner";

/** Client-only wrapper (Leaflet needs window). */
export const LiveMap = dynamic(() => import("./LiveMapInner"), {
  ssr: false,
  loading: () => <div className="grid h-[220px] place-items-center rounded-2xl bg-[#eee] text-sm text-muted">{tx("Kaart laden…", "Loading map…")}</div>,
});
