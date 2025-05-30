import path from "node:path";
import { fileURLToPath } from "node:url";
import pkg from "./package.json";

const currentPath = fileURLToPath(import.meta.url);
const rootDir = path.dirname(currentPath);

export const config = {
  name: pkg.name,
  rootDir: rootDir,
  distDir: path.join(rootDir, "dist"),
  srcDir: path.join(rootDir, "src"),
};
