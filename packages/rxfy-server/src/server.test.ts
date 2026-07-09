import { eq, getTableColumns } from "drizzle-orm";
import { type PgColumn, pgTable, text } from "drizzle-orm/pg-core";
import { array, createModel, createModelRegistry, defineState, normalizeResult } from "rxfy";
import { patch, type ServerMessage, stale } from "rxfy-protocol";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createInMemoryHub, type SessionId } from "./hub.js";
import { defineResource } from "./resource.js";
import { createResourceRegistry } from "./resource-registry.js";
import { createServer, touch } from "./server.js";
import { createTestDb } from "./test-db.js";

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

const postModel = createModel({
  schema: z.object({ id: z.string(), orgId: z.string(), title: z.string() }),
  getKey: (p: { id: string }) => p.id,
  name: "post",
});

const posts = defineResource({ table: postsTable, model: postModel });
const resources = createResourceRegistry([posts]);

function harness(db: Awaited<ReturnType<typeof createTestDb>>["db"]) {
  const hub = createInMemoryHub();
  const received: Array<{ session: SessionId; message: ServerMessage }> = [];
  hub.onPublish((session, message) => received.push({ session, message }));
  const live = createServer({ db, resources, hub });
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
    hub.subscribe("client", [`c:${channel}`]);
    await live.create(posts, { id: "1", orgId: "A", title: "Hi" }, { touch: [touch({ key: "post" }, { orgId: "A" })] });
    expect(received).toEqual([{ session: "client", message: { v: 2, kind: "stale", channel } }]);
  });
});

describe("createServer.update", () => {
  it("updates the row and publishes a patch on the entity topic", async () => {
    const { db } = await createTestDb(CREATE_POSTS);
    const { hub, live, received } = harness(db);
    await live.create(posts, { id: "1", orgId: "A", title: "Old" });
    hub.subscribe("client", ["e:post:1"]);
    const row = await live.update(posts, "1", { title: "New" });
    expect(row).toEqual({ id: "1", orgId: "A", title: "New" });
    expect(received).toEqual([
      {
        session: "client",
        message: { v: 2, kind: "patch", name: "post", id: "1", data: { id: "1", orgId: "A", title: "New" } },
      },
    ]);
  });

  it("emits patch then stale when an update also touches a channel", async () => {
    const { db } = await createTestDb(CREATE_POSTS);
    const { hub, live, received } = harness(db);
    await live.create(posts, { id: "1", orgId: "A", title: "Old" });
    hub.subscribe("client", ["e:post:1", "c:post:orgId=A"]);
    await live.update(posts, "1", { title: "New" }, { touch: [touch({ key: "post" }, { orgId: "A" })] });
    expect(received).toEqual([
      {
        session: "client",
        message: { v: 2, kind: "patch", name: "post", id: "1", data: { id: "1", orgId: "A", title: "New" } },
      },
      { session: "client", message: { v: 2, kind: "stale", channel: "post:orgId=A" } },
    ]);
  });

  it("returns undefined and publishes nothing when the row does not exist", async () => {
    const { db } = await createTestDb(CREATE_POSTS);
    const { hub, live, received } = harness(db);
    hub.subscribe("client", ["e:post:404"]);
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
    hub.subscribe("client", ["c:post:orgId=A"]);
    await live.delete(posts, "1", { touch: [touch({ key: "post" }, { orgId: "A" })] });
    expect(await db.select().from(postsTable)).toHaveLength(0);
    expect(received).toEqual([{ session: "client", message: { v: 2, kind: "stale", channel: "post:orgId=A" } }]);
  });
});

describe("createServer.touch", () => {
  it("publishes a stale signal for an explicit channel", async () => {
    const { db } = await createTestDb(CREATE_POSTS);
    const { hub, live, received } = harness(db);
    hub.subscribe("client", ["c:post:orgId=A"]);
    live.touch(touch({ key: "post" }, { orgId: "A" }));
    expect(received).toEqual([{ session: "client", message: { v: 2, kind: "stale", channel: "post:orgId=A" } }]);
  });
});

