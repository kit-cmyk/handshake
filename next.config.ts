import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
