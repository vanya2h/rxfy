import { EventEmitter } from "node:events";
import { createModelRegistry, normalizeResult, stateChannel } from "rxfy";
import type { SyncClient } from "rxfy-client";
import { createSyncClient } from "rxfy-client";
import type { Hub, PublishSink } from "rxfy-server";
import { createInMemoryHub, createSync, touch } from "rxfy-server";
import { drizzleStorage } from "rxfy-server-drizzle";
import { createWsServer } from "rxfy-ws";
import type { WebSocketLike } from "rxfy-ws/client";
import { createWsClient } from "rxfy-ws/client";
import { describe, expect, it } from "vitest";
import { resources, todoResource } from "../resources";
import { todoModel, todosState } from "../todos";

const SECRET = "test-secret";

/** Derive ServerMessage from the PublishSink type exported by rxfy-server. */
type ServerMessage = Parameters<PublishSink>[1];

async function freshDb() {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const client = new PGlite();
  const db = drizzle(client);
  await client.exec(`
    CREATE TABLE todos (id text PRIMARY KEY, title text NOT NULL, done boolean NOT NULL DEFAULT false, created_at timestamp NOT NULL DEFAULT now());
  `);
  return db;
}

/**
 * Wire a real sync client to the hub over the same WebSocket bridge the app uses: an in-memory
 * socket pair carries `subscribe` frames to `createWsServer` (which verifies the grant) and carries
 * published messages back to `createWsClient` → `createSyncClient`. No network, but the full
 * grant → subscribe → verify → publish path runs.
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

// Generous timeouts: each test cold-starts a PGlite (wasm Postgres) instance, several times slower on CI.
describe("sync server", () => {
  it("registers the todo resource", () => {
    expect(resources.byName("todo")).toBe(todoResource);
  });

  it("create persists and touches the todos channel with a bare stale", async () => {
    const db = await freshDb();
    const hub = createInMemoryHub();
    const sync = createSync({ storage: drizzleStorage(db), hub, secret: SECRET });

    const received: ServerMessage[] = [];
    hub.onPublish((_conn, msg) => received.push(msg));
    hub.subscribe(0, ["c:todos"], Date.now() + 60_000);

    const row = await sync.create(
      todoResource,
      { id: "t1", title: "Hi", done: false },
      { touch: [touch(todosState, {})] },
    );
    expect(row).toMatchObject({ id: "t1", title: "Hi" });
    expect(received).toEqual([{ v: 2, kind: "stale", channel: "todos" }]);
  }, 30_000);

  it("update broadcasts a patch on the entity topic", async () => {
    const db = await freshDb();
    const hub = createInMemoryHub();
    const sync = createSync({ storage: drizzleStorage(db), hub, secret: SECRET });
    await sync.create(todoResource, { id: "t1", title: "Hi", done: false });

    const received: ServerMessage[] = [];
    hub.onPublish((_conn, msg) => received.push(msg));
    hub.subscribe(0, ["e:todo:t1"], Date.now() + 60_000);

    const row = await sync.update(todoResource, "t1", { done: true });
    expect(row).toMatchObject({ id: "t1", done: true });
    expect(received).toEqual([
      {
        v: 2,
        kind: "patch",
        name: "todo",
        id: "t1",
        data: { id: "t1", title: "Hi", done: true, createdAt: expect.any(Date) },
      },
    ]);
  }, 30_000);
});

describe("live end-to-end over the grant/WebSocket path", () => {
  it("serve → $grant lift → subscribe → sync.update patches the client's model store", async () => {
    const db = await freshDb();
    const hub = createInMemoryHub();
    const sync = createSync({ storage: drizzleStorage(db), hub, secret: SECRET });
    await sync.create(todoResource, { id: "t1", title: "Hi", done: false });

    const registry = createModelRegistry(todoModel);
    const syncClient = connectClient(hub, registry);

    const served = sync.serve(todosState, {}, { todos: [{ id: "t1", title: "Hi", done: false }] });
    const { $grant, ...payload } = served;

    normalizeResult(registry, todosState.fields, payload);
    syncClient.subscribe($grant);

    const row = await sync.update(todoResource, "t1", { done: true });
    expect(row).toMatchObject({ id: "t1", done: true });

    expect(registry.model(todoModel).getValue("t1")).toMatchObject({ id: "t1", done: true });

    syncClient.stop();
  }, 30_000);

  it("serve → $grant lift → subscribe → touch bumps the client's channel counter (stale)", async () => {
    const db = await freshDb();
    const hub = createInMemoryHub();
    const sync = createSync({ storage: drizzleStorage(db), hub, secret: SECRET });
    await sync.create(todoResource, { id: "t1", title: "Hi", done: false });

    const registry = createModelRegistry(todoModel);
    const syncClient = connectClient(hub, registry);

    const channel = stateChannel(todosState, {})!;
    const counter = syncClient.channel(channel);
    let available = 0;
    const sub = counter.available$.subscribe((n) => (available = n));

    const served = sync.serve(todosState, {}, { todos: [{ id: "t1", title: "Hi", done: false }] });
    const { $grant, ...payload } = served;
    normalizeResult(registry, todosState.fields, payload);
    syncClient.subscribe($grant);

    sync.touch(touch(todosState, {}));
    expect(available).toBe(1);

    sub.unsubscribe();
    syncClient.stop();
  }, 30_000);
});
