import { array, createModel, createModelRegistry, defineState, stateChannel } from "rxfy";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { verifyGrant } from "./grant.js";
import { channelSubscription, createInMemoryHub, entitySubscription } from "./hub.js";
import { touch } from "./state-channel.js";
import type { Resource, SyncStorage } from "./storage.js";
import { createSync } from "./sync.js";

const postModel = createModel({
  schema: z.object({ id: z.string(), title: z.string() }),
  getKey: (p) => p.id,
  name: "post",
});

const postsState = defineState({ key: "posts", params: z.object({}), model: { posts: array(postModel) } });

type Binding = { name: string };
const posts: Resource<{ id: string; title: string }, { id: string; title: string }, Binding> = {
  name: "post",
  model: postModel,
  getKey: (r) => r.id,
  binding: { name: "post" },
};

function fakeStorage(): SyncStorage<Binding> {
  return {
    create: vi.fn(async (_b, values) => values),
    update: vi.fn(async (_b, id, values) => ({ id, title: "x", ...(values as object) })),
    delete: vi.fn(async () => {}),
  };
}

describe("createSync", () => {
  it("create persists via storage and publishes a patch on the entity topic", async () => {
    const hub = createInMemoryHub();
    const seen: unknown[] = [];
    hub.onPublish((_c, m) => seen.push(m));
    hub.subscribe(1, [entitySubscription("post", "p1")], Date.now() + 60_000);
    const sync = createSync({ storage: fakeStorage(), hub, secret: "s" });

    const row = await sync.create(posts, { id: "p1", title: "Hi" });
    expect(row).toEqual({ id: "p1", title: "Hi" });
    expect(seen).toEqual([{ v: 2, kind: "patch", name: "post", id: "p1", data: { id: "p1", title: "Hi" } }]);
  });

  it("update returning undefined publishes nothing", async () => {
    const hub = createInMemoryHub();
    const seen: unknown[] = [];
    hub.onPublish((_c, m) => seen.push(m));
    const storage: SyncStorage<Binding> = { ...fakeStorage(), update: async () => undefined };
    const sync = createSync({ storage, hub, secret: "s" });
    expect(await sync.update(posts, "nope", { title: "x" })).toBeUndefined();
    expect(seen).toEqual([]);
  });

  it("touch publishes a stale on the channel", async () => {
    const hub = createInMemoryHub();
    const seen: unknown[] = [];
    hub.onPublish((_c, m) => seen.push(m));
    hub.subscribe(1, [channelSubscription("post:orgId=A")], Date.now() + 60_000);
    const sync = createSync({ storage: fakeStorage(), hub, secret: "s" });
    sync.touch(touch({ key: "post" }, { orgId: "A" }));
    expect(seen).toEqual([{ v: 2, kind: "stale", channel: "post:orgId=A" }]);
  });

  it("serve parses the payload and signs a grant carrying the channel + entities", () => {
    const sync = createSync({ storage: fakeStorage(), hub: createInMemoryHub(), secret: "s", grantTtlMs: 60_000 });
    const served = sync.serve(postsState, {}, { posts: [{ id: "p1", title: "a", extra: "stripped" }] });
    expect(served.posts).toEqual([{ id: "p1", title: "a" }]); // parsed: unknown keys stripped
    const claims = verifyGrant(served.$grant, { secret: "s" });
    expect(claims?.channel).toBe(stateChannel(postsState, {}));
    expect(claims?.entities).toEqual(["post:p1"]);
  });

  it("renew reissues the same channel + entities and rejects garbage", () => {
    const sync = createSync({ storage: fakeStorage(), hub: createInMemoryHub(), secret: "s" });
    const { $grant } = sync.serve(postsState, {}, { posts: [{ id: "p1", title: "a" }] });
    const renewed = sync.renew($grant)!;
    expect(renewed).not.toBeNull();
    const claims = verifyGrant(renewed, { secret: "s" });
    expect(claims?.channel).toBe(stateChannel(postsState, {}));
    expect(claims?.entities).toEqual(["post:p1"]);
    expect(sync.renew("garbage")).toBeNull();
  });

  it("hydration embeds the registry's logged grants verbatim", () => {
    const sync = createSync({ storage: fakeStorage(), hub: createInMemoryHub(), secret: "s" });
    const registry = createModelRegistry();
    registry.grants.add("grant-A");
    expect(sync.hydration(registry)).toContain("grant-A");
  });
});
