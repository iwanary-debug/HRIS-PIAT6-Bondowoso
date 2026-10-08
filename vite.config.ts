import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

/**
 * Convex backend URL is resolved at RUNTIME by src/lib/backendUrl.ts:
 * - dev + loopback value -> derived from the page origin (Freebuff
 *   port-subdomain pattern, see scripts/convex-backend.mjs),
 * - anything else / nothing baked -> cloud deployment (non-secret client
 *   config; production deploys do not receive sandbox .env files).
 * Keep this file free of env-dependent define overrides so builds behave
 * identically everywhere.
 */

// Freebuff requires HMR to remain disabled.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",
    hmr: false,
  },
  preview: {
    host: "0.0.0.0",
  },
  build: {
    chunkSizeWarningLimit: 1600,
  },
});
