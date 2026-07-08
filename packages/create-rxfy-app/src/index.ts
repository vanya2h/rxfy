#!/usr/bin/env node
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createCli } from "./cli.js";

// dist/index.js sits next to dist/templates (written by scripts/prepare-templates.ts).
const templatesRoot = fileURLToPath(new URL("./templates", import.meta.url));
const { version } = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  version: string;
};

const cli = createCli({ templatesRoot, version });
await cli.serve();

export default cli;
