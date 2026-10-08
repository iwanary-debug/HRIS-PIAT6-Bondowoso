import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

// vite.config.ts is a plain object config now; merge it directly.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      globals: true,
      include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
      setupFiles: ["./src/test/setup.ts"],
    },
  }),
);
