import { createModel, createModelRegistry } from "rxfy";
import { patch, type ServerMessage, stale } from "rxfy-protocol";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createLiveClient, type LiveTransport } from "./live-client.js";

const postModel = createModel({
  schema: z.object({ id: z.string(), title: z.string() }),
  getKey: (p) => p.id,
  name: "post",
});

function fakeTransport() {
  let handler: ((m: ServerMessage) => void) | undefined;
  const subscribed: string[] = [];
  const transport: LiveTransport = {
    subscribe: (ids) => subscribed.push(...ids),
    unsubscribe: () => {},
    onMessage: (h) => {
      handler = h;
    },
  };
  return { transport, subscribed, deliver: (m: ServerMessage) => handler?.(m) };
}

describe("createLiveClient", () => {
  it("applies an inbound patch to the matching store", () => {
    const registry = createModelRegistry();
    registry.model(postModel).setMany([{ id: "1", title: "old" }]);
    const { transport, deliver } = fakeTransport();
    createLiveClient({ registry, transport, grants: { entities: { "post:1": "eid" }, channels: {} } });
    deliver(patch("post", "1", { id: "1", title: "new" }));
    expect(registry.model(postModel).getValue("1")).toEqual({ id: "1", title: "new" });
  });

  it("subscribes to a held entity's grant id via added$", () => {
    const registry = createModelRegistry();
    registry.model(postModel).setMany([{ id: "1", title: "a" }]);
    const { transport, subscribed } = fakeTransport();
    createLiveClient({ registry, transport, grants: { entities: { "post:1": "eid" }, channels: {} } });
    expect(subscribed).toContain("eid");
  });

  it("counts stale signals per channel and resets", () => {
    const registry = createModelRegistry();
    const { transport, subscribed, deliver } = fakeTransport();
    const live = createLiveClient({
      registry,
      transport,
      grants: { entities: {}, channels: { "posts:orgId=A": "cid" } },
    });
    const ch = live.channel("posts:orgId=A");
    expect(subscribed).toContain("cid");
    const seen: number[] = [];
    ch.available$.subscribe((v) => seen.push(v));
    deliver(stale("posts:orgId=A"));
    deliver(stale("posts:orgId=A"));
    ch.reset();
    expect(seen).toEqual([0, 1, 2, 0]);
  });

  it("ignores stale for a channel with no local counter", () => {
    const registry = createModelRegistry();
    const { transport, deliver } = fakeTransport();
    createLiveClient({ registry, transport, grants: { entities: {}, channels: {} } });
    expect(() => deliver(stale("unknown"))).not.toThrow();
  });

  it("subscribes pending channels when grants arrive later", () => {
    const registry = createModelRegistry();
    const { transport, subscribed } = fakeTransport();
    const live = createLiveClient({ registry, transport });
    live.channel("posts:orgId=A");
    expect(subscribed).toEqual([]);
    live.addGrants({ entities: {}, channels: { "posts:orgId=A": "cid" } });
    expect(subscribed).toContain("cid");
  });

  it("ignores a patch for a store that is not in the registry (no-op)", () => {
    const registry = createModelRegistry();
    const { transport, deliver } = fakeTransport();
    createLiveClient({ registry, transport, grants: { entities: {}, channels: {} } });
    expect(() => deliver(patch("nonexistent", "1", { id: "1" }))).not.toThrow();
  });
});
