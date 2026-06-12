import path from "node:path";
import { defineConfig } from "tsup";
import { config } from "./config.js";

export default defineConfig([
  // ESM — both entries in one build with splitting so registry-context lands in a shared
  // chunk, preventing duplicate React context instances when both subpaths are loaded.
  {
    format: ["esm"],
    dts: true,
    splitting: true,
    outDir: config.distDir,
    entry: {
      index: path.join(config.srcDir, "index.tsx"),
      next: path.join(config.srcDir, "next/index.ts"),
    },
    external: ["next/navigation"],
    banner: { js: '"use client";' },
  },
  // CJS — separate entries; splitting does not apply to CJS
  {
    format: ["cjs"],
    dts: false,
    outDir: config.distDir,
    entry: {
      index: path.join(config.srcDir, "index.tsx"),
    },
  },
  {
    format: ["cjs"],
    dts: false,
    outDir: config.distDir,
    entry: {
      next: path.join(config.srcDir, "next/index.ts"),
    },
    external: ["next/navigation"],
    banner: { js: '"use client";' },
  },
]);
