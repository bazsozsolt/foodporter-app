import type { MetadataRoute } from "next";

export const dynamic = "force-static";
const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Food Porter · Tilburg",
    short_name: "Food Porter",
    description: "Faster dinner delivery in Tilburg, driven by local riders who choose their own speed.",
    id: `${base}/`,
    start_url: `${base}/`,
    scope: `${base}/`,
    display: "standalone",
    background_color: "#f6f3ef",
    theme_color: "#ff5a1f",
    icons: [
      { src: `${base}/icons/icon-192.png`, sizes: "192x192", type: "image/png" },
      { src: `${base}/icons/icon-512.png`, sizes: "512x512", type: "image/png" },
      { src: `${base}/icons/maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Restaurant orders", url: `${base}/restaurant/` },
      { name: "Rider feed", url: `${base}/rider/` },
    ],
  };
}
