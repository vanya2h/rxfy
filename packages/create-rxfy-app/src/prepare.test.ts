import { describe, expect, it } from "vitest";
import { rewriteWorkspaceDeps } from "./prepare.js";

const versions = { rxfy: "2.0.0", "rxfy-react": "2.0.0", "rxfy-server": "2.0.0", "rxfy-ws": "2.0.0" };

describe("rewriteWorkspaceDeps", () => {
  it("rewrites workspace:* ranges to caret ranges of the published version", () => {
    const pkg = {
      name: "rxfy-template-vite",
      dependencies: { rxfy: "workspace:*", react: "^19.2.7" },
      devDependencies: { "rxfy-ws": "workspace:*", vite: "^6.3.5" },
    };
    const out = rewriteWorkspaceDeps(pkg, versions);
    expect(out.dependencies).toEqual({ rxfy: "^2.0.0", react: "^19.2.7" });
    expect(out.devDependencies).toEqual({ "rxfy-ws": "^2.0.0", vite: "^6.3.5" });
  });

  it("does not mutate the input", () => {
    const pkg = { dependencies: { rxfy: "workspace:*" } };
    rewriteWorkspaceDeps(pkg, versions);
    expect(pkg.dependencies.rxfy).toBe("workspace:*");
  });

  it("throws when a workspace dependency has no known published version", () => {
    const pkg = { dependencies: { "rxfy-unknown": "workspace:*" } };
    expect(() => rewriteWorkspaceDeps(pkg, versions)).toThrow(/rxfy-unknown/);
  });
});
