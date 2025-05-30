import { config } from "./code/packages/eslint-config/node.js";

/** @type {import("eslint").Linter.Config} */
export default [
  ...config,
  { 
    ignores: ["./vault"],
  },
];