describe("createServer.serve", () => {
  it("returns data unchanged and registers the session's entity + channel subscriptions", async () => {
    const { db } = await createTestDb(CREATE_POSTS);
    const { hub, live } = harness(db);
    const seen: string[] = [];
    hub.onPublish((session, message) => seen.push(`${session}:${message.kind}`));

    const state = defineState({ key: "posts", params: z.object({}), model: { posts: array(postModel) } });
    const data = { posts: [{ id: "1", orgId: "A", title: "a" }] };
    const result = live.serve("sess-1", state, {}, data);
    expect(result).toBe(data); // pass-through, same reference

    hub.publish("e:post:1", patch("post", "1", { id: "1", title: "b" }));
    hub.publish("c:posts", stale("posts"));
    expect(seen).toEqual(["sess-1:patch", "sess-1:stale"]);
  });

  it("accepts a fetch Request and reads the session header", async () => {
    const { db } = await createTestDb(CREATE_POSTS);
    const { hub, live } = harness(db);
    const req = new Request("http://x/", { headers: { "x-rxfy-session": "sess-2" } });
    const state = defineState({ key: "posts", params: z.object({}), model: { posts: array(postModel) } });
    live.serve(req, state, {}, { posts: [{ id: "1", orgId: "A", title: "a" }] });
    const seen: string[] = [];
    hub.onPublish((session) => seen.push(session));
    hub.publish("c:posts", stale("posts"));
    expect(seen).toEqual(["sess-2"]);
  });

  it("is a no-op without a session", async () => {
    const { db } = await createTestDb(CREATE_POSTS);
    const { live } = harness(db);
    const req = new Request("http://x/");
    const state = defineState({ key: "posts", params: z.object({}), model: { posts: array(postModel) } });
    const data = { posts: [] as Array<{ id: string; orgId: string; title: string }> };
    expect(live.serve(req, state, {}, data)).toBe(data);
  });
});

describe("createServer.hydration", () => {
  it("mints a session, registers the render registry, and embeds the session in the script", async () => {
    const { db } = await createTestDb(CREATE_POSTS);
    const { hub, live } = harness(db);
    const registry = createModelRegistry();
    normalizeResult(registry, { posts: array(postModel) }, { posts: [{ id: "1", orgId: "A", title: "a" }] });
    registry.channels.add("posts");

    const script = live.hydration(registry);
    expect(script).toContain("__RXFY_SSR__");
    expect(script).toContain("session");

    const session = /"session":"([^"]+)"/.exec(script)?.[1];
    expect(session).toBeTruthy();

    const seen: string[] = [];
    hub.onPublish((s) => seen.push(s));
    hub.publish("e:post:1", patch("post", "1", { id: "1", title: "b" }));
    hub.publish("c:posts", stale("posts"));
    expect(seen).toEqual([session, session]);
  });

  it("skips models with no backing resource", async () => {
    const { db } = await createTestDb(CREATE_POSTS);
    const { hub, live } = harness(db);
    const registry = createModelRegistry();
    const localModel = createModel({
      schema: z.object({ id: z.string() }),
      getKey: (x) => x.id,
      name: "local-only",
    });
    registry.model(localModel).setMany([{ id: "9" }]);
    live.hydration(registry);
    const seen: string[] = [];
    hub.onPublish((s) => seen.push(s));
    hub.publish("e:local-only:9", stale("x"));
    expect(seen).toEqual([]);
  });
});

describe("dynamic PK where", () => {
  it("updates by a non-id primary key", async () => {
    const widgetsTable = pgTable("widgets", { sku: text("sku").primaryKey(), label: text("label").notNull() });
    const { db } = await createTestDb(`CREATE TABLE widgets (sku text PRIMARY KEY, label text NOT NULL);`);
    const widgets = defineResource({ table: widgetsTable, name: "widget" });
    const reg = createResourceRegistry([widgets]);
    const hub = createInMemoryHub();
    const live = createServer({ db, resources: reg, hub });
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
