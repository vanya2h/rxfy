import path from "node:path";
import { defineConfig } from "tsup";
import { config } from "./config.js";

export default defineConfig([
  {
    format: ["cjs", "esm"],
    dts: true,
    outDir: config.distDir,
    entry: {
      index: path.join(config.srcDir, "index.tsx"),
    },
  },
  {
    format: ["cjs", "esm"],
    dts: true,
    outDir: config.distDir,
    entry: {
      next: path.join(config.srcDir, "next/index.ts"),
    },
    external: ["next/navigation"],
    banner: { js: '"use client";' },
  },
]);
