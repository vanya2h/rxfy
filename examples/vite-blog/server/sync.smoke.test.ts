import { EventEmitter } from "node:events";
import { postDetailState, type PostId, postsState } from "examples-shared/data";
import { createModelRegistry, normalizeResult, stateChannel } from "rxfy";
import type { SyncClient } from "rxfy-client";
import { createSyncClient } from "rxfy-client";
import type { Hub, PublishSink } from "rxfy-server";
import { createInMemoryHub, createSync, touch, verifyGrant } from "rxfy-server";
import { drizzleStorage } from "rxfy-server-drizzle";
import { createWsServer } from "rxfy-ws";
import type { WebSocketLike } from "rxfy-ws/client";
import { createWsClient } from "rxfy-ws/client";
import { describe, expect, it } from "vitest";
import {
  commentModel,
  commentResource,
  postModel,
  postResource,
  resources,
  userModel,
  userResource,
} from "../src/blog/resources.js";

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
    CREATE TABLE comments (id text PRIMARY KEY, post_id text NOT NULL, user_id text NOT NULL, name text NOT NULL, body text NOT NULL, created_at timestamp NOT NULL DEFAULT now());
  `);
  return db;
}

/**
 * Wire a real sync client to the hub over the same WebSocket bridge the app's `ws.ts` uses:
 * an in-memory socket pair carries `subscribe` frames to `createWsServer` (which verifies the grant)
 * and carries published messages back to `createWsClient` → `createSyncClient`. No network, but the
 * full grant → subscribe → verify → publish path runs.
 */
function connectClient(hub: Hub, registry: ReturnType<typeof createModelRegistry>): SyncClient {
  const wsServer = createWsServer(hub, { secret: SECRET });
  const serverEmitter = new EventEmitter();
  const clientListeners = new Map<string, ((event: unknown) => void)[]>();

  const clientSocket: WebSocketLike = {
    readyState: 1, // OPEN — the sync client sends subscribe frames immediately
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
  return createSyncClient({ registry, transport });
}

// Generous timeouts: each test cold-starts a PGlite (wasm Postgres) instance, which is
// fast locally (~1s) but several times slower on CI runners.
describe("vite-blog sync server", () => {
  it("registers the three resources", () => {
    expect(resources.byName("post")).toBe(postResource);
    expect(resources.byName("user")).toBe(userResource);
    expect(resources.byName("comment")).toBe(commentResource);
  });

  it("create persists and touches the posts channel with a bare stale", async () => {
    const db = await freshDb();
    const hub = createInMemoryHub();
    const sync = createSync({ storage: drizzleStorage(db), hub, secret: SECRET });

    const received: ServerMessage[] = [];
    hub.onPublish((_conn, msg) => received.push(msg));
    hub.subscribe(0, ["c:posts"], Date.now() + 60_000);

    const row = await sync.create(
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
    const sync = createSync({ storage: drizzleStorage(db), hub, secret: SECRET });
    await sync.create(postResource, { id: "p1", userId: "u1", title: "Old", body: "B" });

    const received: ServerMessage[] = [];
    hub.onPublish((_conn, msg) => received.push(msg));
    hub.subscribe(0, ["e:post:p1"], Date.now() + 60_000);

    const row = await sync.update(postResource, "p1", { title: "New" });
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

describe("serve recurses the postDetail join", () => {
  it("keeps nested entities, splits every level into its store, and enumerates all topics in the grant", async () => {
    const hub = createInMemoryHub();
    // serve() never touches storage — it parses the payload and signs a grant — but createSync requires one.
    const sync = createSync({ storage: drizzleStorage(await freshDb()), hub, secret: SECRET });

    // The denormalized payload the /posts/:id endpoint builds: post → joined author, and each comment
    // joined with ITS own author (post → comments → author).
    const served = sync.serve(
      postDetailState,
      { postId: "p1" as PostId },
      {
        post: {
          id: "p1",
          userId: "u1",
          title: "Getting Started with rxfy",
          body: "B",
          author: { id: "u1", name: "Alice Doe", email: "alice@example.com" },
          comments: [
            {
              id: "c1",
              postId: "p1",
              userId: "u2",
              name: "Bob Smith",
              body: "Great intro!",
              author: { id: "u2", name: "Bob Smith", email: "bob@example.com" },
            },
          ],
        },
      },
    );

    // serve keeps the nested entities (cleaned through the schemas) at every level. The static output
    // type carries relations as keys, so read the runtime nested shape loosely here.
    const post = served.post as unknown as { author: { name: string }; comments: { author: { name: string } }[] };
    expect(post.author).toMatchObject({ name: "Alice Doe" }); // post → author
    expect(post.comments[0].author).toMatchObject({ name: "Bob Smith" }); // comment → its own author

    // Normalizing that payload splits each level into its own store and yields an id-only query.
    const registry = createModelRegistry(userModel).add(commentModel).add(postModel);
    const { $grant, ...payload } = served;
    const query = normalizeResult(registry, postDetailState.fields, payload) as { post: string };

    expect(query.post).toBe("p1"); // the query holds only the post id
    expect(registry.model(postModel).getValue("p1")).toMatchObject({ author: "u1", comments: ["c1"] });
    expect(registry.model(commentModel).getValue("c1")?.author).toBe("u2"); // comment's joined author key
    expect(registry.model(userModel).getValue("u1")?.name).toBe("Alice Doe"); // post author in store
    expect(registry.model(userModel).getValue("u2")?.name).toBe("Bob Smith"); // comment author in store

    // The signed grant enumerates every nested entity topic, so live updates reach joined entities too.
    const claims = verifyGrant($grant, { secret: SECRET });
    expect(claims?.entities).toEqual(expect.arrayContaining(["post:p1", "user:u1", "comment:c1", "user:u2"]));
  }, 30_000);
});

describe("live end-to-end over the grant/WebSocket path", () => {
  it("serve → $grant lift → subscribe → sync.update patches the client's model store", async () => {
    const db = await freshDb();
    const hub = createInMemoryHub();
    const sync = createSync({ storage: drizzleStorage(db), hub, secret: SECRET });
    await sync.create(postResource, { id: "p1", userId: "u1", title: "Old", body: "B" });

    const registry = createModelRegistry(postModel);
    const syncClient = connectClient(hub, registry);

    // Server hands back the parsed shape + a signed grant, exactly as the /posts endpoint does.
    const served = sync.serve(
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
    syncClient.subscribe($grant);

    const row = await sync.update(postResource, "p1", { title: "New" });
    expect(row).toMatchObject({ id: "p1", title: "New" });

    // The entity patch flowed hub → ws server → ws client → sync client → model store, in place.
    expect(registry.model(postModel).getValue("p1")).toMatchObject({ id: "p1", title: "New" });

    syncClient.stop();
  }, 30_000);

  it("serve → $grant lift → subscribe → touch bumps the client's channel counter (stale)", async () => {
    const db = await freshDb();
    const hub = createInMemoryHub();
    const sync = createSync({ storage: drizzleStorage(db), hub, secret: SECRET });
    await sync.create(postResource, { id: "p1", userId: "u1", title: "Old", body: "B" });

    const registry = createModelRegistry(postModel);
    const syncClient = connectClient(hub, registry);

    const channel = stateChannel(postsState, {})!;
    const counter = syncClient.channel(channel);
    let available = 0;
    const sub = counter.available$.subscribe((n) => (available = n));

    const served = sync.serve(
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
    syncClient.subscribe($grant);

    // A write on another connection touches the posts channel; the client sees a stale bump.
    sync.touch(touch(postsState, {}));
    expect(available).toBe(1);

    sub.unsubscribe();
    syncClient.stop();
  }, 30_000);
});
