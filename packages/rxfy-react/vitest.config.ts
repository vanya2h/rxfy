import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // HydrationStream imports next/navigation; next isn't installed (optional peer) — tests use a stub
      "next/navigation": fileURLToPath(new URL("./src/next/next-navigation.stub.ts", import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./testSetup.ts",
  },
});
