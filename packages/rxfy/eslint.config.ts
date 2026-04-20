import { config } from "@vanya2h/eslint-config/base";
import { Linter } from "eslint";

export default [
  ...config,
  {
    ignores: ["dist/**", ".turbo/**", "node_modules/**", "*.tsbuildinfo"],
  },
] satisfies Linter.Config[];
