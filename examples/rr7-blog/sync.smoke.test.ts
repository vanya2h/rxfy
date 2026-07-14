import { type ChildProcess, spawn } from "node:child_process";
import { parseServerMessage, serialize, subscribe } from "rxfy-protocol";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// A quasi-unique port so parallel test runs (and a locally running dev server) don't collide.
const PORT = 7900 + (process.pid % 500);
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
 * The full live loop over the real server: a client reads a post detail (the response carries a
 * signed channel grant as `$grant`), presents the grant on its socket to subscribe the channel,
 * and receives a `stale` push when another client comments.
 */
describe("live end-to-end", () => {
  beforeAll(async () => {
    server = spawn("node_modules/.bin/tsx", ["server.mts"], {
      env: { ...process.env, NODE_ENV: "production", PORT: String(PORT) },
      stdio: "ignore",
      detached: true,
    });
    await waitForServer();
  }, 30_000);

  afterAll(() => {
    if (server.pid) process.kill(-server.pid, "SIGTERM");
  });

  it("pushes a stale to a socket that subscribed with the post-detail grant", async () => {
    // 1. Read the post detail — the response carries a signed channel grant as $grant.
    const detail = (await (await fetch(`${BASE}/api/posts/1`)).json()) as { $grant: string };
    expect(typeof detail.$grant).toBe("string");

    // 2. Present the grant on a sync socket — the WS server verifies it and subscribes the channel.
    const ws = new WebSocket(`ws://localhost:${PORT}/live`);
    const staleMessage = new Promise((resolve, reject) => {
      ws.addEventListener("message", (event) => {
        const message = parseServerMessage(String(event.data));
        if (message.kind === "stale") resolve(message);
      });
      ws.addEventListener("error", () => reject(new Error("websocket error")));
      setTimeout(() => reject(new Error("no stale received within 10s")), 10_000);
    });
    await new Promise((resolve) => ws.addEventListener("open", resolve));
    ws.send(serialize(subscribe(detail.$grant)));
    await new Promise((resolve) => setTimeout(resolve, 200)); // let the subscribe bind before writing

    // 3. Another client comments on the post.
    const res = await fetch(`${BASE}/api/posts/1/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Live", body: "smoke test comment" }),
    });
    expect(res.ok).toBe(true);

    // 4. The subscribed socket receives the invalidation push.
    expect(await staleMessage).toMatchObject({ v: 2, kind: "stale", channel: "post-detail:postId=1" });
    ws.close();
  }, 30_000);
});
