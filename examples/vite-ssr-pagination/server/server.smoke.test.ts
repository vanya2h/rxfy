import { type ChildProcess, spawn } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// A quasi-unique port so parallel test runs (and a locally running dev server) don't collide.
const PORT = 5300 + (process.pid % 500);
const BASE = `http://localhost:${PORT}`;

let server: ChildProcess;

async function waitForServer(timeoutMs = 25_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(`${BASE}/api/users`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) throw new Error("dev server did not become ready");
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

/**
 * Boots the real `server.ts` (vite dev mode) and asserts on the actual HTTP response — this is
 * what guards the `onAllReady` choice in server.ts: piping on `onShellReady` would ship the
 * Suspense fallback plus hidden `$RC`-revealed chunks, breaking rendering without JavaScript.
 */
describe("server end-to-end", () => {
  beforeAll(async () => {
    server = spawn("node_modules/.bin/tsx", ["./server.ts"], {
      env: { ...process.env, PORT: String(PORT) },
      stdio: "ignore",
      detached: true, // own process group, so afterAll can kill tsx's child node too
    });
    await waitForServer();
  }, 30_000);

  afterAll(() => {
    if (server.pid) process.kill(-server.pid, "SIGTERM");
  });

  it("responds with fully-resolved SSR HTML — renders without JavaScript", async () => {
    const html = await (await fetch(`${BASE}/`)).text();

    expect(html.match(/user-row/g)).toHaveLength(20);
    expect(html).not.toContain("$RC"); // no inline reveal scripts
    expect(html).not.toContain("Loading users…"); // no Suspense fallback in the sent markup
    expect(html).toContain("__RXFY_SSR__"); // state snapshot spliced at <!--app-state-->
  }, 30_000);

  it("validates the pagination cursor", async () => {
    expect((await fetch(`${BASE}/api/users?cursor=20`)).status).toBe(200);
    expect((await fetch(`${BASE}/api/users?cursor=abc`)).status).toBe(400);
  }, 30_000);
});
