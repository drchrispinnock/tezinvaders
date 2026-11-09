import { defineConfig } from "vitest/config";

export default defineConfig({
  // Beacon SDK still reaches for Node's `global` in a few places.
  define: { global: "globalThis" },
  build: { target: "es2022" },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
