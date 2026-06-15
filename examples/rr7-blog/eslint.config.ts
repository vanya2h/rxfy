import { config } from "@vanya2h/eslint-config/react";
import type { Linter } from "eslint";

export default [
  ...config,
  {
    ignores: ["build/**", ".react-router/**", ".turbo/**", "node_modules/**"],
  },
] satisfies Linter.Config[];
