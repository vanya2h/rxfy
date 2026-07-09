import { patch, stale } from "rxfy-protocol";
import { createInMemoryHub } from "rxfy-server";
import { describe, expect, it } from "vitest";
import { createWsClient, type WebSocketLike } from "./client.js";
import { createWsServer, type ServerSocket } from "./server.js";

/** An in-process socket pair: the client's WebSocketLike wired directly to a ServerSocket. */
function socketPair(server: ReturnType<typeof createWsServer>) {
  const serverListeners = new Map<string, (...args: unknown[]) => void>();
  const clientListeners = new Map<string, Array<(event: unknown) => void>>();
  const serverSocket: ServerSocket = {
    send: (data) => {
      for (const l of clientListeners.get("message") ?? []) l({ data });
    },
    on: (event, listener) => void serverListeners.set(event, listener),
  };
  const clientSocket: WebSocketLike = {
    readyState: 1,
    send: (data: string) => serverListeners.get("message")?.(data),
    close: () => serverListeners.get("close")?.(),
    addEventListener: (type, listener) => {
      const list = clientListeners.get(type) ?? [];
      list.push(listener);
      clientListeners.set(type, list);
      if (type === "open") listener({}); // already open
    },
  };
  server.handleConnection(serverSocket);
  return clientSocket;
}

describe("ws client/server integration", () => {
  it("hello binds; serve-path subscriptions flow patches and stales to the client", () => {
    const hub = createInMemoryHub();
    const server = createWsServer(hub);
    const transport = createWsClient({ url: "ws://x", WebSocketImpl: () => socketPair(server) });

    hub.subscribe("s1", ["e:todo:1", "c:todos"]); // what the serve path would write
    transport.hello("s1");

    const seen: unknown[] = [];
    transport.onMessage((m) => seen.push(m));
    hub.publish("e:todo:1", patch("todo", "1", { id: "1", done: true }));
    hub.publish("c:todos", stale("todos"));

    expect(seen).toEqual([patch("todo", "1", { id: "1", done: true }), stale("todos")]);
    transport.close();
  });
});
