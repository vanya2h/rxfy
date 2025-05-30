import { Linter } from "eslint";
import jsEslint from "@eslint/js";
import prettierConfig from "eslint-plugin-prettier/recommended";
import turboPlugin from "eslint-plugin-turbo";
import tsEslint from "typescript-eslint";

export const config = [
  jsEslint.configs.recommended,
  prettierConfig,
  ...(tsEslint.configs.recommended as Linter.Config[]),
  turboPlugin.configs["flat/recommended"] as Linter.Config,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          args: "all",
          argsIgnorePattern: "^_",
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      "@typescript-eslint/no-explicit-any": "off",
      "turbo/no-undeclared-env-vars": "warn",
      "prettier/prettier": "warn",
    },
  },
] satisfies Linter.Config[];
