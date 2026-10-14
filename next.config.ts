import type { NextConfig } from "next";
import fs from "fs";

// Set STATIC_EXPORT=1 (and optionally BASE_PATH) to produce a static preview (e.g. GitHub Pages).
const isExport = process.env.STATIC_EXPORT === "1";
const basePath = process.env.BASE_PATH || "";
// One id per build: the app compares it with /version.json to notice a new deploy, and the service worker URL carries it.
const buildId = process.env.FP_BUILD_ID || new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
process.env.FP_BUILD_ID = buildId;
if (isExport) fs.writeFileSync("public/version.json", JSON.stringify({ build: buildId }) + "\n");

const nextConfig: NextConfig = {
  ...(isExport ? { output: "export", trailingSlash: true, images: { unoptimized: true } } : {}),
  basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath, NEXT_PUBLIC_BUILD_ID: buildId },
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
};

export default nextConfig;
