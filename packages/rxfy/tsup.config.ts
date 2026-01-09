import path from "node:path";
import { defineConfig } from "tsup";
import { config } from "./config.js";

export default defineConfig({
  format: ["cjs", "esm"],
  dts: true,
  outDir: config.distDir,
  entry: {
    index: path.join(config.srcDir, "index.ts"),
  },
});
