import { config } from "@vanya2h/eslint-config/react";
import type { Linter } from "eslint";

export default [
  ...config,
  {
    ignores: ["dist/**", ".waku/**", ".turbo/**", "node_modules/**", "src/pages.gen.ts"],
  },
] satisfies Linter.Config[];
