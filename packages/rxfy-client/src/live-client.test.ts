import { createModel, createModelRegistry } from "rxfy";
import { type ClientMessage, patch, type ServerMessage, stale, subscribe } from "rxfy-protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createLiveClient, type LiveTransport } from "./live-client.js";

const postModel = createModel({
  schema: z.object({ id: z.string(), title: z.string() }),
  getKey: (p) => p.id,
  name: "post",
});

/** The client only decodes; build unverified test tokens (base64url payload, like a real JWT). */
const token = (exp: number, ch = "c"): string =>
  `h.${Buffer.from(JSON.stringify({ ch, exp })).toString("base64url")}.s`;

function fakeTransport() {
  let onMessage: ((m: ServerMessage) => void) | undefined;
  let onOpen: (() => void) | undefined;
  const sent: ClientMessage[] = [];
  const transport: LiveTransport = {
    send: (m) => sent.push(m),
    onMessage: (h) => {
      onMessage = h;
    },
    onOpen: (h) => {
      onOpen = h;
    },
  };
  return {
    transport,
    sent,
    deliver: (m: ServerMessage) => onMessage?.(m),
    open: () => onOpen?.(),
  };
}

describe("createLiveClient", () => {
  it("subscribe() sends the frame, records the entry, and replays on onOpen", () => {
    const registry = createModelRegistry();
    const { transport, sent, open } = fakeTransport();
    const live = createLiveClient({ registry, transport });

    const grant = token(Date.now() + 60_000);
    live.subscribe(grant, ["todo:1"]);
    expect(sent).toEqual([subscribe(grant, ["todo:1"])]);

    open();
    expect(sent).toEqual([subscribe(grant, ["todo:1"]), subscribe(grant, ["todo:1"])]);
  });

  it("adopts SSR grants on startup, attaching current registry entities to the first frame", () => {
    (globalThis as { __RXFY_SSR__?: Array<{ grants?: string[] }> }).__RXFY_SSR__ = [
      { grants: [token(Date.now() + 60_000, "a")] },
      { grants: [token(Date.now() + 60_000, "b")] },
    ];
    try {
      const registry = createModelRegistry();
      registry.model(postModel).setMany([{ id: "1", title: "one" }]);
      const { transport, sent } = fakeTransport();
      createLiveClient({ registry, transport });

      expect(sent).toHaveLength(2);
      expect((sent[0] as { entities: string[] }).entities).toEqual(["post:1"]);
      expect((sent[1] as { entities: string[] }).entities).toEqual([]);
    } finally {
      delete (globalThis as { __RXFY_SSR__?: unknown }).__RXFY_SSR__;
    }
  });

  it("renews grants before expiry via renewUrl and re-subscribes", async () => {
    vi.useFakeTimers();
    try {
      const registry = createModelRegistry();
      const { transport, sent } = fakeTransport();
      const now = () => 1_000_000;
      const expiring = token(now() + 30_000, "c"); // exp - lead (60s) < now -> due immediately
      const fresh = token(now() + 120_000, "c");

      const fetchMock = vi.fn(
        async (_url: string, _init?: RequestInit) =>
          ({ json: async () => ({ grants: [fresh] }) }) as unknown as Response,
      );
      vi.stubGlobal("fetch", fetchMock);

      const live = createLiveClient({ registry, transport, renewUrl: "/live/renew", now });
      live.subscribe(expiring, ["post:1"]);
      expect(sent).toEqual([subscribe(expiring, ["post:1"])]);

      await vi.runOnlyPendingTimersAsync();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
      expect(body).toEqual({ grants: [expiring] });
      expect(sent[sent.length - 1]).toEqual(subscribe(fresh, ["post:1"]));

      live.stop();
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("a failed renewal drops the entry silently", async () => {
    vi.useFakeTimers();
    try {
      const registry = createModelRegistry();
      const { transport, sent } = fakeTransport();
      const now = () => 1_000_000;
      const expiring = token(now() + 30_000, "c");

      const fetchMock = vi.fn(
        async (_url: string, _init?: RequestInit) =>
          ({ json: async () => ({ grants: [null] }) }) as unknown as Response,
      );
      vi.stubGlobal("fetch", fetchMock);

      const live = createLiveClient({ registry, transport, renewUrl: "/live/renew", now });
      live.subscribe(expiring, ["post:1"]);
      const before = sent.length;

      await vi.runOnlyPendingTimersAsync(); // must not throw

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(sent).toHaveLength(before); // no re-subscribe

      live.stop();
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("a network-failed renewal backs off instead of retrying every tick", async () => {
    vi.useFakeTimers();
    try {
      const registry = createModelRegistry();
      const { transport, sent } = fakeTransport();
      const now = () => 1_000_000;
      const renewLeadMs = 60_000;
      const expiring = token(now() + 30_000, "c"); // exp - lead < now -> due immediately

      const fetchMock = vi.fn(async (_url: string, _init?: RequestInit): Promise<Response> => {
        throw new Error("offline");
      });
      vi.stubGlobal("fetch", fetchMock);

      const live = createLiveClient({ registry, transport, renewUrl: "/live/renew", renewLeadMs, now });
      live.subscribe(expiring, ["post:1"]);
      const before = sent.length;

      // First renewal attempt (scheduled at ~0) fires and its fetch rejects — must not throw.
      await vi.advanceTimersByTimeAsync(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(sent).toHaveLength(before); // no re-subscribe

      // A near-immediate tick must NOT trigger another attempt — the retry is backed off.
      await vi.advanceTimersByTimeAsync(renewLeadMs - 100);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Only after ~renewLeadMs does the next attempt run.
      await vi.advanceTimersByTimeAsync(200);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      live.stop();
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("applies an inbound patch to the matching store", () => {
    const registry = createModelRegistry();
    registry.model(postModel).setMany([{ id: "1", title: "old" }]);
    const { transport, deliver } = fakeTransport();
    createLiveClient({ registry, transport });
    deliver(patch("post", "1", { id: "1", title: "new" }));
    expect(registry.model(postModel).getValue("1")).toEqual({ id: "1", title: "new" });
  });

  it("counts stale signals per channel and resets", () => {
    const registry = createModelRegistry();
    const { transport, deliver } = fakeTransport();
    const live = createLiveClient({ registry, transport });
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
    createLiveClient({ registry, transport });
    expect(() => deliver(stale("unknown"))).not.toThrow();
  });

  it("ignores a patch for a store that is not in the registry (no-op)", () => {
    const registry = createModelRegistry();
    const { transport, deliver } = fakeTransport();
    createLiveClient({ registry, transport });
    expect(() => deliver(patch("nonexistent", "1", { id: "1" }))).not.toThrow();
  });
});

afterEach(() => {
  delete (globalThis as { __RXFY_SSR__?: unknown }).__RXFY_SSR__;
});
