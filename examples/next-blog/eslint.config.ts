import { config } from "@vanya2h/eslint-config/react";
import type { Linter } from "eslint";

export default [
  ...config,
  {
    ignores: ["dist/**", ".turbo/**", "node_modules/**", ".next/**", "next-env.d.ts"],
  },
] satisfies Linter.Config[];
