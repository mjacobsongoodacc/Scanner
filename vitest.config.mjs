import { defineConfig } from "vitest/config";

/** Standalone config so Vitest workers never load `vite.config.js` (Kalshi proxy, dev server, polling). */
export default defineConfig({
  test: {
    include: ["src/**/*.test.js"],
  },
});
