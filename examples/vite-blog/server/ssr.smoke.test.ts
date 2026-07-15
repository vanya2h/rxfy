import { type ChildProcess, spawn } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// A quasi-unique port so parallel test runs (and a locally running dev server) don't collide.
const PORT = 5400 + (process.pid % 500);
const BASE = `http://localhost:${PORT}`;

let server: ChildProcess;

async function waitForServer(timeoutMs = 25_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(`${BASE}/api/posts`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) throw new Error("server did not become ready");
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

/**
 * Boots the real server in production mode (turbo builds before tests) and asserts the SSR'd
 * HTML is fully resolved — entries render even with JavaScript disabled. `onShellReady`-style
 * streaming would ship the Suspense fallback plus hidden `$RC`-revealed chunks instead.
 */
describe("SSR end-to-end", () => {
  beforeAll(async () => {
    server = spawn("node_modules/.bin/tsx", ["./server/index.ts"], {
      env: { ...process.env, NODE_ENV: "production", PORT: String(PORT) },
      stdio: "ignore",
      detached: true, // own process group, so afterAll can kill tsx's child node too
    });
    await waitForServer();
  }, 30_000);

  afterAll(() => {
    if (server.pid) process.kill(-server.pid, "SIGTERM");
  });

  it("serves the post list fully resolved — renders without JavaScript", async () => {
    const html = await (await fetch(`${BASE}/`)).text();

    expect(html).toContain("Getting Started with rxfy"); // seeded post title in the markup
    expect(html).toContain("__RXFY_SSR__"); // hydration snapshot embedded
    expect(html).toContain("grants"); // signed channel grants ride alongside the dehydrated registry
    expect(html).not.toContain("$RC"); // no inline reveal scripts (buffered onAllReady render)
  }, 30_000);

  it("serves a post detail page fully resolved", async () => {
    const html = await (await fetch(`${BASE}/posts/p1`)).text();

    expect(html).toContain("Getting Started with rxfy");
    expect(html).toContain("__RXFY_SSR__");
    expect(html).toContain("grants");
    expect(html).not.toContain("$RC");
  }, 30_000);
});
