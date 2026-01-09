import { Linter } from "eslint";
import { config } from "rxfy-eslint-config/react";

export default [
  ...config,
  {
    ignores: ["dist/**", ".turbo/**", "node_modules/**"],
  },
] satisfies Linter.Config[];
