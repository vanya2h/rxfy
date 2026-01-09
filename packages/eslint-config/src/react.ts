import { Linter } from "eslint";
import globals from "globals";
import pluginReactHooks from "eslint-plugin-react-hooks";
import pluginReact from "eslint-plugin-react";
import { config as baseConfig } from "./base.js";

export const config = [
  ...baseConfig,
  {
    ...pluginReact.configs.flat.recommended!,
    languageOptions: {
      ...pluginReact.configs.flat.recommended!.languageOptions,
      globals: {
        ...globals.serviceworker,
        ...globals.browser,
      },
    },
  },
  {
    plugins: {
      "react-hooks": pluginReactHooks,
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      ...pluginReactHooks.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
      // should handled by typescript
      "react/prop-types": "off",
      "react/no-children-prop": "off",
    },
  },
] satisfies Linter.Config[];
