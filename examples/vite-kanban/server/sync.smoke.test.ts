import { EventEmitter } from "node:events";
import { createModelRegistry, normalizeResult, stateChannel } from "rxfy";
import { createSyncClient, type SyncClient } from "rxfy-client";
import { createInMemoryHub, createSync, type Hub, type PublishSink, touch } from "rxfy-server";
import { drizzleStorage } from "rxfy-server-drizzle";
import { createWsServer } from "rxfy-ws";
import { createWsClient, type WebSocketLike } from "rxfy-ws/client";
import { describe, expect, it } from "vitest";
import { cardModel, cardResource, resources } from "../src/kanban/resources.js";
import { boardState } from "../src/kanban/states.js";

type ServerMessage = Parameters<PublishSink>[1];

const SECRET = "test-secret";

/**
 * Bridge a real sync client to the hub over the same WebSocket path the app's `ws.ts` uses: an
 * in-memory socket pair carries `subscribe` frames to `createWsServer` (which verifies the grant)
 * and carries published messages back to `createWsClient` → `createSyncClient`. No network, but the
 * full grant → subscribe → verify → publish path runs. Mirrors the vite-blog live test.
 */
function connectClient(hub: Hub, registry: ReturnType<typeof createModelRegistry>): SyncClient {
  const wsServer = createWsServer(hub, { secret: SECRET });
  const serverEmitter = new EventEmitter();
  const clientListeners = new Map<string, ((event: unknown) => void)[]>();

  const clientSocket: WebSocketLike = {
    readyState: 1, // OPEN — the sync client sends subscribe frames immediately
    send: (data: string) => serverEmitter.emit("message", data),
    close: () => serverEmitter.emit("close"),
    addEventListener: (type, listener) => {
      const arr = clientListeners.get(type) ?? [];
      arr.push(listener);
      clientListeners.set(type, arr);
    },
  };

  wsServer.handleConnection({
    send: (data: string) => clientListeners.get("message")?.forEach((l) => l({ data })),
    on: (event, cb) => serverEmitter.on(event, cb),
  });

  const transport = createWsClient({ url: "ws://test", WebSocketImpl: () => clientSocket });
  return createSyncClient({ registry, transport });
}

async function freshDb() {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const client = new PGlite();
  const db = drizzle(client);
  await client.exec(`
    CREATE TABLE cards (
      id text PRIMARY KEY, column_id text NOT NULL, title text NOT NULL,
      description text NOT NULL DEFAULT '', position text NOT NULL,
      created_at timestamp NOT NULL DEFAULT now()
    );
  `);
  return db;
}

describe("vite-kanban sync server", () => {
  it("registers the card resource", () => {
    expect(resources.byName("card")).toBe(cardResource);
  });

  it("update broadcasts a patch on the entity topic (a move)", async () => {
    const db = await freshDb();
    const hub = createInMemoryHub();
    const sync = createSync({ storage: drizzleStorage(db), hub, secret: "test-secret" });
    await sync.create(cardResource, { id: "k1", columnId: "todo", title: "T", description: "", position: "a0" });

    const received: ServerMessage[] = [];
    hub.onPublish((_conn, msg) => received.push(msg));
    hub.subscribe(0, ["e:card:k1"], Date.now() + 60_000);

    const row = await sync.update(cardResource, "k1", { columnId: "doing", position: "a1" });
    expect(row).toMatchObject({ columnId: "doing", position: "a1" });
    // The patch carries the full storage row — including the `created_at` column, which the model
    // schema omits (the UI never reads it, so the extra field on the wire is harmless).
    expect(received).toEqual([
      {
        v: 2,
        kind: "patch",
        name: "card",
        id: "k1",
        data: {
          id: "k1",
          columnId: "doing",
          title: "T",
          description: "",
          position: "a1",
          createdAt: expect.any(Date),
        },
      },
    ]);
  }, 30_000);

  it("create touches the board channel with a bare stale", async () => {
    const db = await freshDb();
    const hub = createInMemoryHub();
    const sync = createSync({ storage: drizzleStorage(db), hub, secret: "test-secret" });

    const received: ServerMessage[] = [];
    hub.onPublish((_conn, msg) => received.push(msg));
    hub.subscribe(0, ["c:board"], Date.now() + 60_000);

    await sync.create(
      cardResource,
      { id: "k2", columnId: "todo", title: "New", description: "", position: "a0" },
      { touch: [touch(boardState, {})] },
    );
    expect(received).toEqual([{ v: 2, kind: "stale", channel: "board" }]);
  }, 30_000);
});

describe("live end-to-end over the grant/WebSocket path", () => {
  it("serve → $grant lift → subscribe → sync.update patches the client's model store (a move)", async () => {
    const db = await freshDb();
    const hub = createInMemoryHub();
    const sync = createSync({ storage: drizzleStorage(db), hub, secret: SECRET });
    await sync.create(cardResource, { id: "k1", columnId: "todo", title: "Old", description: "", position: "a0" });

    const registry = createModelRegistry(cardModel);
    const syncClient = connectClient(hub, registry);

    // Server hands back the parsed shape + a signed grant, exactly as GET /board does.
    const served = sync.serve(
      boardState,
      {},
      { cards: [{ id: "k1", columnId: "todo", title: "Old", description: "", position: "a0" }] },
    );
    const { $grant, ...payload } = served;

    normalizeResult(registry, boardState.fields, payload);
    syncClient.subscribe($grant);

    // A move on another connection → entity patch flows hub → ws server → ws client → store, in place.
    const row = await sync.update(cardResource, "k1", { columnId: "done", position: "a1" });
    expect(row).toMatchObject({ columnId: "done", position: "a1" });
    expect(registry.model(cardModel).getValue("k1")).toMatchObject({ id: "k1", columnId: "done", position: "a1" });

    syncClient.stop();
  }, 30_000);

  it("serve → $grant lift → subscribe → create touch bumps the client's board counter (stale)", async () => {
    const db = await freshDb();
    const hub = createInMemoryHub();
    const sync = createSync({ storage: drizzleStorage(db), hub, secret: SECRET });
    await sync.create(cardResource, { id: "k1", columnId: "todo", title: "Old", description: "", position: "a0" });

    const registry = createModelRegistry(cardModel);
    const syncClient = connectClient(hub, registry);

    const channel = stateChannel(boardState, {})!;
    const counter = syncClient.channel(channel);
    let available = 0;
    const sub = counter.available$.subscribe((n) => (available = n));

    const served = sync.serve(
      boardState,
      {},
      { cards: [{ id: "k1", columnId: "todo", title: "Old", description: "", position: "a0" }] },
    );
    const { $grant, ...payload } = served;
    normalizeResult(registry, boardState.fields, payload);
    syncClient.subscribe($grant);

    // Another connection creates a card and touches the board channel; the client sees a stale bump —
    // this is exactly the signal the UI must consume to refetch. (available$ starts at 0.)
    await sync.create(
      cardResource,
      { id: "k2", columnId: "todo", title: "New", description: "", position: "a1" },
      { touch: [touch(boardState, {})] },
    );
    expect(available).toBe(1);

    sub.unsubscribe();
    syncClient.stop();
  }, 30_000);
});
