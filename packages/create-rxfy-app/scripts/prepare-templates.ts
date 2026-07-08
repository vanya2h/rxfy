import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rewriteWorkspaceDeps } from "../src/prepare.js";

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(pkgRoot, "../..");
const templatesSrc = path.join(repoRoot, "templates");
const templatesOut = path.join(pkgRoot, "dist", "templates");

const SKIP_DIRS = new Set(["node_modules", "dist", ".turbo"]);

const versions: Record<string, string> = {};
for (const dir of fs.readdirSync(path.join(repoRoot, "packages"))) {
  const pkgJsonPath = path.join(repoRoot, "packages", dir, "package.json");
  if (!fs.existsSync(pkgJsonPath)) continue;
  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8")) as { name: string; version: string };
  versions[pkg.name] = pkg.version;
}

fs.rmSync(templatesOut, { recursive: true, force: true });

for (const entry of fs.readdirSync(templatesSrc, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const src = path.join(templatesSrc, entry.name);
  const out = path.join(templatesOut, entry.name);

  fs.cpSync(src, out, {
    recursive: true,
    filter: (p) => !SKIP_DIRS.has(path.basename(p)) && !p.endsWith(".tsbuildinfo"),
  });

  // npm strips .gitignore files from published tarballs — ship as _gitignore,
  // the CLI renames it back on scaffold.
  const gitignore = path.join(out, ".gitignore");
  if (fs.existsSync(gitignore)) fs.renameSync(gitignore, path.join(out, "_gitignore"));

  const pkgJsonPath = path.join(out, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8")) as Record<string, unknown>;
  fs.writeFileSync(pkgJsonPath, `${JSON.stringify(rewriteWorkspaceDeps(pkg, versions), null, 2)}\n`);

  console.log(`prepared template: ${entry.name}`);
}
