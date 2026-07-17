import type { NextConfig } from "next";
import { createRequire } from "node:module";
import path from "node:path";

// @shadergradient/react (auth background) is ESM-only and its `exports` map
// declares only `import`/`types` — no `default`/`require`. Next resolves client
// components in the server graph too (under the `require` condition), so it
// fails there with "Package path . is not exported". Alias the bare specifier
// straight to the built ESM entry to bypass exports-condition resolution.
// Derive node_modules from a package that always resolves (next) so this holds
// whether deps live in this project or a hoisted parent node_modules.
const require = createRequire(import.meta.url);
const nodeModules = path.dirname(path.dirname(require.resolve("next/package.json")));
const shaderGradientEntry = path.join(
  nodeModules,
  "@shadergradient",
  "react",
  "dist",
  "index.mjs",
);

const nextConfig: NextConfig = {
  // Pin the workspace root to this project so a lockfile in a parent directory
  // (e.g. a stray ~/package-lock.json) can't make Turbopack infer the wrong root.
  turbopack: {
    root: import.meta.dirname,
    resolveAlias: {
      "@shadergradient/react": shaderGradientEntry,
    },
  },
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@shadergradient/react$": shaderGradientEntry,
    };
    return config;
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
