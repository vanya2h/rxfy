import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCli } from "./cli.js";

let tmp: string;

/** Build a fake bundled templates root with one template in it. */
function fixtureTemplatesRoot(): string {
  const root = path.join(tmp, "templates");
  const dir = path.join(root, "vite");
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "template.json"),
    JSON.stringify({ display: "Vite (sync SSR app)", description: "Full sync stack" }),
  );
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "rxfy-template-vite", private: true, dependencies: { rxfy: "^2.0.0" } }, null, 2),
  );
  fs.writeFileSync(path.join(dir, "_gitignore"), "node_modules\ndist\n");
  fs.writeFileSync(path.join(dir, "src", "main.ts"), "export {};\n");
  return root;
}

type Envelope = {
  ok: boolean;
  data?: { projectName: string; template: string; dir: string };
  error?: { code: string; message: string; retryable?: boolean };
};

/** Run the CLI against the fixture root; vitest's non-TTY stdout puts it in agent mode. */
async function run(argv: string[], templatesRoot = path.join(tmp, "templates")) {
  let out = "";
  let code: number | undefined;
  const cli = createCli({ templatesRoot, version: "0.0.0-test" });
  await cli.serve([...argv, "--json", "--full-output"], {
    stdout(s) {
      out += s;
    },
    exit(c) {
      code ??= c;
    },
  });
  return { envelope: JSON.parse(out) as Envelope, code };
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "create-rxfy-app-cli-"));
  fixtureTemplatesRoot();
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("create-rxfy-app CLI", () => {
  it("scaffolds a project and returns a structured envelope", async () => {
    const target = path.join(tmp, "my-app");
    const { envelope } = await run([target, "--template", "vite"]);

    expect(envelope.ok).toBe(true);
    expect(envelope.data).toEqual({ projectName: "my-app", template: "vite", dir: target });
    expect(fs.existsSync(path.join(target, ".gitignore"))).toBe(true);
    expect(fs.existsSync(path.join(target, "template.json"))).toBe(false);
    const pkg = JSON.parse(fs.readFileSync(path.join(target, "package.json"), "utf8"));
    expect(pkg.name).toBe("my-app");
  });

  it("defaults to the only bundled template when --template is omitted", async () => {
    const target = path.join(tmp, "my-app");
    const { envelope } = await run([target]);
    expect(envelope.ok).toBe(true);
    expect(envelope.data?.template).toBe("vite");
  });

  it("errors with MISSING_PROJECT_NAME when no name is given non-interactively", async () => {
    const { envelope, code } = await run([]);
    expect(envelope.ok).toBe(false);
    expect(envelope.error?.code).toBe("MISSING_PROJECT_NAME");
    expect(envelope.error?.retryable).toBe(true);
    expect(code).toBeGreaterThan(0);
  });

  it("errors with DIR_NOT_EMPTY when the target directory has files", async () => {
    const target = path.join(tmp, "occupied");
    fs.mkdirSync(target);
    fs.writeFileSync(path.join(target, "keep.txt"), "hi");

    const { envelope, code } = await run([target, "-t", "vite"]);
    expect(envelope.ok).toBe(false);
    expect(envelope.error?.code).toBe("DIR_NOT_EMPTY");
    expect(code).toBeGreaterThan(0);
    expect(fs.readFileSync(path.join(target, "keep.txt"), "utf8")).toBe("hi");
  });

  it("errors with UNKNOWN_TEMPLATE and lists available templates", async () => {
    const target = path.join(tmp, "my-app");
    const { envelope } = await run([target, "--template", "nope"]);
    expect(envelope.ok).toBe(false);
    expect(envelope.error?.code).toBe("UNKNOWN_TEMPLATE");
    expect(envelope.error?.message).toContain("vite");
    expect(fs.existsSync(target)).toBe(false);
  });

  it("errors with MISSING_TEMPLATE when several templates exist and none is picked", async () => {
    const extra = path.join(tmp, "templates", "client-only");
    fs.mkdirSync(extra, { recursive: true });
    fs.writeFileSync(path.join(extra, "template.json"), JSON.stringify({ display: "Client", description: "SPA" }));
    fs.writeFileSync(path.join(extra, "package.json"), JSON.stringify({ name: "x" }));

    const { envelope } = await run([path.join(tmp, "my-app")]);
    expect(envelope.ok).toBe(false);
    expect(envelope.error?.code).toBe("MISSING_TEMPLATE");
    expect(envelope.error?.message).toContain("client-only");
  });

  it("errors with NO_TEMPLATES when the templates root is missing", async () => {
    const { envelope, code } = await run([path.join(tmp, "my-app")], path.join(tmp, "nope"));
    expect(envelope.ok).toBe(false);
    expect(envelope.error?.code).toBe("NO_TEMPLATES");
    expect(code).toBeGreaterThan(0);
  });
});
