import { defineConfig } from "vitest/config";

export default defineConfig({
  // GitHub Pages serves the site under /tezinvaders/; the Pages workflow sets BASE_PATH.
  // Locally the default "/" keeps http://localhost:5173/ working.
  base: process.env.BASE_PATH ?? "/",
  // The Octez Connect SDK still reaches for Node's `global` in a few places.
  define: { global: "globalThis" },
  build: { target: "es2022" },
  test: { environment: "node", include: ["src/**/*.test.ts", "verifier/**/*.test.ts"] },
});
