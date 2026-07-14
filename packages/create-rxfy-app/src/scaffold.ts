import fs from "node:fs";
import path from "node:path";

const SKIP_DIRS = new Set(["node_modules", "dist", ".turbo", ".next"]);
const SKIP_FILES = new Set(["next-env.d.ts"]);

export type TemplateMeta = { name: string; display: string; description: string; order?: number };

/** Read every bundled template's `template.json`, keyed by directory name. */
export function listTemplates(templatesRoot: string): TemplateMeta[] {
  if (!fs.existsSync(templatesRoot)) return [];
  return fs
    .readdirSync(templatesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(templatesRoot, entry.name, "template.json")))
    .map((entry) => {
      const meta = JSON.parse(fs.readFileSync(path.join(templatesRoot, entry.name, "template.json"), "utf8")) as Omit<
        TemplateMeta,
        "name"
      >;
      return { name: entry.name, ...meta };
    })
    .sort(
      (a, b) =>
        (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name),
    );
}

export function scaffold(options: { templateDir: string; targetDir: string; projectName: string }): void {
  const { templateDir, targetDir, projectName } = options;

  fs.cpSync(templateDir, targetDir, {
    recursive: true,
    filter: (src) =>
      !SKIP_DIRS.has(path.basename(src)) && !SKIP_FILES.has(path.basename(src)) && !src.endsWith(".tsbuildinfo"),
  });
  fs.rmSync(path.join(targetDir, "template.json"), { force: true });

  const gitignore = path.join(targetDir, "_gitignore");
  if (fs.existsSync(gitignore)) fs.renameSync(gitignore, path.join(targetDir, ".gitignore"));

  const pkgPath = path.join(targetDir, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as Record<string, unknown>;
  pkg.name = projectName;
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
}
