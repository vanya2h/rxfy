import type { PublishSink, Resource } from "rxfy-server";
import { createInMemoryHub, createServer, touch } from "rxfy-server";
import { describe, expect, it } from "vitest";
import { resources, todoResource } from "../src/resources.js";
import { todosChannel } from "./api.js";
import type { todos } from "./db.js";

// live.create/update accept Resource<TTable> with the table's raw row shape; the model omits
// `createdAt`, so re-view the resource as its raw-row writer resource.
const todoWriteResource = todoResource as unknown as Resource<typeof todos>;

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

// Generous timeouts: each test cold-starts a PGlite (wasm Postgres) instance, which is
// fast locally (~1s) but several times slower on CI runners.
describe("live server", () => {
  it("registers the todo resource", () => {
    expect(resources.byName("todo")).toBe(todoResource);
  });

  it("create persists and touches the todos channel with a bare stale", async () => {
    const db = await freshDb();
    const hub = createInMemoryHub();
    const live = createServer({ db, resources, hub });

    const received: ServerMessage[] = [];
    hub.onPublish((_conn, msg) => received.push(msg));
    hub.subscribe("client", ["c:todos"]);

    const row = await live.create(
      todoWriteResource,
      { id: "t1", title: "Hi", done: false },
      { touch: [touch(todosChannel, {})] },
    );
    expect(row).toMatchObject({ id: "t1", title: "Hi" });
    expect(received).toEqual([{ v: 2, kind: "stale", channel: "todos" }]);
  }, 30_000);

  it("update broadcasts a patch on the entity topic", async () => {
    const db = await freshDb();
    const hub = createInMemoryHub();
    const live = createServer({ db, resources, hub });
    await live.create(todoWriteResource, { id: "t1", title: "Hi", done: false });

    const received: ServerMessage[] = [];
    hub.onPublish((_conn, msg) => received.push(msg));
    hub.subscribe("client", ["e:todo:t1"]);

    const row = await live.update(todoWriteResource, "t1", { done: true });
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
