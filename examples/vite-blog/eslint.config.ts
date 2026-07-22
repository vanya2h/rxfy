import { config } from "@vanya2h/eslint-config/react";
import { Linter } from "eslint";

export default [
  ...config,
  {
    ignores: ["dist/**", ".turbo/**", "node_modules/**", "src/components/ui/**", "src/lib/utils.ts"],
  },
] satisfies Linter.Config[];
