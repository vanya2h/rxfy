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
  const hellos: string[] = [];
  const transport: LiveTransport = {
    hello: (session) => hellos.push(session),
    onMessage: (h) => {
      handler = h;
    },
  };
  return { transport, hellos, deliver: (m: ServerMessage) => handler?.(m) };
}

describe("createLiveClient", () => {
  it("announces the session via hello", () => {
    const registry = createModelRegistry();
    const { transport, hellos } = fakeTransport();
    createLiveClient({ registry, transport, session: "sess-1" });
    expect(hellos).toEqual(["sess-1"]);
  });

  it("applies an inbound patch to the matching store", () => {
    const registry = createModelRegistry();
    registry.model(postModel).setMany([{ id: "1", title: "old" }]);
    const { transport, deliver } = fakeTransport();
    createLiveClient({ registry, transport, session: "sess-1" });
    deliver(patch("post", "1", { id: "1", title: "new" }));
    expect(registry.model(postModel).getValue("1")).toEqual({ id: "1", title: "new" });
  });

  it("counts stale signals per channel and resets", () => {
    const registry = createModelRegistry();
    const { transport, deliver } = fakeTransport();
    const live = createLiveClient({ registry, transport, session: "sess-1" });
    const ch = live.channel("posts:orgId=A");
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
    createLiveClient({ registry, transport, session: "sess-1" });
    expect(() => deliver(stale("unknown"))).not.toThrow();
  });

  it("ignores a patch for a store that is not in the registry (no-op)", () => {
    const registry = createModelRegistry();
    const { transport, deliver } = fakeTransport();
    createLiveClient({ registry, transport, session: "sess-1" });
    expect(() => deliver(patch("nonexistent", "1", { id: "1" }))).not.toThrow();
  });
});
