import { config } from "@vanya2h/eslint-config/react";
import type { Linter } from "eslint";

export default [
  ...config,
  {
    ignores: ["dist/**", ".waku/**", ".turbo/**", "node_modules/**"],
  },
] satisfies Linter.Config[];
