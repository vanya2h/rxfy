import { hello, parseClientMessage, serialize, stale } from "rxfy-protocol";
import { describe, expect, it, vi } from "vitest";
import { createWsClient, type WebSocketLike } from "./client.js";

function fakeWebSocket() {
  const sent: string[] = [];
  const listeners = new Map<string, Array<(event: unknown) => void>>();
  const ws: WebSocketLike & { open: () => void; emitClose: () => void; emitMessage: (data: string) => void } = {
    readyState: 0,
    send: (data: string) => sent.push(data),
    close: () => {},
    addEventListener: (type, listener) => {
      const list = listeners.get(type) ?? [];
      list.push(listener);
      listeners.set(type, list);
    },
    open() {
      ws.readyState = 1;
      for (const l of listeners.get("open") ?? []) l({});
    },
    emitClose() {
      ws.readyState = 3;
      for (const l of listeners.get("close") ?? []) l({});
    },
    emitMessage(data: string) {
      for (const l of listeners.get("message") ?? []) l({ data });
    },
  };
  return { ws, sent };
}

describe("createWsClient", () => {
  it("sends hello once open and replays it on reconnect", () => {
    vi.useFakeTimers();
    const sockets: ReturnType<typeof fakeWebSocket>[] = [];
    const transport = createWsClient({
      url: "ws://x",
      WebSocketImpl: () => {
        const s = fakeWebSocket();
        sockets.push(s);
        return s.ws;
      },
      reconnectDelayMs: 10,
    });

    sockets[0]!.ws.open();
    transport.hello("sess-1");
    expect(sockets[0]!.sent.map((m) => parseClientMessage(m))).toEqual([hello("sess-1")]);

    sockets[0]!.ws.emitClose();
    vi.advanceTimersByTime(10); // reconnect
    sockets[1]!.ws.open();
    expect(sockets[1]!.sent.map((m) => parseClientMessage(m))).toEqual([hello("sess-1")]);
    transport.close();
    vi.useRealTimers();
  });

  it("buffers hello until the socket opens", () => {
    const sockets: ReturnType<typeof fakeWebSocket>[] = [];
    const transport = createWsClient({
      url: "ws://x",
      WebSocketImpl: () => {
        const s = fakeWebSocket();
        sockets.push(s);
        return s.ws;
      },
    });
    transport.hello("sess-1"); // socket not open yet — nothing sent, but remembered
    expect(sockets[0]!.sent).toEqual([]);
    sockets[0]!.ws.open();
    expect(sockets[0]!.sent.map((m) => parseClientMessage(m))).toEqual([hello("sess-1")]);
    transport.close();
  });

  it("delivers parsed server messages to the handler", () => {
    const sockets: ReturnType<typeof fakeWebSocket>[] = [];
    const transport = createWsClient({
      url: "ws://x",
      WebSocketImpl: () => {
        const s = fakeWebSocket();
        sockets.push(s);
        return s.ws;
      },
    });
    const seen: unknown[] = [];
    transport.onMessage((m) => seen.push(m));
    sockets[0]!.ws.emitMessage(serialize(stale("todos")));
    expect(seen).toEqual([stale("todos")]);
    transport.close();
  });
});
