import fs from "node:fs";
import path from "node:path";

const SKIP_DIRS = new Set(["node_modules", "dist", ".turbo"]);

export type TemplateMeta = { name: string; display: string; description: string };

/** Read every bundled template's `template.json`, keyed by directory name. */
export function listTemplates(templatesRoot: string): TemplateMeta[] {
  if (!fs.existsSync(templatesRoot)) return [];
  return fs
    .readdirSync(templatesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(templatesRoot, entry.name, "template.json")))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => {
      const meta = JSON.parse(fs.readFileSync(path.join(templatesRoot, entry.name, "template.json"), "utf8")) as Omit<
        TemplateMeta,
        "name"
      >;
      return { name: entry.name, ...meta };
    });
}

export function scaffold(options: { templateDir: string; targetDir: string; projectName: string }): void {
  const { templateDir, targetDir, projectName } = options;

  fs.cpSync(templateDir, targetDir, {
    recursive: true,
    filter: (src) => !SKIP_DIRS.has(path.basename(src)) && !src.endsWith(".tsbuildinfo"),
  });
  fs.rmSync(path.join(targetDir, "template.json"), { force: true });

  const gitignore = path.join(targetDir, "_gitignore");
  if (fs.existsSync(gitignore)) fs.renameSync(gitignore, path.join(targetDir, ".gitignore"));

  const pkgPath = path.join(targetDir, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as Record<string, unknown>;
  pkg.name = projectName;
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
}
