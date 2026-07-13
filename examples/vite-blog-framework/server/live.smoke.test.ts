import { EventEmitter } from "node:events";
import { postsState } from "examples-shared/data";
import { createModelRegistry, normalizeResult, stateChannel } from "rxfy";
import type { LiveClient } from "rxfy-client";
import { createLiveClient } from "rxfy-client";
import type { Hub, PublishSink } from "rxfy-server";
import { createInMemoryHub, createServer, touch } from "rxfy-server";
import { createWsServer } from "rxfy-ws";
import type { WebSocketLike } from "rxfy-ws/client";
import { createWsClient } from "rxfy-ws/client";
import { describe, expect, it } from "vitest";
import { commentResource, postModel, postResource, resources, userResource } from "../src/blog/resources.js";

const SECRET = "test-secret";

/** Derive ServerMessage from the PublishSink type exported by rxfy-server. */
type ServerMessage = Parameters<PublishSink>[1];

async function freshDb() {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const client = new PGlite();
  const db = drizzle(client);
  await client.exec(`
    CREATE TABLE users (id text PRIMARY KEY, name text NOT NULL, email text NOT NULL);
    CREATE TABLE posts (id text PRIMARY KEY, user_id text NOT NULL, title text NOT NULL, body text NOT NULL, created_at timestamp NOT NULL DEFAULT now());
    CREATE TABLE comments (id text PRIMARY KEY, post_id text NOT NULL, name text NOT NULL, body text NOT NULL, created_at timestamp NOT NULL DEFAULT now());
  `);
  return db;
}

/**
 * Wire a real live client to the hub over the same WebSocket bridge the app's `ws.ts` uses:
 * an in-memory socket pair carries `subscribe` frames to `createWsServer` (which verifies the grant)
 * and carries published messages back to `createWsClient` → `createLiveClient`. No network, but the
 * full grant → subscribe → verify → publish path runs.
 */
function connectClient(hub: Hub, registry: ReturnType<typeof createModelRegistry>): LiveClient {
  const wsServer = createWsServer(hub, { secret: SECRET });
  const serverEmitter = new EventEmitter();
  const clientListeners = new Map<string, ((event: unknown) => void)[]>();

  const clientSocket: WebSocketLike = {
    readyState: 1, // OPEN — the live client sends subscribe frames immediately
    send: (data: string) => serverEmitter.emit("message", data), // client → server
    close: () => serverEmitter.emit("close"),
    addEventListener: (type, listener) => {
      const arr = clientListeners.get(type) ?? [];
      arr.push(listener);
      clientListeners.set(type, arr);
    },
  };

  wsServer.handleConnection({
    // server → client: dispatch a `message` event to the client socket's listeners
    send: (data: string) => clientListeners.get("message")?.forEach((l) => l({ data })),
    on: (event, cb) => serverEmitter.on(event, cb),
  });

  const transport = createWsClient({ url: "ws://test", WebSocketImpl: () => clientSocket });
  return createLiveClient({ registry, transport });
}

