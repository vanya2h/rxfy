import { defineConfig, devices } from "@playwright/test";
import { targets } from "./targets";

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./tests",
  // Tests within a project share one server; keep them serial to avoid racing on shared DB state.
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI ? [["github"], ["list"]] : "list",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: { trace: "on-first-retry" },

  // One project per app; each runs only its capability's spec.
  projects: targets.map((t) => ({
    name: t.name,
    testMatch: `**/${t.capability}.spec.ts`,
    use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${t.port}` },
    metadata: { capability: t.capability },
  })),

  // One production server per app, started once and reused across that project's tests.
  webServer: targets.map((t) => ({
    command: t.command,
    url: `http://localhost:${t.port}/`,
    env: t.env,
    reuseExistingServer: !isCI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  })),
});
