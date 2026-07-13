import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // storage.test.ts cold-starts a PGlite (wasm Postgres) per test — fast locally but several
    // times slower on CI runners, where the 5s default occasionally times out.
    testTimeout: 30_000,
  },
});
