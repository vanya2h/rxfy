import { Linter } from "eslint";
import { config } from "rxfy-eslint-config/base";

export default [
  ...config,
  {
    ignores: ["dist/**", ".turbo/**", "node_modules/**", "*.tsbuildinfo"],
  },
] satisfies Linter.Config[];
