import { createModel, createModelRegistry } from "rxfy";
import { patch, type ServerMessage, session as sessionFrame, stale } from "rxfy-protocol";
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
  const hellos: Array<string | undefined> = [];
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

describe("createLiveClient session assignment", () => {
  // Fresh modules per test: the adopted session id is module-level state in session.ts.
  async function load() {
    const { vi } = await import("vitest");
    vi.resetModules();
    const [{ createLiveClient }, { getSessionId }] = await Promise.all([
      import("./live-client.js"),
      import("./session.js"),
    ]);
    return { createLiveClient, getSessionId };
  }

  function assignableTransport() {
    let handler: ((m: ServerMessage) => void) | undefined;
    const hellos: Array<string | undefined> = [];
    const transport: LiveTransport = {
      hello: (session) => hellos.push(session),
      onMessage: (h) => {
        handler = h;
      },
    };
    return { transport, hellos, deliver: (m: ServerMessage) => handler?.(m) };
  }

  it("hellos without a session when none is known, then adopts the server-assigned one", async () => {
    const { createLiveClient, getSessionId } = await load();
    const registry = createModelRegistry();
    const { transport, hellos, deliver } = assignableTransport();

    createLiveClient({ registry, transport });
    expect(hellos).toEqual([undefined]);

    deliver(sessionFrame("assigned-1"));
    expect(getSessionId()).toBe("assigned-1");
    // re-hello so the transport replays the assigned session on reconnect
    expect(hellos).toEqual([undefined, "assigned-1"]);
  });

  it("defaults the announced session to getSessionId() — the SSR-adopted id", async () => {
    (globalThis as { __RXFY_SSR__?: Array<{ session?: string }> }).__RXFY_SSR__ = [{ session: "ssr-1" }];
    try {
      const { createLiveClient } = await load();
      const registry = createModelRegistry();
      const { transport, hellos } = assignableTransport();
      createLiveClient({ registry, transport });
      expect(hellos).toEqual(["ssr-1"]);
    } finally {
      delete (globalThis as { __RXFY_SSR__?: unknown }).__RXFY_SSR__;
    }
  });
});
