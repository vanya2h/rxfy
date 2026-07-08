#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { listTemplates, scaffold } from "./scaffold.js";

// dist/index.js sits next to dist/templates (written by scripts/prepare-templates.ts).
const templatesRoot = fileURLToPath(new URL("./templates", import.meta.url));

const USAGE = `Usage: create-rxfy-app [project-name] [--template <name>]

Options:
  -t, --template <name>  Template to use (skips the picker)
  -h, --help             Show this message
`;

function bail(message: string): never {
  p.cancel(message);
  process.exit(1);
}

async function main(): Promise<void> {
  let values: { template?: string; help?: boolean };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args: process.argv.slice(2),
      options: {
        template: { type: "string", short: "t" },
        help: { type: "boolean", short: "h" },
      },
      allowPositionals: true,
    }));
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    console.error(USAGE);
    process.exit(1);
  }

  if (values.help) {
    console.log(USAGE);
    return;
  }

  p.intro(pc.cyan("create-rxfy-app"));

  const templates = listTemplates(templatesRoot);
  if (templates.length === 0) bail("No templates bundled with this build — this is a packaging bug, please report it.");

  let projectName = positionals[0];
  if (!projectName) {
    const answer = await p.text({
      message: "Project name",
      placeholder: "my-rxfy-app",
      defaultValue: "my-rxfy-app",
    });
    if (p.isCancel(answer)) bail("Cancelled.");
    projectName = answer;
  }

  const targetDir = path.resolve(process.cwd(), projectName);
  if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0) {
    bail(`Directory "${projectName}" already exists and is not empty.`);
  }

  let templateName = values.template;
  if (templateName && !templates.some((t) => t.name === templateName)) {
    p.log.warn(`Unknown template "${templateName}". Available: ${templates.map((t) => t.name).join(", ")}`);
    templateName = undefined;
  }
  if (!templateName) {
    if (templates.length === 1) {
      templateName = templates[0]!.name;
      p.log.info(`Using the ${pc.bold(templates[0]!.display)} template.`);
    } else {
      const answer = await p.select({
        message: "Template",
        options: templates.map((t) => ({ value: t.name, label: t.display, hint: t.description })),
      });
      if (p.isCancel(answer)) bail("Cancelled.");
      templateName = answer;
    }
  }

  scaffold({
    templateDir: path.join(templatesRoot, templateName),
    targetDir,
    projectName: path.basename(targetDir),
  });

  p.outro(
    [
      `Scaffolded ${pc.green(path.basename(targetDir))}. Next steps:`,
      "",
      pc.dim(`  cd ${path.relative(process.cwd(), targetDir) || "."}`),
      pc.dim("  pnpm install"),
      pc.dim("  pnpm dev"),
    ].join("\n"),
  );
}

await main();
