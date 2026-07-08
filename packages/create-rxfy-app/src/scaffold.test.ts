import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listTemplates, scaffold } from "./scaffold.js";

let tmp: string;

/** Build a fake bundled templates root with one template in it. */
function fixtureTemplatesRoot(): string {
  const root = path.join(tmp, "templates");
  const dir = path.join(root, "vite");
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "template.json"),
    JSON.stringify({ display: "Vite (live SSR app)", description: "Full live stack" }),
  );
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "rxfy-template-vite", private: true, dependencies: { rxfy: "^2.0.0" } }, null, 2),
  );
  fs.writeFileSync(path.join(dir, "_gitignore"), "node_modules\ndist\n");
  fs.writeFileSync(path.join(dir, "src", "main.ts"), "export {};\n");
  // Junk that must never be copied into a scaffolded app:
  fs.mkdirSync(path.join(dir, "node_modules", "junk"), { recursive: true });
  fs.mkdirSync(path.join(dir, "dist"), { recursive: true });
  fs.mkdirSync(path.join(dir, ".next", "cache"), { recursive: true });
  fs.writeFileSync(path.join(dir, "next-env.d.ts"), '/// <reference types="next" />\n');
  fs.writeFileSync(path.join(dir, "tsconfig.app.tsbuildinfo"), "{}");
  return root;
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "create-rxfy-app-"));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("listTemplates", () => {
  it("reads template.json metadata keyed by directory name", () => {
    const templates = listTemplates(fixtureTemplatesRoot());
    expect(templates).toEqual([{ name: "vite", display: "Vite (live SSR app)", description: "Full live stack" }]);
  });

  it("returns [] when the templates root does not exist", () => {
    expect(listTemplates(path.join(tmp, "nope"))).toEqual([]);
  });

  it("orders templates by name regardless of directory read order", () => {
    const root = fixtureTemplatesRoot();
    const dir = path.join(root, "aaa-first");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "template.json"), JSON.stringify({ display: "A", description: "a" }));
    expect(listTemplates(root).map((t) => t.name)).toEqual(["aaa-first", "vite"]);
  });

  it("sorts by order when present, name otherwise; missing order sorts last", () => {
    const root = path.join(tmp, "ordered-templates");
    const make = (name: string, meta: Record<string, unknown>) => {
      fs.mkdirSync(path.join(root, name), { recursive: true });
      fs.writeFileSync(path.join(root, name, "template.json"), JSON.stringify(meta));
    };
    make("zz-first", { display: "Z", description: "z", order: 1 });
    make("mm-second", { display: "M", description: "m", order: 2 });
    make("bb-unordered", { display: "B", description: "b" });
    make("aa-unordered", { display: "A", description: "a" });
    expect(listTemplates(root).map((t) => t.name)).toEqual(["zz-first", "mm-second", "aa-unordered", "bb-unordered"]);
  });
});

describe("scaffold", () => {
  it("copies files, renames _gitignore, rewrites the package name, drops junk", () => {
    const root = fixtureTemplatesRoot();
    const target = path.join(tmp, "my-app");

    scaffold({ templateDir: path.join(root, "vite"), targetDir: target, projectName: "my-app" });

    expect(fs.readFileSync(path.join(target, "src", "main.ts"), "utf8")).toBe("export {};\n");
    expect(fs.existsSync(path.join(target, ".gitignore"))).toBe(true);
    expect(fs.existsSync(path.join(target, "_gitignore"))).toBe(false);
    expect(fs.existsSync(path.join(target, "template.json"))).toBe(false);
    expect(fs.existsSync(path.join(target, "node_modules"))).toBe(false);
    expect(fs.existsSync(path.join(target, "dist"))).toBe(false);
    expect(fs.existsSync(path.join(target, ".next"))).toBe(false);
    expect(fs.existsSync(path.join(target, "next-env.d.ts"))).toBe(false);
    expect(fs.existsSync(path.join(target, "tsconfig.app.tsbuildinfo"))).toBe(false);

    const pkg = JSON.parse(fs.readFileSync(path.join(target, "package.json"), "utf8"));
    expect(pkg.name).toBe("my-app");
    expect(pkg.dependencies).toEqual({ rxfy: "^2.0.0" });
  });
});
