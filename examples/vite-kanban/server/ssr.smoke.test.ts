import { type ChildProcess, spawn } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const PORT = 5400 + (process.pid % 500);
const BASE = `http://localhost:${PORT}`;

let server: ChildProcess;

async function waitForServer(timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(`${BASE}/api/board`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) throw new Error("server did not become ready");
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

/**
 * Boots the real server in production mode (turbo builds before tests) and asserts the SSR'd board
 * HTML is fully resolved — it renders even with JavaScript disabled. `onShellReady`-style streaming
 * would ship a Suspense fallback plus hidden `$RC`-revealed chunks instead.
 */
describe("SSR end-to-end", () => {
  beforeAll(async () => {
    server = spawn("node_modules/.bin/tsx", ["./server/index.ts"], {
      env: { ...process.env, NODE_ENV: "production", PORT: String(PORT) },
      stdio: "ignore",
      detached: true,
    });
    await waitForServer();
  }, 70_000);

  afterAll(() => {
    if (server.pid) process.kill(-server.pid, "SIGTERM");
  });

  it("serves the board fully resolved — renders without JavaScript", async () => {
    const html = await (await fetch(`${BASE}/`)).text();

    expect(html).toContain("To Do"); // fixed column heading
    expect(html).toContain("Draft the roadmap"); // seeded card title
    expect(html).toContain("__RXFY_SSR__"); // hydration snapshot embedded
    expect(html).toContain("grants"); // signed channel grants ride alongside the registry
    expect(html).not.toContain("$RC"); // no inline reveal scripts (buffered onAllReady)
  }, 30_000);
});
