import { config } from "@vanya2h/eslint-config/react";
import { Linter } from "eslint";

export default [
  ...config,
  {
    ignores: ["dist/**", ".turbo/**", "node_modules/**"],
  },
] satisfies Linter.Config[];
