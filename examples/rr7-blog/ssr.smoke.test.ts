import { type ChildProcess, spawn } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// A quasi-unique port so parallel test runs (and a locally running dev server) don't collide.
const PORT = 5900 + (process.pid % 500);
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
 * Boots the production server (turbo builds before tests) and asserts the SSR'd HTML is fully
 * resolved — entries render even with JavaScript disabled. The buffered `onAllReady` render in
 * entry.server.tsx is what guarantees this; streaming on `onShellReady` would ship the fallback
 * plus hidden `$RC`-revealed chunks instead.
 */
describe("SSR end-to-end", () => {
  beforeAll(async () => {
    server = spawn("node_modules/.bin/tsx", ["server.mts"], {
      env: { ...process.env, NODE_ENV: "production", PORT: String(PORT) },
      stdio: "ignore",
      detached: true, // own process group, so afterAll kills the whole server tree
    });
    await waitForServer();
  }, 30_000);

  afterAll(() => {
    if (server.pid) process.kill(-server.pid, "SIGTERM");
  });

  it("serves the post list fully resolved — renders without JavaScript", async () => {
    const html = await (await fetch(`${BASE}/posts`)).text();

    expect(html).toContain("Getting Started with rxfy"); // seeded post title in the markup
    expect(html).toContain("__RXFY_SSR__"); // hydration snapshot injected before </body>
    expect(html).not.toContain("$RC"); // no inline reveal scripts
  }, 30_000);

  it("serves a post detail page fully resolved", async () => {
    const html = await (await fetch(`${BASE}/posts/1`)).text();

    expect(html).toContain("Getting Started with rxfy");
    expect(html).toContain("__RXFY_SSR__");
  }, 30_000);
});
