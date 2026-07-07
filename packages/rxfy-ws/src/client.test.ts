import { parseClientMessage, patch, serialize, type ServerMessage } from "rxfy-protocol";
import { describe, expect, it } from "vitest";
import { createWsClient, type WebSocketLike } from "./client.js";

class FakeWs implements WebSocketLike {
  static OPEN = 1;
  readyState = 0;
  sent: string[] = [];
  private listeners = new Map<string, Set<(event: unknown) => void>>();
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
    this.dispatch("close", {});
  }
  addEventListener(type: string, listener: (event: unknown) => void) {
    let set = this.listeners.get(type);
    if (!set) this.listeners.set(type, (set = new Set()));
    set.add(listener);
  }
  removeEventListener(type: string, listener: (event: unknown) => void) {
    this.listeners.get(type)?.delete(listener);
  }
  dispatch(type: string, event: unknown) {
    this.listeners.get(type)?.forEach((l) => l(event));
  }
  open() {
    this.readyState = 1;
    this.dispatch("open", {});
  }
  deliver(message: ServerMessage) {
    this.dispatch("message", { data: serialize(message) });
  }
}

function setup() {
  const created: FakeWs[] = [];
  const transport = createWsClient({
    url: "ws://test",
    WebSocketImpl: () => {
      const ws = new FakeWs();
      created.push(ws);
      return ws;
    },
    reconnectDelayMs: 5,
  });
  return { transport, created, ws: (): FakeWs => created[created.length - 1]! };
}

const frames = (ws: FakeWs) => ws.sent.map((s) => parseClientMessage(s));

describe("createWsClient", () => {
  it("replays subscriptions made before the socket opens", () => {
    const { transport, ws } = setup();
    transport.subscribe(["a", "b"]);
    expect(ws().sent).toEqual([]);
    ws().open();
    expect(frames(ws())).toEqual([{ v: 1, kind: "subscribe", ids: ["a", "b"] }]);
  });

  it("sends a subscribe frame immediately when already open", () => {
    const { transport, ws } = setup();
    ws().open();
    transport.subscribe(["a"]);
    expect(frames(ws())).toEqual([{ v: 1, kind: "subscribe", ids: ["a"] }]);
  });

  it("sends an unsubscribe frame when open", () => {
    const { transport, ws } = setup();
    ws().open();
    transport.subscribe(["a"]);
    transport.unsubscribe(["a"]);
    expect(frames(ws())).toEqual([
      { v: 1, kind: "subscribe", ids: ["a"] },
      { v: 1, kind: "unsubscribe", ids: ["a"] },
    ]);
  });

  it("surfaces inbound ServerMessages to the handler", () => {
    const { transport, ws } = setup();
    const received: ServerMessage[] = [];
    transport.onMessage((m) => received.push(m));
    ws().open();
    const msg = patch("post", "1", { id: "1" });
    ws().deliver(msg);
    expect(received).toEqual([msg]);
  });

  it("ignores malformed inbound data without throwing", () => {
    const { transport, ws } = setup();
    const received: ServerMessage[] = [];
    transport.onMessage((m) => received.push(m));
    ws().open();
    expect(() => ws().dispatch("message", { data: "{garbage" })).not.toThrow();
    expect(received).toEqual([]);
  });
});

describe("createWsClient reconnect", () => {
  it("opens a new socket and replays active subscriptions after a drop", async () => {
    const { transport, created, ws } = setup();
    ws().open();
    transport.subscribe(["a", "b"]);
    transport.unsubscribe(["b"]);
    ws().dispatch("close", {});
    await new Promise((r) => setTimeout(r, 15));
    expect(created.length).toBe(2);
    created[1]!.open();
    expect(frames(created[1]!)).toEqual([{ v: 1, kind: "subscribe", ids: ["a"] }]);
    transport.close();
  });

  it("does not reconnect after close() is called", async () => {
    const { transport, created, ws } = setup();
    ws().open();
    transport.close();
    await new Promise((r) => setTimeout(r, 15));
    expect(created.length).toBe(1);
  });
});
