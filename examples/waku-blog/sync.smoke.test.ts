import { type ChildProcess, spawn } from "node:child_process";
import { parseServerMessage, serialize, subscribe } from "rxfy-protocol";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// A quasi-unique port so parallel test runs (and a locally running dev server) don't collide.
const PORT = 8400 + (process.pid % 400);
const WS_PORT = PORT + 400;
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
 * The full live loop over the real server: reading a post returns a signed channel grant; the
 * client presents it in a `subscribe` frame on the sync socket and receives a `stale` push when
 * another client comments. No sessions — the grant carries the channel authorization.
 */
describe("live end-to-end", () => {
  beforeAll(async () => {
    server = spawn("node_modules/.bin/waku", ["start", "--port", String(PORT)], {
      env: { ...process.env, RXFY_WS_PORT: String(WS_PORT) },
      stdio: "ignore",
      detached: true,
    });
    await waitForServer();
  }, 30_000);

  afterAll(() => {
    if (server.pid) process.kill(-server.pid, "SIGTERM");
  });

  it("pushes a stale to a socket that presented the post-detail grant", async () => {
    // 1. Read the post detail — the response carries a signed grant for its channel.
    const detail = (await (await fetch(`${BASE}/api/posts/1`)).json()) as {
      $grant: string;
      post: { author: { name: string }; comments: { author: { name: string } }[] };
    };
    expect(typeof detail.$grant).toBe("string");
    // The detail endpoint delivers the recursive join (post → author, and each comment → its author).
    expect(detail.post.author.name).toBe("Alice Doe"); // post 1's author (userId 1)
    expect(detail.post.comments.map((c) => c.author.name)).toEqual(
      expect.arrayContaining(["Bob Smith", "Carol Lee"]), // comments 1 & 2 → their own authors
    );

    // 2. Present the grant on a sync socket via a subscribe frame.
    const ws = new WebSocket(`ws://localhost:${WS_PORT}/live`);
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
    const created = (await res.json()) as { userId?: string };
    expect(typeof created.userId).toBe("string"); // addComment assigned an author (userId) for the join

    // 4. The subscribed socket receives the invalidation push.
    expect(await staleMessage).toMatchObject({ v: 2, kind: "stale", channel: "post-detail:postId=1" });
    ws.close();
  }, 30_000);
});
