import { config } from "./dist/base.js";

export default [
  ...config,
  {
    ignores: ["dist/**", ".turbo/**", "node_modules/**"],
  },
];
