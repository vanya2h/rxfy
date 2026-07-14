import fs from "node:fs";
import path from "node:path";
import * as p from "@clack/prompts";
import { Cli, z } from "incur";
import pc from "picocolors";
import { listTemplates, scaffold } from "./scaffold.js";

/**
 * Build the create-rxfy-app CLI over a bundled templates root.
 * Separated from the bin entry so tests can point it at a fixture root.
 *
 * Humans (TTY) get the interactive clack flow; agents and pipes get a
 * structured envelope with machine-readable error codes instead of prompts.
 */
export function createCli({ templatesRoot, version }: { templatesRoot: string; version?: string }) {
  return Cli.create("create-rxfy-app", {
    version,
    description: "Scaffold a standalone rxfy app from an official template",
    outputPolicy: "agent-only",
    args: z.object({
      projectName: z.string().optional().describe("Directory to create the app in"),
    }),
    options: z.object({
      template: z.string().optional().describe("Template to use (skips the picker)"),
    }),
    alias: { template: "t" },
    output: z.object({
      projectName: z.string().describe("Package name of the scaffolded app"),
      template: z.string().describe("Template the app was scaffolded from"),
      dir: z.string().describe("Absolute path of the scaffolded project"),
    }),
    examples: [
      { args: { projectName: "my-app" }, description: "Scaffold with the interactive template picker" },
      { args: { projectName: "my-app" }, options: { template: "vite" }, description: "Scaffold non-interactively" },
    ],
    hint: "After scaffolding, run `pnpm install` and `pnpm dev` inside the new directory.",
    sync: {
      suggestions: ["scaffold a new rxfy app called my-app"],
    },
    async run(c) {
      const templates = listTemplates(templatesRoot);
      if (templates.length === 0) {
        return c.error({
          code: "NO_TEMPLATES",
          message: "No templates bundled with this build — this is a packaging bug, please report it.",
          retryable: false,
        });
      }

      if (!c.agent) p.intro(pc.cyan("create-rxfy-app"));

      let projectName = c.args.projectName;
      if (!projectName) {
        if (c.agent) {
          return c.error({
            code: "MISSING_PROJECT_NAME",
            message: "A project name is required when running non-interactively.",
            retryable: true,
            cta: {
              description: "Retry with a project name:",
              commands: [{ command: "create-rxfy-app", args: { projectName: "my-rxfy-app" } }],
            },
          });
        }
        const answer = await p.text({
          message: "Project name",
          placeholder: "my-rxfy-app",
          defaultValue: "my-rxfy-app",
        });
        if (p.isCancel(answer)) return c.error({ code: "CANCELLED", message: "Cancelled.", retryable: false });
        projectName = answer;
      }

      const targetDir = path.resolve(process.cwd(), projectName);
      if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0) {
        return c.error({
          code: "DIR_NOT_EMPTY",
          message: `Directory "${projectName}" already exists and is not empty.`,
          retryable: true,
        });
      }

      let templateName = c.options.template;
      if (templateName && !templates.some((t) => t.name === templateName)) {
        return c.error({
          code: "UNKNOWN_TEMPLATE",
          message: `Unknown template "${templateName}". Available: ${templates.map((t) => t.name).join(", ")}`,
          retryable: true,
        });
      }
      if (!templateName) {
        if (templates.length === 1) {
          templateName = templates[0]!.name;
          if (!c.agent) p.log.info(`Using the ${pc.bold(templates[0]!.display)} template.`);
        } else if (c.agent) {
          return c.error({
            code: "MISSING_TEMPLATE",
            message: `--template is required when running non-interactively. Available: ${templates.map((t) => t.name).join(", ")}`,
            retryable: true,
          });
        } else {
          const answer = await p.select({
            message: "Template",
            options: templates.map((t) => ({ value: t.name, label: t.display, hint: t.description })),
          });
          if (p.isCancel(answer)) return c.error({ code: "CANCELLED", message: "Cancelled.", retryable: false });
          templateName = answer;
        }
      }

      scaffold({
        templateDir: path.join(templatesRoot, templateName),
        targetDir,
        projectName: path.basename(targetDir),
      });

      if (!c.agent) {
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

      return { projectName: path.basename(targetDir), template: templateName, dir: targetDir };
    },
  });
}
