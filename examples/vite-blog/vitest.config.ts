import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Run the two suites sequentially: sync.smoke.test.ts cold-starts several PGlite (wasm)
    // instances, and ssr.smoke.test.ts spawns a production server that also boots PGlite. On a
    // 2-core CI runner, letting them race starves the spawned server past its readiness timeout.
    fileParallelism: false,
  },
});
