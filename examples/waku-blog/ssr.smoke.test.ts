import { type ChildProcess, spawn } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// A quasi-unique port so parallel test runs (and a locally running dev server) don't collide.
const PORT = 6900 + (process.pid % 500);
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
 * Boots the production server (turbo builds before tests) and asserts the RSC-fetched data is in
 * the served HTML: pages fetch through the in-process client and seed the views via
 * `defaultData`, so entries render server-side rather than behind a client fetch.
 */
describe("SSR end-to-end", () => {
  beforeAll(async () => {
    server = spawn("node_modules/.bin/waku", ["start", "--port", String(PORT)], {
      env: { ...process.env },
      stdio: "ignore",
      detached: true, // own process group, so afterAll kills the whole server tree
    });
    await waitForServer();
  }, 30_000);

  afterAll(() => {
    if (server.pid) process.kill(-server.pid, "SIGTERM");
  });

  it("serves the post list server-rendered", async () => {
    const html = await (await fetch(`${BASE}/`)).text();
    expect(html).toContain("Getting Started with rxfy"); // seeded post title in the markup
  }, 30_000);

  it("serves a post detail page server-rendered", async () => {
    const html = await (await fetch(`${BASE}/posts/1`)).text();
    expect(html).toContain("Getting Started with rxfy");
  }, 30_000);
});
