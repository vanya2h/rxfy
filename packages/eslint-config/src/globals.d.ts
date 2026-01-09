// @todo remove when https://github.com/facebook/react/issues/30119 is resolved
// @see also https://github.com/facebook/react/issues/28313

declare module "eslint-plugin-react-hooks" {
  import type { Linter, Rule } from "eslint";

  export const configs: {
    recommended: Linter.Config;
  };

  declare const rules: {
    "rules-of-hooks": Rule.RuleModule;
    "exhaustive-deps": Rule.RuleModule;
  };

  declare const plugin: {
    configs: typeof configs;
    rules: typeof rules;
  };

  export default plugin;
}