// Generous timeouts: each test cold-starts a PGlite (wasm Postgres) instance, which is
// fast locally (~1s) but several times slower on CI runners.
describe("vite-blog-framework live server", () => {
  it("registers the three resources", () => {
    expect(resources.byName("post")).toBe(postResource);
    expect(resources.byName("user")).toBe(userResource);
    expect(resources.byName("comment")).toBe(commentResource);
  });

  it("create persists and touches the posts channel with a bare stale", async () => {
    const db = await freshDb();
    const hub = createInMemoryHub();
    const live = createServer({ db, resources, hub, secret: SECRET });

    const received: ServerMessage[] = [];
    hub.onPublish((_conn, msg) => received.push(msg));
    hub.subscribe(0, ["c:posts"], Date.now() + 60_000);

    const row = await live.create(
      postResource,
      { id: "p1", userId: "u1", title: "Hi", body: "B" },
      { touch: [touch(postsState, {})] },
    );
    expect(row).toMatchObject({ id: "p1", title: "Hi" });
    expect(received).toEqual([{ v: 2, kind: "stale", channel: "posts" }]);
  }, 30_000);

  it("update broadcasts a patch on the entity topic", async () => {
    const db = await freshDb();
    const hub = createInMemoryHub();
    const live = createServer({ db, resources, hub, secret: SECRET });
    await live.create(postResource, { id: "p1", userId: "u1", title: "Old", body: "B" });

    const received: ServerMessage[] = [];
    hub.onPublish((_conn, msg) => received.push(msg));
    hub.subscribe(0, ["e:post:p1"], Date.now() + 60_000);

    const row = await live.update(postResource, "p1", { title: "New" });
    expect(row).toMatchObject({ title: "New" });
    expect(received).toEqual([
      {
        v: 2,
        kind: "patch",
        name: "post",
        id: "p1",
        data: { id: "p1", userId: "u1", title: "New", body: "B", createdAt: expect.any(Date) },
      },
    ]);
  }, 30_000);
});

describe("live end-to-end over the grant/WebSocket path", () => {
  it("serve → $grant lift → subscribe → live.update patches the client's model store", async () => {
    const db = await freshDb();
    const hub = createInMemoryHub();
    const live = createServer({ db, resources, hub, secret: SECRET });
    await live.create(postResource, { id: "p1", userId: "u1", title: "Old", body: "B" });

    const registry = createModelRegistry(postModel);
    const liveClient = connectClient(hub, registry);

    // Server hands back the parsed shape + a signed grant, exactly as the /posts endpoint does.
    const served = live.serve(
      postsState,
      {},
      {
        posts: [{ id: "p1", userId: "u1", title: "Old", body: "B" }],
        authors: [{ id: "u1", name: "Ada", email: "ada@example.com" }],
        meta: { total: 1, generatedAt: new Date().toISOString() },
      },
    );
    const { $grant, ...payload } = served;

    // The client lifts $grant, normalizes the payload into its stores, and subscribes with the grant
    // alone — its claims name the entity topics — mirroring useStateData's settle().
    normalizeResult(registry, postsState.fields, payload);
    liveClient.subscribe($grant);

    const row = await live.update(postResource, "p1", { title: "New" });
    expect(row).toMatchObject({ id: "p1", title: "New" });

    // The entity patch flowed hub → ws server → ws client → live client → model store, in place.
    expect(registry.model(postModel).getValue("p1")).toMatchObject({ id: "p1", title: "New" });

    liveClient.stop();
  }, 30_000);

  it("serve → $grant lift → subscribe → touch bumps the client's channel counter (stale)", async () => {
    const db = await freshDb();
    const hub = createInMemoryHub();
    const live = createServer({ db, resources, hub, secret: SECRET });
    await live.create(postResource, { id: "p1", userId: "u1", title: "Old", body: "B" });

    const registry = createModelRegistry(postModel);
    const liveClient = connectClient(hub, registry);

    const channel = stateChannel(postsState, {})!;
    const counter = liveClient.channel(channel);
    let available = 0;
    const sub = counter.available$.subscribe((n) => (available = n));

    const served = live.serve(
      postsState,
      {},
      {
        posts: [{ id: "p1", userId: "u1", title: "Old", body: "B" }],
        authors: [{ id: "u1", name: "Ada", email: "ada@example.com" }],
        meta: { total: 1, generatedAt: new Date().toISOString() },
      },
    );
    const { $grant, ...payload } = served;
    normalizeResult(registry, postsState.fields, payload);
    liveClient.subscribe($grant);

    // A write on another connection touches the posts channel; the client sees a stale bump.
    live.touch(touch(postsState, {}));
    expect(available).toBe(1);

    sub.unsubscribe();
    liveClient.stop();
  }, 30_000);
});
