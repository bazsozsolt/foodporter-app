import type { NextConfig } from "next";

// Set STATIC_EXPORT=1 (and optionally BASE_PATH) to produce a static preview (e.g. GitHub Pages).
const isExport = process.env.STATIC_EXPORT === "1";
const basePath = process.env.BASE_PATH || "";

const nextConfig: NextConfig = {
  ...(isExport ? { output: "export", trailingSlash: true, images: { unoptimized: true } } : {}),
  basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
};

export default nextConfig;
