import pluginN from "eslint-plugin-n";
import { Linter } from "eslint";
import { config as baseConfig } from "./base.js";

export const config = [
  ...baseConfig,
  pluginN.configs["flat/recommended"],
  {
    rules: {
      "n/prefer-promises/fs": "error",
      "n/no-path-concat": "error",
    },
  },
] satisfies Linter.Config[];
