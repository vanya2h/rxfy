import { eq, getTableColumns } from "drizzle-orm";
import { type PgColumn, pgTable, text } from "drizzle-orm/pg-core";
import { array, createModel, createModelRegistry, defineState, stateChannel } from "rxfy";
import { type ServerMessage } from "rxfy-protocol";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { verifyGrant } from "./grant.js";
import { type ConnId, createInMemoryHub, type Hub } from "./hub.js";
import { defineResource } from "./resource.js";
import { createResourceRegistry } from "./resource-registry.js";
import { createServer } from "./server.js";
import { touch } from "./state-channel.js";
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

// Any comfortably-future expiry: the hub only delivers to subscriptions whose `exp` is still ahead
// of `now()` at publish time.
const EXP = () => Date.now() + 60_000;
const CONN: ConnId = 1;

function harness(db: Awaited<ReturnType<typeof createTestDb>>["db"]) {
  const hub = createInMemoryHub();
  const received: Array<{ conn: ConnId; message: ServerMessage }> = [];
  hub.onPublish((conn, message) => received.push({ conn, message }));
  const live = createServer({ db, resources, hub, secret: "s" });
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
    hub.subscribe(CONN, [`c:${channel}`], EXP());
    await live.create(posts, { id: "1", orgId: "A", title: "Hi" }, { touch: [touch({ key: "post" }, { orgId: "A" })] });
    expect(received).toEqual([{ conn: CONN, message: { v: 2, kind: "stale", channel } }]);
  });
});

describe("createServer.update", () => {
  it("updates the row and publishes a patch on the entity topic", async () => {
    const { db } = await createTestDb(CREATE_POSTS);
    const { hub, live, received } = harness(db);
    await live.create(posts, { id: "1", orgId: "A", title: "Old" });
    hub.subscribe(CONN, ["e:post:1"], EXP());
    const row = await live.update(posts, "1", { title: "New" });
    expect(row).toEqual({ id: "1", orgId: "A", title: "New" });
    expect(received).toEqual([
      {
        conn: CONN,
        message: { v: 2, kind: "patch", name: "post", id: "1", data: { id: "1", orgId: "A", title: "New" } },
      },
    ]);
  });

  it("emits patch then stale when an update also touches a channel", async () => {
    const { db } = await createTestDb(CREATE_POSTS);
    const { hub, live, received } = harness(db);
    await live.create(posts, { id: "1", orgId: "A", title: "Old" });
    hub.subscribe(CONN, ["e:post:1", "c:post:orgId=A"], EXP());
    await live.update(posts, "1", { title: "New" }, { touch: [touch({ key: "post" }, { orgId: "A" })] });
    expect(received).toEqual([
      {
        conn: CONN,
        message: { v: 2, kind: "patch", name: "post", id: "1", data: { id: "1", orgId: "A", title: "New" } },
      },
      { conn: CONN, message: { v: 2, kind: "stale", channel: "post:orgId=A" } },
    ]);
  });

  it("returns undefined and publishes nothing when the row does not exist", async () => {
    const { db } = await createTestDb(CREATE_POSTS);
    const { hub, live, received } = harness(db);
    hub.subscribe(CONN, ["e:post:404"], EXP());
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
    hub.subscribe(CONN, ["c:post:orgId=A"], EXP());
    await live.delete(posts, "1", { touch: [touch({ key: "post" }, { orgId: "A" })] });
    expect(await db.select().from(postsTable)).toHaveLength(0);
    expect(received).toEqual([{ conn: CONN, message: { v: 2, kind: "stale", channel: "post:orgId=A" } }]);
  });
});

describe("createServer.touch", () => {
  it("publishes a stale signal for an explicit channel", async () => {
    const { db } = await createTestDb(CREATE_POSTS);
    const { hub, live, received } = harness(db);
    hub.subscribe(CONN, ["c:post:orgId=A"], EXP());
    live.touch(touch({ key: "post" }, { orgId: "A" }));
    expect(received).toEqual([{ conn: CONN, message: { v: 2, kind: "stale", channel: "post:orgId=A" } }]);
  });
});

const postsState = defineState({ key: "posts", params: z.object({}), model: { posts: array(postModel) } });

describe("createServer.serve", () => {
  it("parses and attaches a verifiable $grant carrying the channel and entities", async () => {
    const { db } = await createTestDb(CREATE_POSTS);
    const live = createServer({ db, resources, hub: createInMemoryHub(), secret: "s", grantTtlMs: 60_000 });
    const rawRow = { id: "1", orgId: "A", title: "a" };
    const result = live.serve(postsState, {}, { posts: [rawRow] });
    expect(result.posts[0]!.id).toBe(rawRow.id); // parsed shape intact
    const claims = verifyGrant((result as { $grant: string }).$grant, { secret: "s" });
    expect(claims?.channel).toBe(stateChannel(postsState, {}));
    expect(claims?.entities).toEqual(["post:1"]);
  });

  it("parses the input shape: unknown keys are stripped from entities", async () => {
    const { db } = await createTestDb(CREATE_POSTS);
    const { live } = harness(db);
    const raw = { posts: [{ id: "1", orgId: "A", title: "a", createdAt: new Date() }] };
    const result = live.serve(postsState, {}, raw);
    expect(result.posts).toEqual([{ id: "1", orgId: "A", title: "a" }]);
  });

  it("never touches the hub", async () => {
    const { db } = await createTestDb(CREATE_POSTS);
    const hub = createInMemoryHub();
    const calls: string[] = [];
    const spyHub = { ...hub, subscribe: () => calls.push("subscribe") } as Hub;
    const live = createServer({ db, resources, hub: spyHub, secret: "s" });
    live.serve(postsState, {}, { posts: [{ id: "1", orgId: "A", title: "a" }] });
    expect(calls).toHaveLength(0);
  });
});

describe("createServer.renew", () => {
  it("reissues a valid grant preserving channel and entities, and rejects garbage", async () => {
    const { db } = await createTestDb(CREATE_POSTS);
    const live = createServer({ db, resources, hub: createInMemoryHub(), secret: "s", grantTtlMs: 1_000 });
    const grant = (live.serve(postsState, {}, { posts: [{ id: "1", orgId: "A", title: "a" }] }) as { $grant: string })
      .$grant;
    const renewed = live.renew(grant);
    expect(renewed).not.toBeNull();
    const claims = verifyGrant(renewed!, { secret: "s" });
    expect(claims?.channel).toBe(stateChannel(postsState, {}));
    expect(claims?.entities).toEqual(["post:1"]);
    expect(live.renew("garbage")).toBeNull();
  });
});

describe("createServer.hydration", () => {
  it("embeds the registry's logged grants verbatim", async () => {
    const { db } = await createTestDb(CREATE_POSTS);
    const { live } = harness(db);
    const registry = createModelRegistry();
    registry.grants.add("grant-A");
    registry.grants.add("grant-B");
    const script = live.hydration(registry);
    expect(script).toContain("__RXFY_SSR__");
    expect(script).toContain("grant-A");
    expect(script).toContain("grant-B");
  });
});

describe("dynamic PK where", () => {
  it("updates by a non-id primary key", async () => {
    const widgetsTable = pgTable("widgets", { sku: text("sku").primaryKey(), label: text("label").notNull() });
    const { db } = await createTestDb(`CREATE TABLE widgets (sku text PRIMARY KEY, label text NOT NULL);`);
    const widgets = defineResource({ table: widgetsTable, name: "widget" });
    const reg = createResourceRegistry([widgets]);
    const hub = createInMemoryHub();
    const live = createServer({ db, resources: reg, hub, secret: "s" });
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
