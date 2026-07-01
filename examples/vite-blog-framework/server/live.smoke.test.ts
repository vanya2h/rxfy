import type { PublishSink, StateChannelDescriptor } from "rxfy-server";
import { createInMemoryHub, createServer, createTopicKeyer, touch } from "rxfy-server";
import { describe, expect, it } from "vitest";
import { commentResource, postResource, resources, userResource } from "../src/blog/resources.js";
import { postsState } from "../src/blog/states.js";

/** Derive ServerMessage from the PublishSink type exported by rxfy-server. */
type ServerMessage = Parameters<PublishSink>[1];

// StateDescriptor.key is `string | undefined` in rxfy but StateChannelDescriptor requires `string`.
// Both states have a key supplied at definition time; cast to satisfy rxfy-server's narrower type.
const postsChannel = postsState as unknown as StateChannelDescriptor;

async function freshDb() {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const client = new PGlite();
  const db = drizzle(client);
  await client.exec(`
    CREATE TABLE users (id text PRIMARY KEY, name text NOT NULL, email text NOT NULL);
    CREATE TABLE posts (id text PRIMARY KEY, author_id text NOT NULL, title text NOT NULL, body text NOT NULL, created_at timestamp NOT NULL DEFAULT now());
    CREATE TABLE comments (id text PRIMARY KEY, post_id text NOT NULL, author text NOT NULL, body text NOT NULL, created_at timestamp NOT NULL DEFAULT now());
  `);
  return db;
}

describe("vite-blog-framework live server", () => {
  it("registers the three resources", () => {
    expect(resources.byName("post")).toBe(postResource);
    expect(resources.byName("user")).toBe(userResource);
    expect(resources.byName("comment")).toBe(commentResource);
  });

  it("create persists and touches the posts channel with a bare stale", async () => {
    const db = await freshDb();
    const hub = createInMemoryHub();
    const keyer = createTopicKeyer({ secret: "t", windowMs: 60_000, now: () => 0 });
    const live = createServer({ db, resources, hub, keyer });

    const received: ServerMessage[] = [];
    hub.onPublish((_conn, msg) => received.push(msg));
    hub.subscribe("client", [keyer.current("posts")]);

    const row = await live.create(
      postResource,
      { id: "p1", authorId: "u1", title: "Hi", body: "B" },
      { touch: [touch(postsChannel, {})] },
    );
    expect(row).toMatchObject({ id: "p1", title: "Hi" });
    expect(received).toEqual([{ v: 1, kind: "stale", channel: "posts" }]);
  });

  it("update broadcasts a patch on the entity topic", async () => {
    const db = await freshDb();
    const hub = createInMemoryHub();
    const keyer = createTopicKeyer({ secret: "t", windowMs: 60_000, now: () => 0 });
    const live = createServer({ db, resources, hub, keyer });
    await live.create(postResource, { id: "p1", authorId: "u1", title: "Old", body: "B" });

    const received: ServerMessage[] = [];
    hub.onPublish((_conn, msg) => received.push(msg));
    hub.subscribe("client", [keyer.current("post:p1")]);

    const row = await live.update(postResource, "p1", { title: "New" });
    expect(row).toMatchObject({ title: "New" });
    expect(received).toEqual([
      {
        v: 1,
        kind: "patch",
        name: "post",
        id: "p1",
        data: { id: "p1", authorId: "u1", title: "New", body: "B", createdAt: expect.any(Date) },
      },
    ]);
  });
});
