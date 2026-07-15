import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Run suites sequentially: server.smoke.test.ts spawns a Vite dev server, and ssr.smoke.test.ts
    // renders SSR in-process. On a 2-core CI runner, racing them starves the spawned server's
    // startup past its readiness timeout.
    fileParallelism: false,
  },
});
