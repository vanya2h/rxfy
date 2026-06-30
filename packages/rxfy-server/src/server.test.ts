import { eq, getTableColumns } from "drizzle-orm";
import { type PgColumn, pgTable, text } from "drizzle-orm/pg-core";
import { createModelRegistry } from "rxfy";
import { type ServerMessage } from "rxfy-protocol";
import { describe, expect, it } from "vitest";
import { type ConnId, createInMemoryHub } from "./hub.js";
import { defineResource } from "./resource.js";
import { createResourceRegistry } from "./resource-registry.js";
import { createServer, touch } from "./server.js";
import { createTestDb } from "./test-db.js";
import { createTopicKeyer } from "./topic-key.js";

const postsTable = pgTable("posts", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  title: text("title").notNull(),
});

const CREATE_POSTS = `
  CREATE TABLE posts (
    id text PRIMARY KEY,
    org_id text NOT NULL,
    title text NOT NULL
  );
`;

const posts = defineResource({ table: postsTable, name: "post" });
const resources = createResourceRegistry([posts]);
const keyer = createTopicKeyer({ secret: "test-secret", windowMs: 60_000, now: () => 600_000 });

function harness(db: Awaited<ReturnType<typeof createTestDb>>["db"]) {
  const hub = createInMemoryHub();
  const received: Array<{ conn: ConnId; message: ServerMessage }> = [];
  hub.onPublish((conn, message) => received.push({ conn, message }));
  const live = createServer({ db, resources, hub, keyer });
  return { hub, live, received };
}

describe("createServer.create", () => {
  it("inserts the row and returns it", async () => {
    const { db } = await createTestDb(CREATE_POSTS);
    const { live } = harness(db);
    const row = await live.create(posts, { id: "1", orgId: "A", title: "Hello" });
    expect(row).toEqual({ id: "1", orgId: "A", title: "Hello" });
    expect(await db.select().from(postsTable)).toHaveLength(1);
  });

  it("touches the given channels with a bare stale signal", async () => {
    const { db } = await createTestDb(CREATE_POSTS);
    const { hub, live, received } = harness(db);
    const channel = "post:orgId=A";
    hub.subscribe("client", [keyer.current(channel)]);
    await live.create(posts, { id: "1", orgId: "A", title: "Hi" }, { touch: [touch({ key: "post" }, { orgId: "A" })] });
    expect(received).toEqual([{ conn: "client", message: { v: 1, kind: "stale", channel } }]);
  });
});

describe("createServer.update", () => {
  it("updates the row and publishes a patch on the entity topic", async () => {
    const { db } = await createTestDb(CREATE_POSTS);
    const { hub, live, received } = harness(db);
    await live.create(posts, { id: "1", orgId: "A", title: "Old" });
    hub.subscribe("client", [keyer.current("post:1")]);
    const row = await live.update(posts, "1", { title: "New" });
    expect(row).toEqual({ id: "1", orgId: "A", title: "New" });
    expect(received).toEqual([
      {
        conn: "client",
        message: { v: 1, kind: "patch", name: "post", id: "1", data: { id: "1", orgId: "A", title: "New" } },
      },
    ]);
  });

  it("emits patch then stale when an update also touches a channel", async () => {
    const { db } = await createTestDb(CREATE_POSTS);
    const { hub, live, received } = harness(db);
    await live.create(posts, { id: "1", orgId: "A", title: "Old" });
    hub.subscribe("client", [keyer.current("post:1"), keyer.current("post:orgId=A")]);
    await live.update(posts, "1", { title: "New" }, { touch: [touch({ key: "post" }, { orgId: "A" })] });
    expect(received).toEqual([
      {
        conn: "client",
        message: { v: 1, kind: "patch", name: "post", id: "1", data: { id: "1", orgId: "A", title: "New" } },
      },
      { conn: "client", message: { v: 1, kind: "stale", channel: "post:orgId=A" } },
    ]);
  });

  it("returns undefined and publishes nothing when the row does not exist", async () => {
    const { db } = await createTestDb(CREATE_POSTS);
    const { hub, live, received } = harness(db);
    hub.subscribe("client", [keyer.current("post:404")]);
    const row = await live.update(posts, "404", { title: "X" });
    expect(row).toBeUndefined();
    expect(received).toEqual([]);
  });
});

describe("createServer.delete", () => {
  it("deletes the row and touches channels", async () => {
    const { db } = await createTestDb(CREATE_POSTS);
    const { hub, live, received } = harness(db);
    await live.create(posts, { id: "1", orgId: "A", title: "X" });
    hub.subscribe("client", [keyer.current("post:orgId=A")]);
    await live.delete(posts, "1", { touch: [touch({ key: "post" }, { orgId: "A" })] });
    expect(await db.select().from(postsTable)).toHaveLength(0);
    expect(received).toEqual([{ conn: "client", message: { v: 1, kind: "stale", channel: "post:orgId=A" } }]);
  });
});

describe("createServer.touch", () => {
  it("publishes a stale signal for an explicit channel", async () => {
    const { db } = await createTestDb(CREATE_POSTS);
    const { hub, live, received } = harness(db);
    hub.subscribe("client", [keyer.current("post:orgId=A")]);
    live.touch(touch({ key: "post" }, { orgId: "A" }));
    expect(received).toEqual([{ conn: "client", message: { v: 1, kind: "stale", channel: "post:orgId=A" } }]);
  });
});

describe("createServer.grant", () => {
  it("mints an id per present entity and per state channel", async () => {
    const { db } = await createTestDb(CREATE_POSTS);
    const { live } = harness(db);

    const registry = createModelRegistry();
    registry.model(posts.model).setMany([
      { id: "1", orgId: "A", title: "a" },
      { id: "2", orgId: "A", title: "b" },
    ]);

    const grants = live.grant(registry, {
      entities: posts,
      states: [{ state: { key: "post", window: ["page"] }, params: { orgId: "A", page: 0 } }],
    });

    expect(grants.entities).toEqual({
      "post:1": keyer.current("post:1"),
      "post:2": keyer.current("post:2"),
    });
    expect(grants.channels).toEqual({
      "post:orgId=A": keyer.current("post:orgId=A"),
    });
  });

  it("returns empty maps when nothing is specified", async () => {
    const { db } = await createTestDb(CREATE_POSTS);
    const { live } = harness(db);
    const registry = createModelRegistry();
    expect(live.grant(registry, {})).toEqual({ entities: {}, channels: {} });
  });
});

describe("dynamic PK where", () => {
  it("updates by a non-id primary key", async () => {
    const widgetsTable = pgTable("widgets", { sku: text("sku").primaryKey(), label: text("label").notNull() });
    const { db } = await createTestDb(`CREATE TABLE widgets (sku text PRIMARY KEY, label text NOT NULL);`);
    const widgets = defineResource({ table: widgetsTable, name: "widget" });
    const reg = createResourceRegistry([widgets]);
    const hub = createInMemoryHub();
    const live = createServer({ db, resources: reg, hub, keyer });
    await live.create(widgets, { sku: "S1", label: "L" });
    const row = await live.update(widgets, "S1", { label: "L2" });
    expect(row).toEqual({ sku: "S1", label: "L2" });
    const [direct] = await db
      .select()
      .from(widgetsTable)
      .where(eq(getTableColumns(widgetsTable)["sku"] as PgColumn, "S1"));
    expect(direct!.label).toBe("L2");
  });
});
