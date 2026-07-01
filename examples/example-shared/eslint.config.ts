import { config } from "@vanya2h/eslint-config/react";
import { Linter } from "eslint";

export default [
  ...config,
  { ignores: ["dist/**", ".turbo/**", "node_modules/**", "src/ui/**", "src/lib/utils.ts"] },
] satisfies Linter.Config[];
