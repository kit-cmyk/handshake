import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project so a lockfile in a parent directory
  // (e.g. a stray ~/package-lock.json) can't make Turbopack infer the wrong root.
  turbopack: {
    root: import.meta.dirname,
  },
  experimental: {
    serverActions: {
      // The CSV import action (`runImport`) sends every mapped row in a single
      // call, capped at MAX_ROWS = 10000. Wide contact rows push that payload
      // well past the 1 MB default, so size the limit to the app's row cap.
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
